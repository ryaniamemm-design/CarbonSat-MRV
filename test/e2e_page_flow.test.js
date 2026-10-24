                                                 
  
                                               
                                    
                              
                     
  
                                                               
                                                                        
                        
  
                                                 

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { expect } = require("chai");

const webDir = path.join(__dirname, "..", "web");

function makeEl(id) {
  return {
    id,
    innerHTML: "",
    textContent: "",
    value: "",
    className: "",
    dataset: {},
    _onclick: null,
    set onclick(fn) { this._onclick = fn; },
    get onclick() { return this._onclick; },
    click() { if (this._onclick) this._onclick(); },
    appendChild() {},
    remove() {},
    querySelectorAll() { return []; },
    addEventListener() {},
  };
}

function bootPage(opts) {
  opts = opts || {};
  const els = {};
                                            
  ["map", "detail", "cfgAddr", "cfgRpc", "cfgSt", "chainSt", "pkgOut",
   "btnPkg", "btnLocal", "btnTamper", "btnReg", "btnRead"].forEach((id) => { els[id] = makeEl(id); });
  const downloads = [];
  const alerts = [];

  const sandbox = {
    console,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Boolean,
    Error,
    parseFloat,
    parseInt,
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

                                                
  sandbox.document = {
    body: makeEl("body"),
    getElementById(id) {
      if (!els[id]) els[id] = makeEl(id);
      return els[id];
    },
    createElement(tag) {
      const el = makeEl(tag);
      el.click = function () { downloads.push(el.href || el.download || "(clicked)"); };
      return el;
    },
  };
  sandbox.Blob = function (parts) { this.parts = parts; };
  sandbox.URL = {
    createObjectURL() { return "blob:mock/" + (downloads.length + 1); },
    revokeObjectURL() {},
  };
  sandbox.alert = (m) => alerts.push(m);

                                       
  if (opts.wallet) sandbox.window.ethereum = opts.wallet;

                                                                  
  const sampleJson = fs.readFileSync(path.join(webDir, "npp_sample.json"), "utf8");
  const manifestJson = fs.readFileSync(path.join(webDir, "..", "evidence", "evidence_pack_manifest.json"), "utf8");
  const sbRel = path.join(webDir, "..", "audit", "one_record_anchor", "source_binding_result.json");
  const sbJson = fs.existsSync(sbRel) ? fs.readFileSync(sbRel, "utf8") : null;
  sandbox.fetch = function (url) {
    const u = String(url);
    if (u.indexOf("npp_sample.json") >= 0) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(sampleJson)) });
    }
    if (u.indexOf("evidence_pack_manifest.json") >= 0) {
      if (opts.manifest === "missing") return Promise.reject(new Error("404"));
      const m = JSON.parse(manifestJson);
      if (opts.manifest === "tampered") m.packSha256 = "0".repeat(64);          
      return Promise.resolve({ ok: true, json: () => Promise.resolve(m) });
    }
    if (u.indexOf("source_binding_result.json") >= 0) {
                                                                 
      if (opts.sourceBinding === "missing" || !sbJson) return Promise.reject(new Error("404"));
      const sb = JSON.parse(sbJson);
      if (opts.sourceBinding === "failed") { sb.ok = false; sb.details = ["（测试注入：核验未通过）"]; }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(sb) });
    }
    return Promise.reject(new Error("unexpected fetch: " + url));
  };

                                         
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(webDir, "vendor", "ethers.umd.min.js"), "utf8"), sandbox, { filename: "ethers.umd.min.js" });
  vm.runInContext(fs.readFileSync(path.join(webDir, "e2e_core.js"), "utf8"), sandbox, { filename: "e2e_core.js" });
  vm.runInContext(fs.readFileSync(path.join(webDir, "e2e.js"), "utf8"), sandbox, { filename: "e2e.js" });

                                                                        
                                  
  vm.runInContext(`
    globalThis.__page = {
      get DATA(){ return DATA; }, set DATA(v){ DATA = v; },
      get selected(){ return selected; }, set selected(v){ selected = v; },
      get currentPkg(){ return currentPkg; }, set currentPkg(v){ currentPkg = v; },
      get MANIFEST(){ return MANIFEST; }, set MANIFEST(v){ MANIFEST = v; },
      get MANIFEST_VERIFY(){ return MANIFEST_VERIFY; }, set MANIFEST_VERIFY(v){ MANIFEST_VERIFY = v; },
      get SOURCE_BINDING(){ return SOURCE_BINDING; }, set SOURCE_BINDING(v){ SOURCE_BINDING = v; },
      get CHAIN_ANCHOR(){ return CHAIN_ANCHOR; }, set CHAIN_ANCHOR(v){ CHAIN_ANCHOR = v; },
    };
  `, sandbox, { filename: "bridge.js" });

                                                   
  const page = {
    sandbox,
    els,
    downloads,
    alerts,
    get DATA() { return sandbox.__page.DATA; },
    set DATA(v) { sandbox.__page.DATA = v; },
    get selected() { return sandbox.__page.selected; },
    set selected(v) { sandbox.__page.selected = v; },
    get currentPkg() { return sandbox.__page.currentPkg; },
    set currentPkg(v) { sandbox.__page.currentPkg = v; },
    get sourceBinding() { return sandbox.__page.SOURCE_BINDING; },
    set sourceBinding(v) { sandbox.__page.SOURCE_BINDING = v; },
    E2ECore: sandbox.E2ECore,
    loadSourceBinding: sandbox.loadSourceBinding,
    renderDetail: sandbox.renderDetail,
    renderFallbackList: sandbox.renderFallbackList,
    onGeneratePackage: sandbox.onGeneratePackage,
    onLocalVerify: sandbox.onLocalVerify,
    onTamperWholeBundleDemo: sandbox.onTamperWholeBundleDemo,
    loadManifest: sandbox.loadManifest,
    verificationStates: sandbox.verificationStates,
    onTamperDemo: sandbox.onTamperDemo,
    onRegister: sandbox.onRegister,
    onReadBack: sandbox.onReadBack,
  };
  return page;
}

                               
function flush() { return new Promise((r) => setImmediate(r)); }

