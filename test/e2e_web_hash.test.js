                             
  
                                                  
                                                    
                       
  
                                                       
  
                                                

const E2ECore = require("../web/e2e_core.js");

                                
function sampleRec(over) {
  return Object.assign({
    recordId: "cell_0030_2012",
    cellId: "cell_0030",
    year: 2012,
    lon: 107.95,
    lat: 40.1,
    npp: 0.1386160279805352,
    nppUnit: "kg C·m⁻²·yr⁻¹",
    sourceHash: "local-sha256:abc",
    evidenceRef: "local-sha256:def",
    methodVersion: "CarbonSat-NPP-Evidence-v1.0",
    attributionStatus: "insufficient_evidence",
    mlReview: { score: 0.91, flag: 1, interpretationStatus: "结构性断点待核" },
  }, over || {});
}

describe("NPP 证据下载包哈希/核验（与网页 e2e_core.js 同一套代码）", function () {
  it("未篡改包：verifyLocal 通过", function () {
    const pkg = E2ECore.buildPackage(sampleRec());
    const r = E2ECore.verifyLocal(pkg);
    if (!r.ok) throw new Error("未篡改包应核验通过，但失败：" + JSON.stringify(r));
  });

  it("NPP 篡改：改动 payload.npp 后 verifyLocal 与 verifyAgainstChain 均失败", function () {
    const pkg = E2ECore.buildPackage(sampleRec());
    const tampered = JSON.parse(JSON.stringify(pkg));
    tampered.payload.npp = (parseFloat(tampered.payload.npp) + 0.05).toFixed(6);

    const local = E2ECore.verifyLocal(tampered);
    if (local.ok) throw new Error("NPP 篡改后 verifyLocal 不应通过");

    const chain = E2ECore.verifyAgainstChain(tampered, {
      packHash: pkg.packHash,
      methodVersion: pkg.payload.methodVersion,
      declarationCategory: pkg.payload.declarationCategory,
      exists: true,
    });
    if (chain.ok) throw new Error("NPP 篡改后 verifyAgainstChain 不应通过");
  });

  it("哈希元数据不进入哈希：buildPackage 生成的 payload 不含 packHash/hashAlgo（规则自证）", function () {
    const pkg = E2ECore.buildPackage(sampleRec());
                                                 
    if ("packHash" in pkg.payload) throw new Error("payload 不应含 packHash");
    if ("hashAlgo" in pkg.payload) throw new Error("payload 不应含 hashAlgo");
    const recomputed = E2ECore.keccakHex(pkg.payload);
    if (recomputed !== pkg.packHash) throw new Error("重算哈希与包内 packHash 不符");
  });

  it("无钱包：checkRegisterEnv 返回阻塞", function () {
    const r = E2ECore.checkRegisterEnv({ hasEthereum: false, contractAddress: "0xabc" });
    if (r.ok) throw new Error("无钱包应被阻塞");
  });

  it("错链：chainId≠11155111 返回阻塞", function () {
    const r = E2ECore.checkRegisterEnv({ hasEthereum: true, contractAddress: "0xabc", chainId: 1 });
    if (r.ok) throw new Error("错链应被阻塞");
  });

  it("无合约地址：checkRegisterEnv 返回阻塞", function () {
    const r = E2ECore.checkRegisterEnv({ hasEthereum: true });
    if (r.ok) throw new Error("无合约地址应被阻塞");
  });

  it("正确环境（钱包+Sepolia 链+合约地址）：checkRegisterEnv 就绪", function () {
    const r = E2ECore.checkRegisterEnv({ hasEthereum: true, contractAddress: "0xabc", chainId: 11155111 });
    if (!r.ok) throw new Error("正常环境应就绪：" + r.reason);
  });

  it("离线自足：vendor ethers 可注入全局，e2e_core 浏览器分支可加载（离线可用）", function () {
    const fs = require("fs");
    const vm = require("vm");
    const path = require("path");
    const webDir = path.join(__dirname, "..", "web");
    const vendor = path.join(webDir, "vendor", "ethers.umd.min.js");
    if (!fs.existsSync(vendor)) throw new Error("缺少本地 vendor/ethers.umd.min.js（离线页面无法加载）");

    const sandbox = { console, TextEncoder, TextDecoder };
    sandbox.self = sandbox; sandbox.window = sandbox; sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(vendor, "utf8"), sandbox, { filename: "ethers.umd.min.js" });
    if (typeof sandbox.ethers === "undefined" || typeof sandbox.ethers.keccak256 !== "function") {
      throw new Error("vendor ethers 未在全局暴露 keccak256");
    }
                                                            
    if (typeof sandbox.ethers.BrowserProvider !== "function") throw new Error("缺 BrowserProvider");
    if (typeof sandbox.ethers.JsonRpcProvider !== "function") throw new Error("缺 JsonRpcProvider");

    vm.runInContext(fs.readFileSync(path.join(webDir, "e2e_core.js"), "utf8"), sandbox, { filename: "e2e_core.js" });
    if (!sandbox.E2ECore) throw new Error("e2e_core.js 浏览器分支未挂载 E2ECore 全局");

                                     
    const pkg = sandbox.E2ECore.buildPackage(sampleRec());
    if (pkg.packHash !== E2ECore.buildPackage(sampleRec()).packHash) {
      throw new Error("浏览器分支与 Node 分支哈希不一致");
    }
    if (!sandbox.E2ECore.verifyLocal(pkg).ok) throw new Error("浏览器分支未篡改包核验应通过");
    const t = JSON.parse(JSON.stringify(pkg));
    t.payload.npp = (parseFloat(t.payload.npp) + 0.05).toFixed(6);
    if (sandbox.E2ECore.verifyLocal(t).ok) throw new Error("浏览器分支 NPP 篡改后不应通过");
  });
});
