                                              
  
                
                                                             
                                   
                                                         
                                                                     
                                      
  
                                            
                                                                
                                                                        
                                                       
                                             
  
                         
                                                                      
                                                    
                                                       
                                                                                  
                                                              
  
                                                  
                                                 
                                             

const DECLARATION = E2ECore.DECLARATION;
const SEPOLIA_CHAIN_ID = E2ECore.SEPOLIA_CHAIN_ID;

                                                     
const MANIFEST_URL = "../evidence/evidence_pack_manifest.json";
                                                      
                                                     
const SOURCE_BINDING_URL = "../audit/one_record_anchor/source_binding_result.json";

const STATUS_COLOR = {
  "未被模型标记": "#9aa7b5",
  "建议复核": "#f0a500",
  "结构性断点待核": "#d64545",
};

                               
const ABI = [
  "function anchorEvidence(bytes32,string,string)",
  "function getAnchor(bytes32) view returns (bytes32,string,string,address,uint64,bool)",
  "function REQUIRED_DECLARATION() view returns (string)",
];

let DATA = null;
let selected = null;                    
let currentPkg = null;                                         
let MANIFEST = null;                                  
let MANIFEST_VERIFY = null;                   
let SOURCE_BINDING = null;                                                                 
let CHAIN_ANCHOR = null;                          

                                        
function verificationStates(pkg, chainAnchor) {
  return E2ECore.evaluateVerificationStates({
    pkg: typeof pkg === "undefined" ? currentPkg : pkg,
    manifestVerify: MANIFEST_VERIFY,
    sourceBinding: SOURCE_BINDING,
    chainAnchor: typeof chainAnchor === "undefined" ? CHAIN_ANCHOR : chainAnchor,
  });
}

                                          
                                      
