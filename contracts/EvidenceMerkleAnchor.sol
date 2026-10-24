// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";


contract EvidenceMerkleAnchor is AccessControl {
    bytes32 public constant ANCHORER_ROLE = keccak256("ANCHORER_ROLE");


    string public constant REQUIRED_DECLARATION = "DESCRIPTIVE_NPP_ONLY";


    string public constant MERKLE_SPEC_VERSION = "npp-merkle-batch-v2";


    string public constant INTERNAL_NODE_SPEC =
        "keccak256(left || right) (ordered by position, non-commutative); node = H(child_even, child_odd)";


    string public constant PATH_FOLD_SPEC =
        "cur := ((index >> k) & 1) == 0 ? H(cur, sib_k) : H(sib_k, cur)";

    struct BatchAnchor {
        bytes32 root;
        uint16 leafCount;
        uint8 depth;
        bytes32 recordSetSha256;
        string methodVersion;
        string declarationCategory;
        address submitter;
        uint64 timestamp;
        bool exists;
    }


    mapping(bytes32 => BatchAnchor) private batches;

    event BatchAnchored(
        bytes32 indexed root,
        uint16 leafCount,
        uint8 depth,
        bytes32 recordSetSha256,
        string methodVersion,
        string declarationCategory,
        address indexed submitter,
        uint64 timestamp
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ANCHORER_ROLE, msg.sender);
    }


    function anchorBatch(
        bytes32 root,
        uint16 leafCount,
        uint8 depth,
        bytes32 recordSetSha256,
        string calldata methodVersion,
        string calldata declarationCategory
    ) external onlyRole(ANCHORER_ROLE) {
        require(root != bytes32(0), "zero root");
        require(leafCount > 0, "empty leafCount");
        require(depth == _depthFor(leafCount), "depth/leafCount mismatch");
        require(bytes(methodVersion).length > 0, "empty methodVersion");

        require(
            keccak256(bytes(declarationCategory)) == keccak256(bytes(REQUIRED_DECLARATION)),
            "only DESCRIPTIVE_NPP_ONLY allowed"
        );
        require(!batches[root].exists, "already anchored");

        batches[root] = BatchAnchor({
            root: root,
            leafCount: leafCount,
            depth: depth,
            recordSetSha256: recordSetSha256,
            methodVersion: methodVersion,
            declarationCategory: declarationCategory,
            submitter: msg.sender,
            timestamp: uint64(block.timestamp),
            exists: true
        });
        emit BatchAnchored(root, leafCount, depth, recordSetSha256, methodVersion,
                           declarationCategory, msg.sender, uint64(block.timestamp));
    }


    function verifyLeaf(
        bytes32 root,
        bytes32 leaf,
        uint256 index,
        uint16 leafCount,
        uint8 depth,
        bytes32[] calldata proof
    ) external view returns (bool) {
        BatchAnchor storage b = batches[root];
        if (!b.exists) return false;
        if (b.leafCount != leafCount || b.depth != depth) return false;
        if (index >= leafCount) return false;
        if (proof.length != depth) return false;
        return _fold(leaf, index, proof) == root;
    }


    function foldPositional(bytes32 leaf, uint256 index, bytes32[] calldata proof)
        external pure returns (bytes32)
    {
        return _fold(leaf, index, proof);
    }


    function _fold(bytes32 leaf, uint256 index, bytes32[] calldata proof)
        private pure returns (bytes32 cur)
    {
        cur = leaf;
        for (uint256 k = 0; k < proof.length; k++) {
            if (((index >> k) & 1) == 0) {
                cur = keccak256(abi.encodePacked(cur, proof[k]));
            } else {
                cur = keccak256(abi.encodePacked(proof[k], cur));
            }
        }
    }


    function getBatchAnchor(bytes32 root)
        external view
        returns (bytes32, uint16, uint8, bytes32, string memory, string memory, address, uint64, bool)
    {
        BatchAnchor storage b = batches[root];
        return (b.root, b.leafCount, b.depth, b.recordSetSha256, b.methodVersion,
                b.declarationCategory, b.submitter, b.timestamp, b.exists);
    }


    function depthFor(uint16 leafCount) external pure returns (uint8) {
        return _depthFor(leafCount);
    }

    function _depthFor(uint16 leafCount) private pure returns (uint8 d) {
        uint32 p = 1;
        while (p < leafCount) {
            p <<= 1;
            d++;
        }
    }
}
