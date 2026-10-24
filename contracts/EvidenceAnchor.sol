// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/AccessControl.sol";


contract EvidenceAnchor is AccessControl {
    bytes32 public constant ANCHORER_ROLE = keccak256("ANCHORER_ROLE");


    string public constant REQUIRED_DECLARATION = "DESCRIPTIVE_NPP_ONLY";

    struct Anchor {
        bytes32 packHash;
        string methodVersion;
        string declarationCategory;
        address submitter;
        uint64 timestamp;
        bool exists;
    }

    mapping(bytes32 => Anchor) private anchors;

    event EvidenceAnchored(
        bytes32 indexed packHash,
        string methodVersion,
        string declarationCategory,
        address indexed submitter,
        uint64 timestamp
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ANCHORER_ROLE, msg.sender);
    }


    function anchorEvidence(
        bytes32 packHash,
        string calldata methodVersion,
        string calldata declarationCategory
    ) external onlyRole(ANCHORER_ROLE) {
        require(packHash != bytes32(0), "zero packHash");
        require(bytes(methodVersion).length > 0, "empty methodVersion");

        require(
            keccak256(bytes(declarationCategory)) == keccak256(bytes(REQUIRED_DECLARATION)),
            "only DESCRIPTIVE_NPP_ONLY allowed"
        );
        require(!anchors[packHash].exists, "already anchored");

        anchors[packHash] = Anchor({
            packHash: packHash,
            methodVersion: methodVersion,
            declarationCategory: declarationCategory,
            submitter: msg.sender,
            timestamp: uint64(block.timestamp),
            exists: true
        });
        emit EvidenceAnchored(
            packHash, methodVersion, declarationCategory, msg.sender, uint64(block.timestamp)
        );
    }


    function getAnchor(bytes32 packHash)
        external view
        returns (bytes32, string memory, string memory, address, uint64, bool)
    {
        Anchor storage a = anchors[packHash];
        return (a.packHash, a.methodVersion, a.declarationCategory, a.submitter, a.timestamp, a.exists);
    }


    function isAllowedCategory(string calldata declarationCategory)
        external pure returns (bool)
    {
        return keccak256(bytes(declarationCategory)) == keccak256(bytes(REQUIRED_DECLARATION));
    }
}