describe("网页真实交互流程（DOM harness 驱动 web/e2e.js 自身回调）", function () {
  it("页面加载：无 Leaflet 时降级为记录列表，且能点选一条记录", async function () {
    const page = bootPage({});
    await flush();
    expect(page.E2ECore).to.be.an("object");
                      
    expect(page.els.detail.innerHTML).to.contain("改用记录列表点选");
                                
    const card = makeEl("card");
    card.dataset.i = "0";
    page.els.detail.querySelectorAll = () => [card];
    page.renderFallbackList();
    card.onclick();
    expect(page.selected).to.not.equal(null);
    expect(page.selected.recordId).to.be.a("string");
  });

  it("①生成可下载证据包 → ②本地核验通过 → ③篡改后核验失败（真实按钮回调）", async function () {
    const page = bootPage({});
    await flush();
                         
    const rec = page.DATA.records.find((r) => r.mlReview.interpretationStatus === "结构性断点待核");
    page.selected = rec;
    page.currentPkg = null;
    page.renderDetail();

                   
    await page.onGeneratePackage();
    expect(page.currentPkg).to.not.equal(null);
    expect(page.currentPkg.packHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(page.downloads.length).to.be.greaterThan(0);                     
                               
    const detailHtml = page.els.detail.innerHTML;
    expect(detailHtml).to.contain("单条下载包 keccak256");
    expect(detailHtml).to.contain("链上唯一锚定的对象");
    expect(detailHtml).to.contain("源记录锚点");
    expect(detailHtml).to.contain("整包 packSha256");
    expect(detailHtml).to.contain("整包哈希未上链");
                                      
    expect(detailHtml).to.contain("没有");
    expect(detailHtml).to.contain("32 个源文件");
                        
    expect(detailHtml).to.contain("build_web_sample.py");
    expect(detailHtml).to.contain("来源链");

                                           
    expect(page.E2ECore.verifyLocal(page.currentPkg).ok).to.equal(true);
    await page.onLocalVerify();
    const outHtml = page.els.pkgOut.innerHTML;
    expect(outHtml).to.contain("单条内容哈希：通过");
    expect(outHtml).to.contain("整包清单与下载包哈希：一致");
    expect(outHtml).to.contain("链上登记：未登记");
    expect(outHtml).to.contain("整包哈希未上链");
                                 
    expect(outHtml).not.to.contain("整包来源：已核验");
                                          
    expect(page.sourceBinding).to.not.equal(null);
    expect(outHtml).to.contain("源文件逐项核验");
    expect(outHtml).to.contain("本状态不由浏览器计算");

                         
    const tampered = JSON.parse(JSON.stringify(page.currentPkg));
    tampered.payload.npp = (parseFloat(tampered.payload.npp) + 0.05).toFixed(6);
    expect(page.E2ECore.verifyLocal(tampered).ok).to.equal(false);
    await page.onTamperDemo();
    expect(page.els.pkgOut.innerHTML).to.contain("核验失败");
  });

  it("四状态互不代替：只改整包哈希 → 单条仍通过但整包必须不一致（源文件态不受影响）", async function () {
    const page = bootPage({});
    await flush();
    const rec = page.DATA.records.find((r) => r.mlReview.interpretationStatus === "结构性断点待核");
    page.selected = rec;
    page.renderDetail();
    await page.onGeneratePackage();

                                  
    await page.onTamperWholeBundleDemo();
    const html = page.els.pkgOut.innerHTML;
    expect(html).to.contain("单条内容哈希：通过");                                     
    expect(html).to.contain("整包清单与下载包哈希：不一致");                  
    expect(html).not.to.contain("整包清单与下载包哈希：一致");
    expect(html).to.contain("正确：整包清单与下载包哈希被判不一致");
    expect(html).to.contain("源文件逐项核验：通过");                                            
  });

  it("未取得 manifest → 不得显示整包一致（即使下载包自带整包哈希）", async function () {
    const page = bootPage({ manifest: "missing" });
    await flush();
    const rec = page.DATA.records[0];
    page.selected = rec;
    page.renderDetail();
    await page.onGeneratePackage();
                              
    expect(page.currentPkg.wholeBundlePackSha256).to.match(/^[0-9a-f]{64}$/);
                 
    await page.onLocalVerify();
    const html = page.els.pkgOut.innerHTML;
    expect(html).to.contain("整包清单与下载包哈希：未核验");
    expect(html).not.to.contain("整包清单与下载包哈希：一致");
    expect(html).to.contain("不能仅因下载包自带整包哈希就判一致");
  });

  it("源文件逐项核验：无 Python 结果 / Python 未通过 → 一律『未核验』（浏览器不得自算）", async function () {
                                    
    const mkPkg = (p) => p.E2ECore.buildPackage(Object.assign({}, p.DATA.records[0], {
      wholeBundlePackSha256: (p.DATA.meta && p.DATA.meta.wholeBundlePackSha256) || null,
    }));
                        
    const noSb = bootPage({ sourceBinding: "missing" });
    await flush();
    expect(noSb.sourceBinding).to.equal(null);
    const stA = noSb.verificationStates(mkPkg(noSb));
    expect(stA.sourceFiles.status).to.equal("未核验");
    expect(stA.sourceFiles.reason).to.contain("浏览器无法自行逐文件核对");
                                 
    expect(stA.wholeBundle.status).to.equal("一致");

                            
    const sbFail = bootPage({ sourceBinding: "failed" });
    await flush();
    expect(sbFail.sourceBinding.ok).to.equal(false);
    const stB = sbFail.verificationStates(mkPkg(sbFail));
    expect(stB.sourceFiles.status).to.equal("未核验");
    expect(stB.sourceFiles.reason).to.contain("未通过");
  });

  it("manifest 哈希字段被篡改 → 独立重算不符 → 整包清单与下载包哈希未核验", async function () {
    const page = bootPage({ manifest: "tampered" });
    await flush();
    const rec = page.DATA.records[0];
    page.selected = rec;
    page.renderDetail();
    await page.onGeneratePackage();
    await page.onLocalVerify();
    const html = page.els.pkgOut.innerHTML;
    expect(html).to.contain("整包清单与下载包哈希：未核验");
    expect(html).to.contain("不符");
  });

  it("④登记：无钱包 / 无合约地址 / 错链 三种阻塞如实报告（不静默）", async function () {
    const noWallet = bootPage({});                     
    await flush();
    noWallet.selected = noWallet.DATA.records[0];
    noWallet.currentPkg = noWallet.E2ECore.buildPackage(noWallet.selected);
    noWallet.renderDetail();
    noWallet.els.cfgAddr.value = "0x1234567890123456789012345678901234567890";
    await noWallet.onRegister();
    expect(noWallet.els.chainSt.textContent).to.contain("无钱包");

            
    const noAddr = bootPage({ wallet: { request: async () => "0x1" } });
    await flush();
    noAddr.selected = noAddr.DATA.records[0];
    noAddr.currentPkg = noAddr.E2ECore.buildPackage(noAddr.selected);
    noAddr.renderDetail();
    noAddr.els.cfgAddr.value = "";
    await noAddr.onRegister();
    expect(noAddr.els.chainSt.textContent).to.contain("无合约地址");

                                           
    const wrongChain = bootPage({
      wallet: {
        request: async (args) => {
          if (args.method === "eth_chainId") return "0x1";
          if (args.method === "net_version") return "1";
          if (args.method === "eth_requestAccounts" || args.method === "eth_accounts") return ["0x0000000000000000000000000000000000000001"];
          return null;
        },
        on: () => {},
        removeListener: () => {},
      },
    });
    await flush();
    wrongChain.selected = wrongChain.DATA.records[0];
    wrongChain.currentPkg = wrongChain.E2ECore.buildPackage(wrongChain.selected);
    wrongChain.renderDetail();
    wrongChain.els.cfgAddr.value = "0x1234567890123456789012345678901234567890";
    await wrongChain.onRegister();
    expect(wrongChain.els.chainSt.textContent).to.contain("错链");
  });

  it("⑤读回：无合约地址 阻塞如实报告", async function () {
    const page = bootPage({});
    await flush();
    page.selected = page.DATA.records[0];
    page.currentPkg = page.E2ECore.buildPackage(page.selected);
    page.renderDetail();
    page.els.cfgAddr.value = "";
    await page.onReadBack();
    expect(page.els.chainSt.textContent).to.contain("无合约地址");
  });

  it("来源链：样本每条都带 provenance（整包哈希 + 源记录锚点 + 816 文件哈希）", async function () {
    const page = bootPage({});
    await flush();
    const meta = page.DATA.meta;
                        
    expect(meta.wholeBundlePackSha256).to.match(/^[0-9a-f]{64}$/);
    expect(meta.sourceRecords.recordCount).to.equal(816);
    expect(meta.sourceRecords.recordsJsonSha256).to.match(/^[0-9a-f]{64}$/);
                          
    expect(page.DATA.sampleSha256).to.match(/^local-sha256:[0-9a-f]{64}$/);
                                      
    page.DATA.records.forEach((r) => {
      expect(r.provenance, r.recordId).to.be.an("object");
      expect(r.provenance.wholeBundlePackSha256).to.equal(meta.wholeBundlePackSha256);
      expect(r.provenance.recordsJsonSha256).to.equal(meta.sourceRecords.recordsJsonSha256);
      expect(r.sourceHash).to.match(/^local-sha256:[0-9a-f]{64}$/);
      expect(r.evidenceRef).to.match(/^local-sha256:[0-9a-f]{64}$/);
                      
      expect(r.attributionStatus).to.equal("insufficient_evidence");
      expect(r.claimClass).to.equal("DESCRIPTIVE_NPP_ONLY");
    });
  });
});
