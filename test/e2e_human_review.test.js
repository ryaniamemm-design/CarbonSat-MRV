                           
  
                                                                                
                                  
  
      
                                                     
                             
                                        
                                                                             
                            
  
                                                    

const E2ECore = require("../web/e2e_core.js");
const fs = require("fs");
const path = require("path");

function loadTargets() {
  const p = path.join(__dirname, "..", "web", "review_targets.json");
  return JSON.parse(fs.readFileSync(p, "utf8")).records;
}
function mkReview(code, basis) {
  return { opinionCode: code, basis: basis || "测试依据", reviewer: "tester", timestamp: "2026-10-06T00:00:00.000Z" };
}

describe("NPP 人工复核记录（与网页 e2e_core.js 同一套代码）", function () {
  const targets = loadTargets();
  const ordinary = targets.find((r) => r.mlReview.interpretationStatus === "建议复核");
  const structural = targets.find((r) => r.mlReview.interpretationStatus === "结构性断点待核");
  const codes = ["DATA_ISSUE_PENDING", "INSUFFICIENT_EVIDENCE", "VERIFIED_NO_ATTRIBUTION"];

  it("目标数据含两类记录（普通 ML 标记 + 2012 结构性断点）", function () {
    if (!ordinary) throw new Error("缺少普通 ML 标记记录");
    if (!structural) throw new Error("缺少 2012 结构性断点记录");
    if (ordinary.year === 2012) throw new Error("普通记录不应是 2012");
    if (structural.year !== 2012) throw new Error("结构性断点记录应为 2012");
  });

  it("两类记录 × 三类意见：build 后 verifyReviewRecord 通过", function () {
    for (const rec of [ordinary, structural]) {
      for (const code of codes) {
        const rr = E2ECore.buildReviewRecord(rec, mkReview(code));
        const v = E2ECore.verifyReviewRecord(rr);
        if (!v.ok) throw new Error("[" + rec.recordId + "/" + code + "] 应核验通过：" + v.reason);
                            
        if (rr.evidenceContext.attributionStatus !== "insufficient_evidence")
          throw new Error("attributionStatus 不应改变");
      }
    }
  });

  it("篡改意见：verifyReviewRecord 失败，且原记录对象未被改动", function () {
    const rr = E2ECore.buildReviewRecord(ordinary, mkReview("INSUFFICIENT_EVIDENCE"));
    const before = JSON.stringify(rr);
    const clone = JSON.parse(JSON.stringify(rr));
    clone.review.opinion = "VERIFIED_NO_ATTRIBUTION";
    clone.review.opinionLabel = E2ECore.REVIEW_OPINION_TYPES.VERIFIED_NO_ATTRIBUTION.label;
    const v = E2ECore.verifyReviewRecord(clone);
    if (v.ok) throw new Error("篡改意见后不应通过核验");
    if (JSON.stringify(rr) !== before) throw new Error("原审查记录对象被意外改动");
  });

  it("篡改 evidenceContext（原始 NPP）：verifyReviewRecord 失败", function () {
    const rr = E2ECore.buildReviewRecord(structural, mkReview("VERIFIED_NO_ATTRIBUTION"));
    const clone = JSON.parse(JSON.stringify(rr));
    clone.evidenceContext.npp = parseFloat(clone.evidenceContext.npp) + 0.05;
    const v = E2ECore.verifyReviewRecord(clone);
    if (v.ok) throw new Error("篡改证据 NPP 后不应通过核验");
  });

  it("审查意见与原始证据/ML 分数分开保存 + 无训练真值字段", function () {
    const rr = E2ECore.buildReviewRecord(ordinary, mkReview("DATA_ISSUE_PENDING"));
                                              
    if (typeof rr.evidenceContext !== "object") throw new Error("缺 evidenceContext");
    if (typeof rr.review !== "object") throw new Error("缺 review");
                                        
    const reviewKeys = Object.keys(rr.review);
    for (const k of ["npp", "prevNpp", "jump", "mlScore", "mlFlag", "sourceHash", "evidenceRef"]) {
      if (reviewKeys.includes(k)) throw new Error("review 不应携带证据/ML 字段：" + k);
    }
                 
    if ("groundTruth" in rr || "trainingLabel" in rr || "groundTruth" in rr.review)
      throw new Error("审查记录不得含训练真值字段");
                   
    if (typeof rr.reviewHash !== "string") throw new Error("缺 reviewHash");
  });

  it("三类意见 code→label 映射正确", function () {
    const want = {
      DATA_ISSUE_PENDING: "数据问题待核",
      INSUFFICIENT_EVIDENCE: "证据不足暂无法判断",
      VERIFIED_NO_ATTRIBUTION: "已核查但不作治理归因",
    };
    for (const code of codes) {
      const rr = E2ECore.buildReviewRecord(structural, mkReview(code));
      if (rr.review.opinion !== code) throw new Error("opinion code 不符");
      if (rr.review.opinionLabel !== want[code]) throw new Error("opinion label 不符：" + rr.review.opinionLabel);
    }
  });

  it("离线自足：vendor ethers 注入后浏览器分支可构建并核验", function () {
    const fs2 = require("fs");
    const vm = require("vm");
    const webDir = path.join(__dirname, "..", "web");
    const vendor = path.join(webDir, "vendor", "ethers.umd.min.js");
    if (!fs2.existsSync(vendor)) throw new Error("缺少本地 vendor/ethers.umd.min.js");
    const sandbox = { console, TextEncoder, TextDecoder };
    sandbox.self = sandbox; sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs2.readFileSync(vendor, "utf8"), sandbox, { filename: "ethers.umd.min.js" });
    if (typeof sandbox.ethers === "undefined" || typeof sandbox.ethers.keccak256 !== "function")
      throw new Error("vendor ethers 未暴露 keccak256");
    vm.runInContext(fs2.readFileSync(path.join(webDir, "e2e_core.js"), "utf8"), sandbox, { filename: "e2e_core.js" });
    if (!sandbox.E2ECore) throw new Error("e2e_core 浏览器分支未挂载 E2ECore");

    const rr = sandbox.E2ECore.buildReviewRecord(ordinary, mkReview("VERIFIED_NO_ATTRIBUTION"));
    if (!sandbox.E2ECore.verifyReviewRecord(rr).ok) throw new Error("浏览器分支核验应通过");
    const t = JSON.parse(JSON.stringify(rr));
    t.review.opinion = "DATA_ISSUE_PENDING";
    if (sandbox.E2ECore.verifyReviewRecord(t).ok) throw new Error("浏览器分支篡改后不应通过");
  });
});

                                                                         
                                  
                                                                         