window.__page = {
  get data() { return DATA; },
  get selected() { return selected; },
  get currentPkg() { return currentPkg; },
  get manifest() { return MANIFEST; },
  get manifestVerify() { return MANIFEST_VERIFY; },
  get sourceBinding() { return SOURCE_BINDING; },
  get chainAnchor() { return CHAIN_ANCHOR; },
  verificationStates: verificationStates,
};

                                           
let map = null, layer = null;
function initMap() {
  if (typeof L === "undefined") return false;
  map = L.map("map").setView([40.3, 108.5], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
  layer = L.layerGroup().addTo(map);
  return true;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function statusBadge(s) {
  return `<span class="badge b-info">${esc(s)}</span>`;
}

                                                 
function stateBadge(st) {
  const cls = st.ok ? "b-ok"
    : (st.status === "未核验" || st.status === "未登记" || st.status === "不一致" ? "b-warn" : "b-bad");
  return `<span class="badge ${cls}">${esc(st.label)}：${esc(st.status)}</span>`;
}

function renderStates(states) {
  return `
    <div class="hashblock" id="verifyStates">
      <div class="k" style="font-weight:700;margin-bottom:4px">四个互相独立的核验状态（不得互相代替）</div>
      <div class="row" style="margin:3px 0">
        ${stateBadge(states.single)} ${stateBadge(states.wholeBundle)}
      </div>
      <div class="row" style="margin:3px 0">
        ${stateBadge(states.chain)} ${stateBadge(states.sourceFiles)}
      </div>
      <div class="k">① 单条内容哈希：${esc(states.single.reason)}</div>
      <div class="k">② 整包清单与下载包哈希：${esc(states.wholeBundle.reason)}
        <br/>下载包携带值：<span class="mono">${esc(states.wholeBundle.inPackage || "（无）")}</span><br/>
        已核验清单值：<span class="mono">${esc(states.wholeBundle.verifiedManifest || "（未取得/未核验）")}</span>
        <br/><b>整包哈希未上链</b>（onChainAnchored=false）
        <br/><b>${esc(states.wholeBundle.scopeNote || E2ECore.BROWSER_LIMIT_NOTE)}</b></div>
      <div class="k">③ 链上登记：${esc(states.chain.reason)}</div>
      <div class="k">④ 源文件逐项核验（${esc(states.sourceFiles.source || "")}）：${esc(states.sourceFiles.reason)}
        <br/><b>本状态不由浏览器计算</b>——浏览器无磁盘访问能力；只有 Python 核验器实际运行通过才是"通过"。</div>
    </div>`;
}

                       
function cfg() {
  return {
    address: (document.getElementById("cfgAddr").value || "").trim(),
    rpcUrl: (document.getElementById("cfgRpc").value || "").trim() || "https://rpc.sepolia.org",
  };
}

function setChain(st, txt) {
  const el = document.getElementById("chainSt");
  if (el) { el.className = "chainst " + st; el.textContent = txt; }
}

function renderDetail() {
  const box = document.getElementById("detail");
  if (!selected) {
    box.innerHTML = `<div class="k">在地图上点选一个 NPP 格年记录，查看其原始值、来源、AI 复核状态与证据哈希。</div>`;
    return;
  }
  const r = selected;
  const ml = r.mlReview;
  const color = STATUS_COLOR[ml.interpretationStatus] || "#888";
  const canRegister = currentPkg && currentPkg.payload.recordId === r.recordId;
  const prov = r.provenance || {};
                                     
  const sampleSha = DATA.sampleSha256 || "（见 evidence/npp_sample.json）";

                               
  let hashBlock = "";
  if (canRegister) {
    const wb = currentPkg.wholeBundlePackSha256 || "（下载包未携带）";
                                                       
    const wbState = verificationStates(currentPkg).wholeBundle;
    hashBlock = `
      <div class="hashblock">
        <div class="kv"><div class="k">① 单条下载包 keccak256 —— 链上唯一锚定的对象</div>
          <div class="v mono">${esc(currentPkg.packHash)}</div>
          <div class="k">网页对你选中的这条记录现场计算；只证明下载的 JSON 与本条记录逐字段一致。</div></div>
        <div class="kv"><div class="k">② 源记录锚点 —— 证明【来自源 CSV 且内容未被改】</div>
          <div class="v mono">${esc(r.sourceHash)}</div>
          <div class="k">evidenceRef：</div><div class="v mono">${esc(r.evidenceRef)}</div></div>
        <div class="kv"><div class="k">③ 整包 packSha256 —— 整包清单与下载包哈希<b>${esc(wbState.status)}</b>（本地离线核验，未上链）</div>
          <div class="v mono dim">${esc(wb)}</div>
          <div class="k">状态依据：${esc(wbState.reason)}</div>
          <div class="k"><b>${esc(wbState.scopeNote || E2ECore.BROWSER_LIMIT_NOTE)}</b></div>
          <div class="k">样本自锚点 sampleSha256：</div><div class="v mono dim">${esc(sampleSha)}</div></div>
      </div>`;
  }

  box.innerHTML = `
    <div class="card" style="border-left:4px solid ${color}">
      <div style="font-weight:700;font-size:14px">${esc(r.cellId)} · ${r.year}
        ${statusBadge(ml.interpretationStatus)}</div>
      <div class="kv"><div class="k">原始 NPP 值（MOD17 描述性）</div><div class="v">${Number(r.npp).toFixed(6)} ${esc(r.nppUnit || "kgC/m²/yr")}</div></div>
      <div class="kv"><div class="k">来源（本地 CSV 哈希，未上 IPFS）</div><div class="v mono">${esc(r.sourceHash)}</div></div>
      <div class="kv"><div class="k">证据锚点 evidenceRef（链下可重算）</div><div class="v mono">${esc(r.evidenceRef)}</div></div>
      <div class="kv"><div class="k">AI 复核状态（IsolationForest 预审，仅建议）</div>
        <div class="v">score=${Number(ml.score).toFixed(4)} · flag=${ml.flag} · 解释状态=${esc(ml.interpretationStatus)}</div></div>
      <div class="kv"><div class="k" style="color:#a06a00">科学限制（knownLimitation）</div>
        <div class="v" style="font-weight:400;font-size:11px;line-height:1.5">${esc(ml.knownLimitation)}</div></div>
      <div class="kv"><div class="k">方法版本 / 声明类别 / 归因</div>
        <div class="v" style="font-weight:400">${esc(r.methodVersion)} · <b>${esc(DECLARATION)}</b>（非碳信用/非增汇/非REMOVAL）· ${esc(r.attributionStatus)}</div></div>
      <div class="kv"><div class="k">来源链（可核验到原始证据）</div>
        <div class="v" style="font-weight:400;font-size:11px;line-height:1.6">
          由 <code>scripts/build_web_sample.py</code> 从验证通过的 816 条记录中<b>确定性选出</b>；
          每条已逐条核对源 CSV、sourceHash、evidenceRef、AI 状态。
          原始资产：<code>${esc(r.rawAssetId || "（见记录）")}</code>，
          有效面积比：${r.validAreaRatio === undefined ? "—" : esc(String(r.validAreaRatio))}。
        </div></div>

      ${hashBlock}

      <div class="row" style="margin-top:8px">
        <button id="btnPkg">① 生成可下载证据包</button>
        <button id="btnLocal">② 本地核验（无网络）</button>
        <button id="btnTamper">③ 篡改后核验（演示）</button>
      </div>
      <div class="row">
        <button id="btnTamperWB">④ 仅篡改整包哈希（反例）</button>
      </div>
      <div class="row">
        <button id="btnReg" ${canRegister ? "" : "disabled"}>⑤ 在测试网登记（钱包签名）</button>
        <button id="btnRead" ${canRegister ? "" : "disabled"}>⑥ 从链上读回核验（只读 RPC）</button>
        <span id="chainSt" class="chainst wait">未配置合约地址</span>
      </div>
      <div id="pkgOut" class="kv"></div>
    </div>`;

  document.getElementById("btnPkg").onclick = onGeneratePackage;
  document.getElementById("btnLocal").onclick = onLocalVerify;
  document.getElementById("btnTamper").onclick = onTamperDemo;
  document.getElementById("btnTamperWB").onclick = onTamperWholeBundleDemo;
  document.getElementById("btnReg").onclick = onRegister;
  document.getElementById("btnRead").onclick = onReadBack;
}

async function onGeneratePackage() {
  const rec = Object.assign({}, selected, {
    wholeBundlePackSha256: (DATA.meta && DATA.meta.wholeBundlePackSha256) || null,
  });  const pkg = E2ECore.buildPackage(rec);
  currentPkg = pkg;
         
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${pkg.payload.recordId}.evidence-package.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  renderDetail();                   
  document.getElementById("pkgOut").innerHTML =
    `<span class="badge b-ok">已生成并下载证据包（keccak256）</span>`;
}

async function onLocalVerify() {
  if (!currentPkg || currentPkg.payload.recordId !== selected.recordId) {
    document.getElementById("pkgOut").innerHTML = `<span class="badge b-warn">请先『生成证据包』</span>`;
    return;
  }
                                         
  const st = verificationStates(currentPkg);
  document.getElementById("pkgOut").innerHTML = renderStates(st) +
    `<div class="k" style="margin-top:4px">单条重算 ${esc((st.single.recomputed || "").slice(0, 18))}… == 包内 ${esc((st.single.stored || "").slice(0, 18))}…</div>`;
}

                                                         
                                             
async function onTamperWholeBundleDemo() {
  if (!currentPkg || currentPkg.payload.recordId !== selected.recordId) {
    document.getElementById("pkgOut").innerHTML = `<span class="badge b-warn">请先『生成证据包』</span>`;
    return;
  }
  const good = currentPkg.wholeBundlePackSha256;
  const tampered = JSON.parse(JSON.stringify(currentPkg));
  tampered.wholeBundlePackSha256 = "0".repeat(64);              
  const st = verificationStates(tampered);
  document.getElementById("pkgOut").innerHTML =
    `<div class="k">反例：只把下载包的 wholeBundlePackSha256 改成 000…000（payload 与单条 packHash 不动）——</div>` +
    `<div class="v mono">原值 ${esc(String(good).slice(0, 20))}…</div>` +
    `<div class="v mono">篡改 ${esc(String(tampered.wholeBundlePackSha256).slice(0, 20))}…</div>` +
    renderStates(st) +
    (st.wholeBundle.ok
      ? `<span class="badge b-bad">失败：整包清单与下载包哈希仍被判一致 —— 这是缺陷</span>`
      : `<span class="badge b-ok">正确：整包清单与下载包哈希被判${esc(st.wholeBundle.status)}（单条仍通过，因为单条哈希确实没被改）</span>`);
}

async function onTamperDemo() {
  if (!currentPkg || currentPkg.payload.recordId !== selected.recordId) {
    document.getElementById("pkgOut").innerHTML = `<span class="badge b-warn">请先『生成证据包』</span>`;
    return;
  }
                           
  const tampered = JSON.parse(JSON.stringify(currentPkg));
  tampered.payload.npp = (parseFloat(tampered.payload.npp) + 0.05).toFixed(6);
  const r = E2ECore.verifyLocal(tampered);
  const mismatch = !r.ok;
  document.getElementById("pkgOut").innerHTML =
    `<div class="k">篡改演示：把 NPP 原始值 +0.05 后重算包哈希——</div>` +
    `<div class="v mono">篡改后 ${esc(r.recomputed.slice(0, 20))}…</div>` +
    `<div class="v mono">包内（未篡改） ${esc(currentPkg.packHash.slice(0, 20))}…</div>` +
    `<span class="badge ${mismatch ? "b-bad" : "b-ok"}">${mismatch ? "核验失败：本地证据已被改动（与链上不符）" : "一致"}</span>`;
}

                                                      
async function onRegister() {
  const c = cfg();
  const env0 = E2ECore.checkRegisterEnv({ hasEthereum: !!window.ethereum, contractAddress: c.address });
  if (!env0.ok) { setChain("bad", "阻塞：" + env0.reason); return; }
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);         
    const net = await provider.getNetwork();
    const env = E2ECore.checkRegisterEnv({ hasEthereum: true, contractAddress: c.address, chainId: Number(net.chainId) });
    if (!env.ok) { setChain("bad", "阻塞：" + env.reason); return; }
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(c.address, ABI, signer);
    const tx = await contract.anchorEvidence(
      currentPkg.packHash,
      currentPkg.payload.methodVersion,
      currentPkg.payload.declarationCategory                          
    );
    const rcpt = await tx.wait();
    setChain("ok", "已登记 tx=" + rcpt.hash.slice(0, 12) + "…（Sepolia " + SEPOLIA_CHAIN_ID + "）");
  } catch (e) {
    setChain("bad", "登记失败：" + String((e && (e.shortMessage || e.message)) || e));
  }
}

                                         
async function onReadBack() {
  const c = cfg();
  const env = E2ECore.checkReadEnv({ contractAddress: c.address });
  if (!env.ok) { setChain("bad", "阻塞：" + env.reason); return; }
  try {
    const provider = new ethers.JsonRpcProvider(c.rpcUrl);             
    const contract = new ethers.Contract(c.address, ABI, provider);
    const res = await contract.getAnchor(currentPkg.packHash);
    const chainAnchor = {
      packHash: res[0], methodVersion: res[1], declarationCategory: res[2], exists: res[5],
    };
    const v = E2ECore.verifyAgainstChain(currentPkg, chainAnchor);
    CHAIN_ANCHOR = v.ok ? chainAnchor : null;                    
    setChain(v.ok ? "ok" : "bad",
      v.reason + (v.ok ? "（类别=" + chainAnchor.declarationCategory + "，方法版本=" + chainAnchor.methodVersion + "）" : ""));
  } catch (e) {
    setChain("bad", "读回失败：" + String((e && (e.shortMessage || e.message)) || e));
  }
}

                                    
                                                         
