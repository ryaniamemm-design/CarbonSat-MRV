// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";


contract CarbonMRV is ERC1155, AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum Status { OBSERVED, VERIFIED, REVIEW, REGISTERED, PARTIALLY_RETIRED, RETIRED }
    enum ClaimType { BIOMASS_STOCK, REMOVAL, REDUCTION }

    struct EvidenceRecord {
        bytes32 projectId;
        bytes32 geometryHash;
        uint16 vintage;
        bytes32 methodologyVersion;
        bytes32 methodologyHash;
        ClaimType claimType;
        string sensor;
        uint8 resolutionEra;
        uint256 carbon;
        uint256 issuedAmount;
        uint256 retiredAmount;
        uint256 uncertainty;
        uint8 evidenceConfidence;
        uint8 anomalyStatus;
        string evidenceCID;
        bytes32[] spatialCells;
        uint8 status;
        bool registrable;
    }


    struct RegisterInput {
        bytes32 projectId;
        bytes32 geometryHash;
        uint16 vintage;
        bytes32 methodologyVersion;
        uint8 claimType;
        string sensor;
        uint8 resolutionEra;
        uint256 carbon;
        uint256 uncertainty;
        uint8 evidenceConfidence;
        uint8 anomalyStatus;
        bool registrable;
        string evidenceCID;
    }

    mapping(bytes32 => bool) public uniqueClaim;


    mapping(bytes32 => EvidenceRecord) private records;

    event ParcelEvidenceRegistered(
        bytes32 indexed claimId, bytes32 indexed projectId, uint16 vintage, uint256 carbon, uint8 status
    );
    event SpatialIndexAttached(bytes32 indexed claimId, uint256 cellCount);
    event EvidenceReviewed(bytes32 indexed claimId, string note);
    event EvidenceApproved(bytes32 indexed claimId);
    event EvidenceRetired(bytes32 indexed claimId, uint256 amount, bool full);

    constructor() ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }


    function registerEvidence(RegisterInput calldata p) external onlyRole(VERIFIER_ROLE) {
        _validateInput(p);

        bytes32 claimId = _claimIdOf(p);
        require(!uniqueClaim[claimId], "duplicate claim blocked");
        uniqueClaim[claimId] = true;


        Status init = (p.anomalyStatus == 1 || !p.registrable) ? Status.REVIEW : Status.REGISTERED;

        _writeIdentity(claimId, p);
        _writeMethodology(claimId, p);
        _writeCarbon(claimId, p);
        _writeQuality(claimId, p);
        _writeSensor(claimId, p);
        _writeCID(claimId, p);
        _writeStatus(claimId, init);
        _mintIfRegistered(claimId, p, init);
        _emitRegistered(claimId, p, init);
    }


    function _claimIdOf(RegisterInput calldata p) private pure returns (bytes32) {
        return keccak256(abi.encode(p.projectId, p.geometryHash, p.vintage, p.claimType));
    }

    function _mintIfRegistered(bytes32 claimId, RegisterInput calldata p, Status init) private {
        if (init == Status.REGISTERED) {
            _mint(msg.sender, uint256(claimId), p.carbon, "");
        }
    }

    function _emitRegistered(bytes32 claimId, RegisterInput calldata p, Status init) private {
        emit ParcelEvidenceRegistered(claimId, p.projectId, p.vintage, p.carbon, uint8(init));
    }

    function _validateInput(RegisterInput calldata p) private pure {
        _validateNumbers(p);
        _validateCID(p);
    }

    function _validateNumbers(RegisterInput calldata p) private pure {
        require(p.carbon > 0, "zero carbon");
        require(p.vintage >= 1980 && p.vintage <= 2100, "bad vintage");
        require(p.evidenceConfidence <= 100, "conf>100");
    }

    function _validateCID(RegisterInput calldata p) private pure {
        require(bytes(p.evidenceCID).length > 0, "empty CID");
    }


    function _writeIdentity(bytes32 claimId, RegisterInput calldata p) private {
        EvidenceRecord storage r = records[claimId];
        r.projectId = p.projectId;
        r.geometryHash = p.geometryHash;
        r.vintage = p.vintage;
        r.claimType = ClaimType(p.claimType);
    }

    function _writeMethodology(bytes32 claimId, RegisterInput calldata p) private {
        records[claimId].methodologyVersion = p.methodologyVersion;
    }

    function _writeCarbon(bytes32 claimId, RegisterInput calldata p) private {
        EvidenceRecord storage r = records[claimId];
        r.carbon = p.carbon;
        r.issuedAmount = p.carbon;
        r.retiredAmount = 0;
        r.uncertainty = p.uncertainty;
    }

    function _writeQuality(bytes32 claimId, RegisterInput calldata p) private {
        EvidenceRecord storage r = records[claimId];
        r.resolutionEra = p.resolutionEra;
        r.evidenceConfidence = p.evidenceConfidence;
        r.anomalyStatus = p.anomalyStatus;
        r.registrable = p.registrable;
    }

    function _writeSensor(bytes32 claimId, RegisterInput calldata p) private {
        records[claimId].sensor = p.sensor;
    }

    function _writeCID(bytes32 claimId, RegisterInput calldata p) private {
        records[claimId].evidenceCID = p.evidenceCID;
    }


    function attachSpatialIndex(bytes32 claimId, bytes32[] calldata cells)
        external onlyRole(VERIFIER_ROLE)
    {
        require(uniqueClaim[claimId], "unknown claim");
        records[claimId].spatialCells = cells;
        emit SpatialIndexAttached(claimId, cells.length);
    }

    function _writeStatus(bytes32 claimId, Status s) private {
        records[claimId].status = uint8(s);
    }


    function flagForReview(bytes32 claimId, string memory note)
        external onlyRole(VERIFIER_ROLE)
    {
        uint8 st = records[claimId].status;
        require(st == uint8(Status.REGISTERED) || st == uint8(Status.VERIFIED), "not flaggable");
        records[claimId].status = uint8(Status.REVIEW);
        emit EvidenceReviewed(claimId, note);
    }

    function approveReview(bytes32 claimId) external onlyRole(VERIFIER_ROLE) {
        require(records[claimId].status == uint8(Status.REVIEW), "not in review");


        require(records[claimId].registrable, "placeholder not mintable");
        records[claimId].status = uint8(Status.REGISTERED);
        _mint(msg.sender, uint256(claimId), records[claimId].issuedAmount, "");
        emit EvidenceApproved(claimId);
    }


    function retire(bytes32 claimId, uint256 amount) external {
        uint8 st = records[claimId].status;

        require(
            st == uint8(Status.REGISTERED) || st == uint8(Status.PARTIALLY_RETIRED),
            "not registered"
        );
        require(balanceOf(msg.sender, uint256(claimId)) >= amount, "insufficient");
        _burn(msg.sender, uint256(claimId), amount);
        records[claimId].retiredAmount += amount;
        uint256 remaining = records[claimId].issuedAmount - records[claimId].retiredAmount;
        records[claimId].status = remaining == 0
            ? uint8(Status.RETIRED)
            : uint8(Status.PARTIALLY_RETIRED);
        emit EvidenceRetired(claimId, amount, remaining == 0);
    }


    function _update(address from, address to, uint256[] memory ids, uint256[] memory amounts)
        internal override
    {
        for (uint256 i = 0; i < ids.length; i++) {
            uint8 st = records[bytes32(ids[i])].status;
            if (to == address(0)) {

                require(
                    st == uint8(Status.REGISTERED) || st == uint8(Status.PARTIALLY_RETIRED),
                    "claim not burnable"
                );
            } else if (from != address(0)) {

                require(st == uint8(Status.REGISTERED), "claim not transferable");
            }
        }
        super._update(from, to, ids, amounts);
    }


    function spatialConflictCandidate(bytes32 a, bytes32 b)
        external view returns (bool hasOverlap, uint256 overlapCount)
    {
        bytes32[] storage ca = records[a].spatialCells;
        bytes32[] storage cb = records[b].spatialCells;
        uint256 cnt = 0;
        for (uint256 i = 0; i < ca.length; i++) {
            for (uint256 j = 0; j < cb.length; j++) {
                if (ca[i] == cb[j]) cnt++;
            }
        }
        return (cnt > 0, cnt);
    }


    function getStatus(bytes32 claimId) external view returns (uint8) {
        return records[claimId].status;
    }

    function getCarbon(bytes32 claimId) external view returns (uint256) {
        return records[claimId].carbon;
    }

    function getRemaining(bytes32 claimId) external view returns (uint256) {
        return records[claimId].issuedAmount - records[claimId].retiredAmount;
    }


    function getRecordSummary(bytes32 claimId) external view returns (
        bytes32 geometryHash,
        uint16 vintage,
        uint256 carbon,
        uint256 uncertainty,
        uint8 evidenceConfidence,
        uint8 status
    ) {
        EvidenceRecord storage r = records[claimId];
        return (r.geometryHash, r.vintage, r.carbon, r.uncertainty, r.evidenceConfidence, r.status);
    }

    function getEvidenceCID(bytes32 claimId) external view returns (string memory) {
        return records[claimId].evidenceCID;
    }


    function getRegistrable(bytes32 claimId) external view returns (bool) {
        return records[claimId].registrable;
    }

    function getMethodologyVersion(bytes32 claimId) external view returns (bytes32) {
        return records[claimId].methodologyVersion;
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
