                                                     
                                                       
  
                             
                                                                   
                                                                                              
                                                                            
  
                                                                           
                                         

const { expect } = require("chai");
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const ethers = require("ethers");

describe("CarbonSat-MRV — cross-layer integration (records.json ↔ contract fingerprint)", function () {
  let provider, owner;
  let artifact, mrv;
  let records;

                                                                        
  function expectedClaimId(c) {
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "uint16", "uint8"],
      [c.projectId, c.geometryHash, c.vintage, c.claimType]
    );
    return ethers.keccak256(enc);
  }

  before(async () => {
    provider = new ethers.BrowserProvider(hre.network.provider);
    owner = await provider.getSigner(0);
    const rp = path.join(__dirname, "..", "web", "records.json");
    records = JSON.parse(fs.readFileSync(rp, "utf-8"));
  });

  beforeEach(async () => {
    artifact = await hre.artifacts.readArtifact("CarbonMRV");
    const F = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    mrv = await F.deploy();
    await mrv.waitForDeployment();
                                        
    expect(await mrv.hasRole(await mrv.VERIFIER_ROLE(), await owner.getAddress())).to.equal(true);
  });

  it("Layer A=B: 每条 records.json claimId 都等于合约 abi.encode 指纹", function () {
    expect(records.claims.length).to.be.greaterThan(0);
    for (const c of records.claims) {
      const exp = expectedClaimId(c);
      expect(exp).to.equal(c.claimId, `claimId 不匹配 ${c.claimTypeName} ${c.vintage}`);
    }
  });

  it("Layer A→B→C 往返：用 off-chain claimId 注册并可挂载空间索引（证明 register.js 链路成立）", async function () {
    const c = records.claims[0];
    const exp = expectedClaimId(c);

                              
    const input = {
      projectId: c.projectId,
      geometryHash: c.geometryHash,
      vintage: c.vintage,
      methodologyVersion: ethers.encodeBytes32String(records.methodologyVersion.slice(0, 31)),
      claimType: c.claimType,
      sensor: c.sensor,
      resolutionEra: c.resolutionEra,
      carbon: c.carbon_tokens,                                                  
      uncertainty: Math.round(c.uncertainty * 10000),             
      evidenceConfidence: c.evidenceConfidence,
      anomalyStatus: c.anomalyStatus,
      registrable: c.registrable === true,                                         
      evidenceCID: c.evidenceRef,                                                      
    };

    const tx = await mrv.registerEvidence(input);
    const rcpt = await tx.wait();

                                                                                       
    const ev = rcpt.logs
      .map((l) => { try { return mrv.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "ParcelEvidenceRegistered");
    expect(ev, "未捕获 ParcelEvidenceRegistered 事件").to.not.equal(null);
    expect(ev.args.claimId).to.equal(exp);
    expect(ev.args.claimId).to.equal(c.claimId);

                                                                          
    const cells = c.spatialCells.map((s) => ethers.encodeBytes32String(s.slice(0, 31)));
    await mrv.attachSpatialIndex(exp, cells);

                  
    const summary = await mrv.getRecordSummary(exp);
    expect(summary.vintage).to.equal(BigInt(c.vintage));
    expect(summary.carbon).to.equal(BigInt(c.carbon_tokens));
                                                                              
    const expectStatus = (c.registrable === true && c.anomalyStatus === 0) ? 3n : 2n;
    expect(summary.status).to.equal(expectStatus);
  });

  it("诚实不变量：insufficient_evidence 时不存在 FLOW/REMOVAL 主张（未伪造正碳移除）", function () {
    expect(records.honesty.attributionConclusion).to.equal("insufficient_evidence");
    const flows = records.claims.filter((c) => c.claimClass === "FLOW");
    expect(flows.length, "不应存在 FLOW 主张").to.equal(0);
  });
});
