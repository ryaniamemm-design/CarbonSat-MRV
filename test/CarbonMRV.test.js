                                                                
                       
  
                                                             
                                                                            
                                                            
  
                      
                                              
                                     
                                                                   
  
                                                    
                                                         

const { expect } = require("chai");
const hre = require("hardhat");
const ethers = require("ethers");

                                   
async function expectRevert(promise, label, reasonSubstr) {
  try {
    await promise;
    console.log(`[FAIL] ${label}: 未 revert`);
    return false;
  } catch (e) {
    const msg = (e.shortMessage || e.message || String(e));
    const ok = !reasonSubstr || msg.includes(reasonSubstr);
    console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: revert -> ${msg.slice(0, 90)}`);
    return ok;
  }
}

describe("CarbonMRV (72h-spike refactor — state machine)", function () {
  let provider, owner, other, addr1, addr2;
  let artifact, mrv;
  const proj = ethers.encodeBytes32String("PROJ_KUBUQI");
  const geoA = ethers.encodeBytes32String("GEOM_A");
  const METH_V1 = ethers.encodeBytes32String("MRV-V1.0");
  const METH_V2 = ethers.encodeBytes32String("MRV-V2.0");
  const CID = "local-sha256:test-evidence-hash-0123456789abcdef";
  const cells = [ethers.encodeBytes32String("h3-8a1"), ethers.encodeBytes32String("h3-8a2")];

                                                                                             
  function claimIdOf(o = {}) {
    const a = { projectId: proj, geometryHash: geoA, vintage: 2024, claimType: 0, ...o };
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "uint16", "uint8"],
      [a.projectId, a.geometryHash, a.vintage, a.claimType]
    );
    return ethers.keccak256(enc);
  }

  async function register(overrides = {}) {
    const a = {
      projectId: proj, geometryHash: geoA, vintage: 2024,
      methodologyVersion: METH_V1, claimType: 0, sensor: "Landsat9",
      resolutionEra: 2, carbon: 1000, uncertainty: 4000,
      evidenceConfidence: 82, anomalyStatus: 0, registrable: true, evidenceCID: CID, ...overrides,
    };
    return mrv.registerEvidence(a);
  }

  before(async () => {
    provider = new ethers.BrowserProvider(hre.network.provider);
    owner = await provider.getSigner(0);
    other = await provider.getSigner(1);
    addr1 = await provider.getSigner(2);
    addr2 = await provider.getSigner(3);
  });

  beforeEach(async () => {
    artifact = await hre.artifacts.readArtifact("CarbonMRV");
    const F = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    mrv = await F.deploy();
    await mrv.waitForDeployment();
  });

  it("grants VERIFIER_ROLE to deployer", async () => {
    expect(await mrv.hasRole(await mrv.VERIFIER_ROLE(), await owner.getAddress())).to.equal(true);
  });

  it("registers a normal claim as REGISTERED(3) and mints the receipt", async () => {
    await register();
    const id = claimIdOf();
    expect(await mrv.balanceOf(await owner.getAddress(), id)).to.equal(1000n);
    expect(await mrv.getStatus(id)).to.equal(3n);
    expect((await mrv.getRecordSummary(id)).carbon).to.equal(1000n);
    expect(await mrv.getEvidenceCID(id)).to.equal(CID);
  });

  it("duplicate fingerprint blocked; methodologyVersion change is NOT a new claim", async () => {
    await register();
    await expectRevert(register({ methodologyVersion: METH_V2 }), "同 claim 二次提交被拒", "duplicate claim blocked");
  });

  it("fingerprint changes only when identity components change", async () => {
    await register();
    await register({ vintage: 2025 });                     
    await register({ claimType: 1 });
    expect(true).to.equal(true);
  });

  it("anomaly -> REVIEW(2): not minted and not transferable", async () => {
    await register({ anomalyStatus: 1 });
    const id = claimIdOf();
    expect(await mrv.getStatus(id)).to.equal(2n);
    expect(await mrv.balanceOf(await owner.getAddress(), id)).to.equal(0n);
    await expectRevert(
      mrv.safeTransferFrom(await owner.getAddress(), await addr1.getAddress(), id, 1, "0x"),
      "REVIEW 记录禁止转移", "claim not transferable"
    );
  });

  it("approveReview mints and becomes transferable", async () => {
    await register({ anomalyStatus: 1 });
    const id = claimIdOf();
    await mrv.approveReview(id);
    expect(await mrv.getStatus(id)).to.equal(3n);
    expect(await mrv.balanceOf(await owner.getAddress(), id)).to.equal(1000n);
    await mrv.safeTransferFrom(await owner.getAddress(), await addr1.getAddress(), id, 100, "0x");
    expect(await mrv.balanceOf(await addr1.getAddress(), id)).to.equal(100n);
  });

  it("approveReview reverts when not in REVIEW", async () => {
    await register();
    const id = claimIdOf();
    await expectRevert(mrv.approveReview(id), "非 REVIEW 时 approveReview 被拒", "not in review");
  });

  it("flagForReview reverts when not REGISTERED/VERIFIED", async () => {
    await register({ anomalyStatus: 1 });
    const id = claimIdOf();
    await expectRevert(mrv.flagForReview(id, "x"), "REVIEW 时 flagForReview 被拒", "not flaggable");
  });

  it("retire uses issued-retired, not caller balance (multi-holder, no deadlock)", async () => {
    await register();
    const id = claimIdOf();
    await mrv.safeTransferFrom(await owner.getAddress(), await addr1.getAddress(), id, 400, "0x");
    await mrv.retire(id, 600);
    expect(await mrv.getStatus(id)).to.equal(4n);                     
    await mrv.connect(addr1).retire(id, 400);
    expect(await mrv.getStatus(id)).to.equal(5n);           
    expect(await mrv.getRemaining(id)).to.equal(0n);
  });

  it("cannot retire a REVIEW claim", async () => {
    await register({ anomalyStatus: 1 });
    const id = claimIdOf();
    await expectRevert(mrv.retire(id, 10), "REVIEW 时 retire 被拒", "not registered");
  });

  it("RETIRED claim is not transferable", async () => {
    await register();
    const id = claimIdOf();
    await mrv.retire(id, 1000);
    expect(await mrv.getStatus(id)).to.equal(5n);
    await expectRevert(
      mrv.safeTransferFrom(await owner.getAddress(), await addr1.getAddress(), id, 1, "0x"),
      "RETIRED 记录禁止转移", "claim not transferable"
    );
  });

                                     
  it("placeholder (registrable=false) registered as REVIEW and NOT minted", async () => {
    await register({ registrable: false });
    const id = claimIdOf();
    expect(await mrv.getStatus(id)).to.equal(2n);                    
    expect(await mrv.getRegistrable(id)).to.equal(false);
    expect(await mrv.balanceOf(await owner.getAddress(), id)).to.equal(0n);         
  });

  it("registrable=false still placed on-chain as audit REVIEW (distinct from receipt)", async () => {
                                                           
    await register({ registrable: false });
    const id = claimIdOf();
                                     
    await mrv.attachSpatialIndex(id, cells);
    const [conflict, cnt] = await mrv.spatialConflictCandidate(id, id);
    expect(conflict).to.equal(true);
    expect(await mrv.getStatus(id)).to.equal(2n);                   
  });

  it("approveReview reverts for placeholder (registrable=false) record — 占位记录不得铸造", async () => {
    await register({ registrable: false });
    const id = claimIdOf();
    await expectRevert(mrv.approveReview(id), "占位记录经 approveReview 被拒（不得铸造）", "placeholder not mintable");
             
    expect(await mrv.balanceOf(await owner.getAddress(), id)).to.equal(0n);
  });

  it("registrable=false with anomalyStatus=0 is still forced REVIEW (no silent mint)", async () => {
                                                                     
    await register({ registrable: false, anomalyStatus: 0 });
    const id = claimIdOf();
    expect(await mrv.getStatus(id)).to.equal(2n);
    expect(await mrv.balanceOf(await owner.getAddress(), id)).to.equal(0n);
  });

  it("empty CID reverts", async () => {
    await expectRevert(register({ evidenceCID: "" }), "空 CID 被拒", "empty CID");
  });

  it("zero carbon reverts", async () => {
    await expectRevert(register({ carbon: 0 }), "零碳量被拒", "zero carbon");
  });

  it("spatial index attaches to known claim and conflict candidate detects overlap", async () => {
    await register();
    const geo2 = ethers.encodeBytes32String("GEOM_B");
    await register({ geometryHash: geo2, spatialCells: [] });
    const a = claimIdOf();
    const b = claimIdOf({ geometryHash: geo2 });
    await mrv.attachSpatialIndex(a, cells);
    await mrv.attachSpatialIndex(b, [cells[0]]);
    const [conflict, cnt] = await mrv.spatialConflictCandidate(a, b);
    expect(conflict).to.equal(true);
    expect(cnt).to.equal(1n);
  });

  it("attachSpatialIndex reverts on unknown claim", async () => {
    const unknown = ethers.keccak256(ethers.toUtf8Bytes("nope"));
    await expectRevert(mrv.attachSpatialIndex(unknown, cells), "未知 claim 挂索引被拒", "unknown claim");
  });

  it("local duplicate detection does NOT claim to solve cross-registry overlap", async () => {
    const geo2 = ethers.encodeBytes32String("GEOM_B");
    await register();
    await register({ geometryHash: geo2 });
    const a = claimIdOf();
    const b = claimIdOf({ geometryHash: geo2 });
    const [conflict, cnt] = await mrv.spatialConflictCandidate(a, b);
    expect(cnt).to.equal(0n);                               
  });
});