describe("NPP 人工复核：全 816 检索范围 + 版本过期判定", function () {
  const fs = require("fs");
  const path = require("path");
  const index = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "review_index.json"), "utf8"));
  const currentPack = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "web", "current_pack.json"), "utf8"));
  const all = index.records;
  const codes = ["DATA_ISSUE_PENDING", "INSUFFICIENT_EVIDENCE", "VERIFIED_NO_ATTRIBUTION"];

  it("全 816 条记录均可构建并核验（覆盖普通年 / 2012 / 边界年）", function () {
    if (all.length !== 816) throw new Error("索引记录数应为 816，实际 " + all.length);
    let count = 0;
    for (const rec of all) {
      if (rec.year !== 2012 && rec.mlReview.flag !== 1) continue;                           
      const rr = E2ECore.buildReviewRecord(rec, { opinionCode: "INSUFFICIENT_EVIDENCE", basis: "范围测试", reviewer: "t", timestamp: "2026-10-06T00:00:00.000Z" });
      const v = E2ECore.verifyReviewRecord(rr);
      if (!v.ok) throw new Error("[" + rec.recordId + "] 应核验通过：" + v.reason);
      if (rr.evidenceContext.attributionStatus !== "insufficient_evidence") throw new Error("attributionStatus 不应改变");
                                       
      if (rr.evidenceContext.wholeBundlePackSha256 !== currentPack.wholeBundlePackSha256)
        throw new Error("未绑定当前整包哈希");
      if (rr.evidenceContext.evidenceRef !== rec.evidenceRef) throw new Error("未绑定 evidenceRef");
      count++;
    }
    if (count < 50) throw new Error("实际可构建样本过少：" + count);
  });

  it("两条验收案例（普通年 + 2012）在三类中均可通过", function () {
    const ordinary = all.find((r) => r.recordId === "cell_0020_2002");
    const structural = all.find((r) => r.recordId === "cell_0030_2012");
    if (!ordinary) throw new Error("缺少普通年验收案例 cell_0020_2002");
    if (!structural) throw new Error("缺少 2012 验收案例 cell_0030_2012");
    for (const rec of [ordinary, structural]) {
      for (const code of codes) {
        const rr = E2ECore.buildReviewRecord(rec, { opinionCode: code, basis: "验收", reviewer: "t", timestamp: "2026-10-06T00:00:00.000Z" });
        if (!E2ECore.verifyReviewRecord(rr).ok) throw new Error("[" + rec.recordId + "/" + code + "] 应核验通过");
      }
    }
  });

  it("旧意见遇新证据包（wholeBundlePackSha256 不同）→ 版本过期，但完整性仍 ok", function () {
    const rec = all.find((r) => r.recordId === "cell_0020_2002");
    const opinion = E2ECore.buildReviewRecord(rec, { opinionCode: "VERIFIED_NO_ATTRIBUTION", basis: "X", reviewer: "t", timestamp: "2026-10-06T00:00:00.000Z" });

                        
    const vsCurrent = E2ECore.reviewVersionStatus(opinion, { wholeBundlePackSha256: currentPack.wholeBundlePackSha256, methodVersion: currentPack.methodVersion });
    if (vsCurrent.stale) throw new Error("与当前包比对不应过期");

                                                 
    const NEW_PACK = "0x" + "a".repeat(64);
    const vsNew = E2ECore.reviewVersionStatus(opinion, { wholeBundlePackSha256: NEW_PACK, methodVersion: currentPack.methodVersion });
    if (!vsNew.stale) throw new Error("整包哈希变化应判定过期");
    if (!vsNew.reasons.some((r) => r.indexOf("wholeBundlePackSha256") >= 0)) throw new Error("应指出整包哈希不一致");
    if (!E2ECore.verifyReviewRecord(opinion).ok) throw new Error("过期意见仍应完整性通过（只是版本旧）");
  });

  it("旧意见遇新证据锚点（evidenceRef 不同）→ 版本过期", function () {
    const rec = all.find((r) => r.recordId === "cell_0030_2012");
    const opinion = E2ECore.buildReviewRecord(rec, { opinionCode: "INSUFFICIENT_EVIDENCE", basis: "X", reviewer: "t", timestamp: "2026-10-06T00:00:00.000Z" });
    const vs = E2ECore.reviewVersionStatus(opinion, {
      wholeBundlePackSha256: currentPack.wholeBundlePackSha256,
      methodVersion: currentPack.methodVersion,
      evidenceRef: "local-sha256:" + "f".repeat(64),                           
    });
    if (!vs.stale) throw new Error("evidenceRef 变化应判定过期");
    if (!vs.reasons.some((r) => r.indexOf("evidenceRef") >= 0)) throw new Error("应指出 evidenceRef 不一致");
  });

  it("审查意见不反写训练真值、不产生 REMOVAL", function () {
                                                  
    if ("REMOVAL" in E2ECore.REVIEW_OPINION_TYPES) throw new Error("审查意见类型不得含 REMOVAL");
    const rec = all.find((r) => r.recordId === "cell_0020_2002");
    for (const code of codes) {
      const rr = E2ECore.buildReviewRecord(rec, { opinionCode: code, basis: "X", reviewer: "t", timestamp: "2026-10-06T00:00:00.000Z" });
      if (rr.review.opinion === "REMOVAL") throw new Error("审查意见不得为 REMOVAL");
      if ("groundTruth" in rr || "groundTruth" in rr.review || "trainingLabel" in rr) throw new Error("审查记录不得含训练真值字段");
      if (rr.review.opinion !== code) throw new Error("opinion 不应被改写");
    }
  });

  it("reviewVersionStatus 对缺失上下文与一致场景正确", function () {
    const rec = all.find((r) => r.recordId === "cell_0030_2012");
    const opinion = E2ECore.buildReviewRecord(rec, { opinionCode: "DATA_ISSUE_PENDING", basis: "X", reviewer: "t", timestamp: "2026-10-06T00:00:00.000Z" });
    const vsSame = E2ECore.reviewVersionStatus(opinion, { wholeBundlePackSha256: rec.wholeBundlePackSha256, methodVersion: rec.modelVersion, evidenceRef: rec.evidenceRef });
    if (vsSame.stale) throw new Error("完全一致应判定不过期");
    const vsMissing = E2ECore.reviewVersionStatus({}, {});
    if (!vsMissing.stale) throw new Error("缺失 evidenceContext 应判过期");
  });
});