function loadManifest() {
  return fetch(MANIFEST_URL)
    .then((r) => (r.ok === false ? Promise.reject(new Error("HTTP " + r.status)) : r.json()))
    .then((m) => {
      MANIFEST = m;
      MANIFEST_VERIFY = E2ECore.verifyManifestSource(m);
      return MANIFEST_VERIFY;
    })
    .catch((e) => {
      MANIFEST = null;
      MANIFEST_VERIFY = E2ECore.verifyManifestSource(null);
      MANIFEST_VERIFY.reason += "（取 manifest 失败：" + e + "）";
      return MANIFEST_VERIFY;
    });
}

                                                       
                                     
                                              
function loadSourceBinding() {
  return fetch(SOURCE_BINDING_URL)
    .then((r) => (r.ok === false ? Promise.reject(new Error("HTTP " + r.status)) : r.json()))
    .then((sb) => { SOURCE_BINDING = sb; return sb; })
    .catch((e) => {
      SOURCE_BINDING = null;
      if (window.console) console.warn("未取得 Python 源文件核验结果（状态④将显示未核验）：",
        String((e && e.message) || e));
      return null;
    });
}

function renderMarkers() {
  if (!map || !layer) return;
  layer.clearLayers();
  DATA.records.forEach((r) => {
    const color = STATUS_COLOR[r.mlReview.interpretationStatus] || "#888";
    L.circleMarker([r.lat, r.lon], { radius: 8, color: "#334", fillColor: color, fillOpacity: 0.85, weight: 1.5 })
      .addTo(layer)
      .bindTooltip(`${r.cellId} ${r.year} · ${r.mlReview.interpretationStatus}`)
      .on("click", () => { selected = r; currentPkg = null; renderDetail(); });
  });
}

                                       
function renderFallbackList() {
  const box = document.getElementById("detail");
  const rows = DATA.records.map((r, i) => {
    const color = STATUS_COLOR[r.mlReview.interpretationStatus] || "#888";
    return `<div class="card" style="border-left:4px solid ${color};margin-bottom:6px;cursor:pointer" data-i="${i}">
      <div style="font-weight:700;font-size:13px">${esc(r.cellId)} · ${r.year} ${statusBadge(r.mlReview.interpretationStatus)}</div>
      <div class="k">NPP=${Number(r.npp).toFixed(6)} ${esc(r.nppUnit || "")}</div>
    </div>`;
  }).join("");
  box.innerHTML = `<div class="k" style="margin-bottom:6px">Leaflet 底图不可用（离线）——改用记录列表点选，闭环功能不受影响：</div>${rows}`;
  box.querySelectorAll("[data-i]").forEach((el) => {
    el.onclick = () => { selected = DATA.records[Number(el.dataset.i)]; currentPkg = null; renderDetail(); };
  });
}

function init() {
  const hasLeaflet = initMap();
  if (!hasLeaflet) {
    const el = document.getElementById("map");
    if (el) el.innerHTML = `<div style="padding:20px;font-size:12px;color:#667">地图底图不可用（Leaflet 未加载/离线）。<br/>请用右侧记录列表点选一条 NPP 记录。</div>`;
  }
  renderDetail();
                                                 
                                    
  loadManifest()
    .then(() => loadSourceBinding())
    .then(() => fetch("npp_sample.json"))
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      renderMarkers();
      if (!hasLeaflet) renderFallbackList();
      if (selected) renderDetail();
    })
    .catch((e) => { document.getElementById("detail").innerHTML = "无法加载 npp_sample.json：" + e; });
}

init();
