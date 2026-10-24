                                                               
  
                                                       
  
                                            
                                            
                                                           
  
                
                                                
                                                                          
                            
                                       
  
                                              

const { expect } = require("chai");
const hre = require("hardhat");
const ethers = require("ethers");
const fs = require("fs");
const path = require("path");

                                         
const E2ECore = require("../web/e2e_core.js");

async function expectRevert(promise, label, reasonSubstr) {
  try {
    await promise;
    console.log(`[FAIL] ${label}: 未 revert`);
    return false;
  } catch (e) {
    const msg = e.shortMessage || e.message || String(e);
    const ok = !reasonSubstr || msg.includes(reasonSubstr);
    console.log(`[${ok ? "PASS" : "FAIL"}] ${label}: revert -> ${msg.slice(0, 90)}`);
    return ok;
  }
}

                                   
function toSample(r) {
  return {
    recordId: r.recordId, cellId: r.cellId, year: r.year,
    lon: r.lon, lat: r.lat, npp: r.npp, nppUnit: r.nppUnit,
    sourceHash: r.sourceHash, evidenceRef: r.evidenceRef,
    methodVersion: r.methodVersion, attributionStatus: r.attributionStatus,
    mlReview: {
      score: r.nppMlReview.score,
      flag: r.nppMlReview.flag,
      interpretationStatus: r.nppMlReview.interpretationStatus,
    },
  };
}

describe("EvidenceAnchor — NPP 描述性证据端到端闭环 (本地 EVM)", function () {
  let provider, owner, anchor;
  let records;
  let targetRec;

  before(async () => {
    provider = new ethers.BrowserProvider(hre.network.provider);
    owner = await provider.getSigner(0);

    const recPath = path.join(__dirname, "..", "evidence", "npp_evidence_records.json");
    records = JSON.parse(fs.readFileSync(recPath, "utf-8")).records;
                                         
    targetRec = records.find((r) => r.nppMlReview.interpretationStatus === "结构性断点待核")
      || records[0];
  });

  beforeEach(async () => {
    const artifact = await hre.artifacts.readArtifact("EvidenceAnchor");
    const F = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    anchor = await F.deploy();
    await anchor.waitForDeployment();
  });

  it("部署后唯一允许类别为 DESCRIPTIVE_NPP_ONLY（拒绝 REMOVAL/碳信用）", async () => {
    const req = await anchor.REQUIRED_DECLARATION();
    expect(req).to.equal("DESCRIPTIVE_NPP_ONLY");
    expect(await anchor.isAllowedCategory("DESCRIPTIVE_NPP_ONLY")).to.equal(true);
    expect(await anchor.isAllowedCategory("REMOVAL")).to.equal(false);
    expect(await anchor.isAllowedCategory("CARBON_CREDIT")).to.equal(false);
    expect(await anchor.isAllowedCategory("GOVERNANCE_INCREMENT")).to.equal(false);
  });

  it("锚定真实 NPP 证据包 → 从链上读回并与本地重算哈希一致（闭环通过）", async () => {
    const pkg = E2ECore.buildPackage(toSample(targetRec));
    const h = pkg.packHash;

    const tx = await anchor.anchorEvidence(h, pkg.payload.methodVersion, pkg.payload.declarationCategory);
    await tx.wait();

    const [onHash, onMethod, onDecl, onSubmit, onTs, onExists] = await anchor.getAnchor(h);
    expect(onExists).to.equal(true);
    expect(onHash).to.equal(h);                                                    
    expect(onMethod).to.equal("CarbonSat-NPP-Evidence-v1.0");
    expect(onDecl).to.equal("DESCRIPTIVE_NPP_ONLY");                                    
    expect(onSubmit).to.equal(await owner.getAddress());

                                
    const reHash = E2ECore.keccakHex(pkg.payload);
    expect(reHash).to.equal(onHash);
  });

  it("非 DESCRIPTIVE_NPP_ONLY 类别一律 revert（合约层杜绝越权）", async () => {
    const h = E2ECore.buildPackage(toSample(targetRec)).packHash;
    await expectRevert(
      anchor.anchorEvidence(h, "CarbonSat-NPP-Evidence-v1.0", "REMOVAL"),
      "拒绝 REMOVAL 类别", "only DESCRIPTIVE_NPP_ONLY allowed"
    );
    await expectRevert(
      anchor.anchorEvidence(h, "CarbonSat-NPP-Evidence-v1.0", "CARBON_CREDIT"),
      "拒绝 CARBON_CREDIT 类别", "only DESCRIPTIVE_NPP_ONLY allowed"
    );
  });

  it("重复锚定同一包哈希 revert（幂等保护）", async () => {
    const h = E2ECore.buildPackage(toSample(targetRec)).packHash;
    await (await anchor.anchorEvidence(h, "CarbonSat-NPP-Evidence-v1.0", "DESCRIPTIVE_NPP_ONLY")).wait();
                                                            
                                                
    const reverted = await expectRevert(
      anchor.anchorEvidence(h, "CarbonSat-NPP-Evidence-v1.0", "DESCRIPTIVE_NPP_ONLY"),
      "重复锚定同一包 revert"
    );
    expect(reverted).to.equal(true);
  });

  it("本地证据被改动后：重算哈希与链上不符 → 核验失败（篡改反例）", async () => {
    const pkg = E2ECore.buildPackage(toSample(targetRec));
    const h = pkg.packHash;
    await (await anchor.anchorEvidence(h, pkg.payload.methodVersion, pkg.payload.declarationCategory)).wait();

                                
    const tampered = JSON.parse(JSON.stringify(pkg));
    tampered.payload.npp = (parseFloat(pkg.payload.npp) + 0.05).toFixed(6);
    const hBad = E2ECore.keccakHex(tampered.payload);

                                
    expect(hBad).to.not.equal(h);

                                     
    const [, , , , , existsBad] = await anchor.getAnchor(hBad);
    expect(existsBad).to.equal(false);

                               
    const onChainHash = (await anchor.getAnchor(h))[0];
    const verifyOk = (hBad === onChainHash);
    expect(verifyOk).to.equal(false);
    console.log(`[PASS] 篡改反例：本地改动后 packHash ${hBad.slice(0, 12)}… ≠ 链上 ${onChainHash.slice(0, 12)}… → 核验失败`);
  });

  it("多条不同记录可分别锚定，各自独立核验", async () => {
    const recs = records.slice(0, 5);
    for (const r of recs) {
      const p = E2ECore.buildPackage(toSample(r));
      const h = p.packHash;
      await (await anchor.anchorEvidence(h, p.payload.methodVersion, p.payload.declarationCategory)).wait();
      const [, , onDecl, , , ex] = await anchor.getAnchor(h);
      expect(ex).to.equal(true);
      expect(onDecl).to.equal("DESCRIPTIVE_NPP_ONLY");
    }
  });
});
