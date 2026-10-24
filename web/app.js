                                                     
                                                        
  
                   
                                                                    
                                            
                                              
                                                                   
                                                              
                                                                    
                                                         
                                                               
                               
                                                             
                                                                 
                                                   
                                                  
                                                                          
                                                      

let DATA = null;
const YEARS = Array.from({ length: 38 }, (_, i) => 1987 + i);

                             
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_RPC = "https://rpc.sepolia.org";
const CONTRACT_ABI = [
  "function getStatus(bytes32 claimId) view returns (uint8)",
  "function getRegistrable(bytes32 claimId) view returns (bool)",
  "function getRecordSummary(bytes32 claimId) view returns (bytes32 geometryHash, uint16 vintage, uint256 carbon, uint256 uncertainty, uint8 evidenceConfidence, uint8 status)",
  "function getEvidenceCID(bytes32 claimId) view returns (string)",
];
const STATUS_NAME = ["OBSERVED", "VERIFIED", "REVIEW", "REGISTERED", "PARTIALLY_RETIRED", "RETIRED"];

                                                                                  
let CHAIN = { state: "idle", network: null, error: null };
let CLAIM_CHAIN = {};
                                                  
                                                  
let CHAIN_QUERY_TOKEN = 0;

                                         
function normAnchor(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().toLowerCase().replace(/^0x/, "");
}

                               
function isStaleQuery(token, queryAddr) {
  return token !== CHAIN_QUERY_TOKEN || currentAddr() !== queryAddr;
}

const STATUS_COLOR = {
  REGISTERED: "#2e8b57", REVIEW: "#f0a500", REJECTED: "#d64545",
  REGISTER: "#2e8b57",
};

                                       
function toLL(c) { return [c[1], c[0]]; }

function fvcColor(v) {
  if (v == null || v < 0) return "#cccccc";
  const g = Math.round(120 + v * 135);
  return `rgb(${Math.round(220 - v * 160)},${g},${Math.round(60 + v * 60)})`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

const map = L.map("map").setView([40.3, 108.5], 8);                                  
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);

const parcelLayer = L.layerGroup().addTo(map);
const polyByParcel = {};

function currentAddr() {
  const inp = document.getElementById("addrInput");
  const v = inp ? inp.value.trim() : "";
  return v && v !== "<DEPLOYED_BY_USER>" ? v : null;
}

                    
function explorerLink(addr, claimId) {
  if (!addr) return null;
  return `https://sepolia.etherscan.io/token/0x${addr.replace(/^0x/, "")}?a=${claimId.replace(/^0x/, "")}`;
}
function parcelOf(geomHash) {
  return DATA ? DATA.parcels.find((p) => p.geometryHash === geomHash) : null;
}
function missingYears(parcel) {
  if (!parcel) return [];
  return parcel.timeseries.filter((t) => !t.valid).map((t) => t.year);
}
function placeholderKeys(paramStatus) {
  return Object.keys(paramStatus || {}).filter((k) => String(paramStatus[k]).toUpperCase().startsWith("PLACEHOLDER"));
}

                                                                              
                                         
                                                                              
function chainHtml(c) {
  const addr = currentAddr();
  if (!addr) return `<span class="prop chain-wait">链上状态：待部署（未配置合约地址）</span>`;
  if (CHAIN.state === "verifying") return `<span class="prop chain-wait">链上状态：核验中…</span>`;
  if (CHAIN.state === "error") {
    return `<span class="prop chain-unverified">链上状态：<b>未验证</b>（查询失败：${esc(CHAIN.error)}）</span>`;
  }
  const st = CLAIM_CHAIN[c.claimId];
  if (!st) {
    return `<span class="prop chain-unverified">链上状态：<b>未验证</b>（点击「核验链上状态」实际查询）</span>`;
  }
  if (st.state === "notfound") {
    return `<span class="prop chain-unverified">链上状态：<b>未验证</b>（${esc(st.note)}）</span>`;
  }
  if (st.state === "error") {
    return `<span class="prop chain-unverified">链上状态：<b>未验证</b>（${esc(st.note)}）</span>`;
  }
                                      
  const link = explorerLink(addr, c.claimId);
  const mintNote = st.registrable ? "可铸造回执" : "占位/仅审核留痕（不可铸造）";
  const a = link ? `<a class="lnk" href="${link}" target="_blank">Etherscan ↗</a>` : "";
  return `<span class="prop chain-ok">链上已核验：<b>${esc(st.statusName)}</b>（${mintNote}）</span> ${a}`;
}

async function verifyOnChain() {
  const addr = currentAddr();
  const statusEl = document.getElementById("chainStatus");

  if (!addr) {
    CHAIN = { state: "idle", network: null, error: null };
    CLAIM_CHAIN = {};
    if (statusEl) { statusEl.className = "chainst wait"; statusEl.textContent = "未配置合约地址"; }
    if (DATA) renderClaims();
    return;
  }
  if (typeof ethers === "undefined") {
    CHAIN = { state: "error", network: null, error: "未能加载 ethers（离线或 CDN 不可达），无法查询链上状态" };
    CLAIM_CHAIN = {};
    if (statusEl) { statusEl.className = "chainst bad"; statusEl.textContent = "未验证（ethers 未加载）"; }
    if (DATA) renderClaims();
    return;
  }
  if (!ethers.isAddress(addr)) {
    CHAIN = { state: "error", network: null, error: "地址格式非法（应为 0x + 40 位十六进制）" };
    CLAIM_CHAIN = {};
    if (statusEl) { statusEl.className = "chainst bad"; statusEl.textContent = "未验证（地址格式非法）"; }
    if (DATA) renderClaims();
    return;
  }

                                                    
  const queryAddr = addr;
  const myToken = ++CHAIN_QUERY_TOKEN;

  CHAIN = { state: "verifying", network: null, error: null };
  CLAIM_CHAIN = {};
  if (statusEl) { statusEl.className = "chainst wait"; statusEl.textContent = "核验中…"; }
  if (DATA) renderClaims();

  try {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);

                       
    const net = await provider.getNetwork();
    const chainId = Number(net.chainId);
    if (chainId !== SEPOLIA_CHAIN_ID) {
      throw new Error(`RPC 返回 chainId=${chainId}，不是 Sepolia(${SEPOLIA_CHAIN_ID})`);
    }
                    
    const code = await provider.getCode(addr);
    if (!code || code === "0x") {
      throw new Error("该地址无合约代码（未部署 / 地址错误 / 网络不对）");
    }
    const c = new ethers.Contract(addr, CONTRACT_ABI, provider);

                                                                   
    const out = {};
    for (const cl of DATA.claims) {
      try {
        const s = await c.getRecordSummary(cl.claimId);
        const onVintage = Number(s.vintage);
        const onGeom = s.geometryHash;
        const registrable = await c.getRegistrable(cl.claimId);
        const onCid = await c.getEvidenceCID(cl.claimId);

        if (onVintage === 0) {
          out[cl.claimId] = { state: "notfound", note: "链上无此 claimId 记录（vintage=0）" };
          continue;
        }

                                                     
        const bad = [];
        if (onVintage !== cl.vintage) {
          bad.push(`vintage 链上 ${onVintage} ≠ 本地 ${cl.vintage}`);
        }
        if (!onGeom || !normAnchor(onGeom)) {
          bad.push("geometryHash 链上为空");
        } else if (normAnchor(onGeom) !== normAnchor(cl.geometryHash)) {
          bad.push("geometryHash 与本地不符");
        }
        if (!onCid || !String(onCid).trim()) {
          bad.push("evidenceCID 链上为空");
        } else if (normAnchor(onCid) !== normAnchor(cl.evidenceRef)) {
          bad.push("evidenceCID 与本地 evidenceRef 不符");
        }
        if (bad.length) {
          out[cl.claimId] = { state: "notfound", note: `字段不匹配：${bad.join("；")}` };
          continue;
        }

        out[cl.claimId] = {
          state: "ok",
          status: Number(s.status),
          statusName: STATUS_NAME[Number(s.status)] || `未知(${Number(s.status)})`,
          registrable: !!registrable,
        };
      } catch (e) {
        out[cl.claimId] = { state: "error", note: String((e && (e.shortMessage || e.message)) || e) };
      }
                                               
      if (isStaleQuery(myToken, queryAddr)) return;
    }
                                      
    if (isStaleQuery(myToken, queryAddr)) return;

    CLAIM_CHAIN = out;
    const nOk = Object.values(out).filter((x) => x.state === "ok").length;
    const nBad = DATA.claims.length - nOk;
    CHAIN = { state: "ok", network: `Sepolia(${chainId})`, error: null };
    if (statusEl) {
      statusEl.className = nBad === 0 ? "chainst ok" : "chainst bad";
      statusEl.textContent = nBad === 0
        ? `已查询并匹配 ${nOk}/${DATA.claims.length} 条`
        : `已查询：${nOk}/${DATA.claims.length} 条字段匹配 · ${nBad} 条字段不符/未验证`;
    }
  } catch (e) {
                                                           
    if (isStaleQuery(myToken, queryAddr)) return;
    CLAIM_CHAIN = {};
    CHAIN = { state: "error", network: null, error: String((e && (e.shortMessage || e.message)) || e) };
    if (statusEl) { statusEl.className = "chainst bad"; statusEl.textContent = "未验证（查询失败）"; }
  }
  if (DATA) renderClaims();
}

function renderParcels(yearIdx) {
  parcelLayer.clearLayers();
  const y = YEARS[yearIdx];
  DATA.parcels.forEach((p) => {
    const rec = p.timeseries.find((t) => t.year === y);
    const fvc = rec ? rec.fvc : null;
    const fill = fvcColor(fvc);
    const poly = L.polygon(p.geometry.map(toLL), {
      color: p.role === "control" ? "#888" : "#0c447c",
      weight: p.role === "control" ? 1 : 2,
      fillColor: fill, fillOpacity: 0.55,
    }).bindPopup(
      `<b>${p.parcelId}</b> (${p.role})<br>年份 ${y} · FVC=${fvc != null && fvc >= 0 ? fvc.toFixed(3) : "无数据"}<br>` +
      `面积 ${p.area_ha} ha（来源 ${p.areaSource}）<br>数据 ${p.dataSource}`
    );
    poly.addTo(parcelLayer);
    polyByParcel[p.parcelId] = poly;
  });
}

                                                  
function anomalyModelLabel() {
  const am = (DATA && DATA.anomalyModel) || {};
  if (am.trained) {
    return am.synthetic ? "已训练（合成数据演示，结果非真实 MRV）"
                        : "已训练（真实 GEE 网格样本）";
  }
  return "未训练（阻塞：需先在 GEE 导出 data/grid_samples.csv 并运行 scripts/train_anomaly.py）";
}

                                
function qualityAssessmentLabel() {
  const qa = (DATA && DATA.qualityAssessment) || {};
  if (qa.assessed === true) return `✔ ${qa.label || "实测证据质量"}`;
  return `⚠ ${qa.label || "旧数据 / 质量未完成评估"}`;
}

function renderClaims() {
  const box = document.getElementById("claims");
  box.innerHTML = "";

                 
  const banner = document.createElement("div");
  banner.style.cssText = "font-size:11px;color:#7a4b00;background:#fff8e6;border:1px solid #f0d9a0;border-radius:6px;padding:6px 8px;margin-bottom:10px;line-height:1.5";
  banner.innerHTML = "状态标签为<b>本地建议</b>（非链上状态）。<b>粘贴合约地址不等于已上链</b>：" +
    "必须点击「核验链上状态」实际查询网络 + 合约 + claimId，成功才显示链上状态；" +
    "查询失败或链上无此记录一律显示<b>未验证</b>。" +
    "BIOMASS_STOCK 为存量快照，跨年<b>不可相加为信用</b>；当前 AOI 归因结论为 " +
    "<b>" + esc(DATA.honesty.attributionConclusion) + "</b>，未生成任何正的碳移除主张。" +
    "默认视图展示 FVC / 实测证据质量 / 模型复核优先级分数 / REVIEW 原因 / 可重算哈希；" +
    "占位碳量仅置于「工程情景演示」折叠区，<b>不作为真实结果</b>。";
  box.appendChild(banner);

  let stockCount = 0, flowCount = 0, flowCarbon = 0;
  DATA.claims.forEach((c) => {
    if (c.claimClass === "FLOW") { flowCount++; flowCarbon += c.carbon_tC; }
    else stockCount++;

    const p = parcelOf(c.geometryHash);
    const miss = missingYears(p);
    const ph = placeholderKeys(c.parameterStatus);

    const badge = c.triage === "REVIEW" ? '<span class="badge rev">本地建议 REVIEW</span>'
      : c.triage === "REJECT" ? '<span class="badge rej">本地建议 REJECT</span>'
      : '<span class="badge">本地建议 可登记</span>';

    const cidHtml = c.evidenceRef
      ? `<span class="prop">证据锚点 ${esc(String(c.evidenceRef).slice(0, 22))}… <b>未上 IPFS</b>（可经 scripts/verify_evidence.py 重算）</span>`
      : `<span class="prop">证据：缺失</span>`;

    const phHtml = ph.length
      ? `<div class="prop" style="margin-top:4px;color:#a06a00">占位参数(不驱动核验)：${ph.map(esc).join(", ")}</div>`
      : "";
    const srcHtml = `<div class="prop" style="margin-top:4px">数据源 ${p ? esc(p.dataSource) : "?"} ·` +
      ` 缺测年 ${miss.length ? miss.join(",") : "无"}</div>`;

    const attr = c.claimClass === "FLOW" && c.attribution
      ? `<div class="prop" style="margin-top:4px">DiD-lite: 治理增量 ${c.attribution.deltaCarbonDensity_tC_ha} tC/ha vs ${esc(c.attribution.controlParcel)}</div>`
      : `<div class="prop" style="margin-top:4px;color:#7a4b00">归因结论：${esc(DATA.honesty.attributionConclusion)}（无正移除主张）</div>`;

                                                  
    const qa = (DATA && DATA.qualityAssessment) || {};
    const qaAssessed = qa.assessed === true;
    const qaBadge = qaAssessed
      ? `<span style="color:#1e6b3a">✔ ${esc(qa.label || '实测证据质量')}</span>`
      : `<span style="color:#b03030;font-weight:700">⚠ ${esc(qa.label || '旧数据 / 质量未完成评估')}</span>`;

    const ec = c.ecComponents || {};
    const fmtComp = (k) => {
      const comp = ec[k];
      if (!comp || comp.na) return '<span class="na">N/A</span>';
      return (comp.value * 100).toFixed(0) + '%';
    };
                                
    const compScore = qaAssessed
      ? `${c.evidenceConfidence ?? '?'}`
      : `<span class="na">${c.evidenceConfidence ?? '?'}（未完成评估·不可信）</span>`;
    const derivedNote = qaAssessed
      ? '（仅可用分量合成，缺失不按 0 计）'
      : `（<b>仅由 ${esc((qa.compositeDerivedFrom || []).join('/'))} 算出</b>，非完整置信度）`;
    const ecHtml = `<div class="prop" style="margin-top:4px"><b>实测证据质量</b> ${qaBadge}<br>` +
      `有效像元 ${fmtComp('validPixelRatio')} · 空间覆盖 ${fmtComp('spatialCoverage')} · ` +
      `传感器一致 ${fmtComp('sensorAgreement')} · 时序一致 ${fmtComp('temporalConsistency')} · 局部GEDI ${fmtComp('localGedi')}<br>` +
      `<span style="color:#789">合成分数：${compScore} ${derivedNote}</span>` +
      (qaAssessed ? '' :
        `<br><span style="color:#b03030">${esc(qa.note || '')}</span>` +
        (qa.fix ? `<br><span style="color:#7a4b00">修复：${esc(qa.fix)}</span>` : '')) +
      `</div>`;

                                                   
                                                                  
    const am = c.modelAnomalyScore;
                                                                 
                                                  
    const amOutlier = (am !== null && am !== undefined && am > 0);
    const amTrained = (DATA && DATA.anomalyModel && DATA.anomalyModel.trained) === true;
    const amSynthetic = (DATA && DATA.anomalyModel && DATA.anomalyModel.synthetic) === true;
    const amModelNote = amTrained
      ? (amSynthetic ? '(模型=合成演示，非正式产物)' : '(模型已训练)')
      : '(模型未训练)';
    const scoreUnavailableReason = !amTrained
      ? '复核优先级模型未训练'
      : amSynthetic
        ? '合成演示模型不得用于正式 claim 评分'
        : (DATA && DATA.dataStatus && DATA.dataStatus.valid === false)
          ? '模型已训练；当前地块 CSV 未通过采信且缺少评分特征'
          : '模型已训练；该 claim 缺少必要评分特征';
    const amHtml = `<div class="prop" style="margin-top:4px"><b>模型复核优先级分数</b>（已训练的无监督工具，可触发人工 REVIEW，不单独授权登记/REMOVAL）` +
      `<span style="color:#789"> ${amModelNote}</span>：` +
      (am === null || am === undefined
        ? `<span class="na">N/A（${scoreUnavailableReason}）</span>`
        : `${(am >= 0 ? '+' : '') + Number(am).toFixed(3)}` +
          (amOutlier ? ' · <span style="color:#c0392b">模型提示异常（建议复核）</span>' : ' · 模型判为正常')) +
      `<br><span style="color:#789">规则门禁 anomalyStatus=<b>${c.anomalyStatus}</b>` +
      `（数据/参数/时序规则产生，与模型分数<b>相互独立</b>；二者任一置 1 即推 REVIEW）</span>` +
      `<br><span style="color:#7a4b00">注：合成注入实验的 Precision/Recall 仅验证评估链路，` +
      `<b>不代表真实地块异常检出率</b>；真实异常检出性能未验证（需独立专家判读或可核验异常记录），模型分数仅作复核优先级建议，非认证置信度。</span></div>`;

                       
    const fvcRec = p ? (p.timeseries || []).find((t) => t.year === c.vintage) : null;
    const fvcVal = fvcRec ? fvcRec.fvc : null;
    const fvcHtml = `<div class="fc"><span><b>FVC(${c.vintage})</b> = ${fvcVal != null && fvcVal >= 0 ? Number(fvcVal).toFixed(3) : '无数据'}</span>` +
      `<span class="tag">${esc(c.sensor)}</span><span class="tag">era ${c.resolutionEra}</span></div>`;

                           
    const reviewReasonHtml = (() => {
      if (c.triage !== 'REVIEW') return '';
      const reasons = [];
      reasons.push('归因依据不足（' + esc(DATA.honesty.attributionConclusion) + '：无真实治理起始年 / 精确 AOI / 真实碳参数 / 对照六维匹配）');
      if (ph.length) reasons.push('占位参数未替换：' + ph.map(esc).join(', '));
      if (c.anomalyStatus === 1) reasons.push('规则门禁 anomalyStatus=1（未铸造、待审）');
      if (amOutlier) reasons.push('异常模型提示离群（仅建议）');
      return `<div class="prop" style="margin-top:4px;color:#a06a00"><b>REVIEW 原因：</b><br>` +
        reasons.map((r) => '· ' + r).join('<br>') + `</div>`;
    })();

                                                         
                                                             
                                       
    const carbonFromPlaceholder = ph.some(k => /AGB_K|AREA_HA/i.test(k)) ||
      (DATA.dataProvenance && String(DATA.dataProvenance.AGB_K || "").toUpperCase().includes("PLACEHOLDER"));
    const carbonNum = `${c.carbon_tC.toFixed(1)} tC（${(c.carbon_tC * 44 / 12).toFixed(0)} tCO₂e）`;
    const carbonDemoHtml = carbonFromPlaceholder
      ? `<details class="engdemo" style="margin-top:6px;border:1px dashed #c9a14a;border-radius:6px;padding:4px 6px">` +
        `<summary style="cursor:pointer;color:#a06a00;font-size:11px">工程情景演示：占位碳量计算（非真实碳量，点击展开）</summary>` +
        `<div class="prop" style="margin-top:4px;color:#b03030"><b>碳量 = 占位派生，非真实碳量</b>（${carbonNum} 由<b>占位 AGB_K</b> 与<b>占位面积</b>算出，仅演示管线计算，<b>不可作信用或真实碳量</b>）</div>` +
        `<div class="prop" style="margin-top:4px;color:#b03030">不确定度 ±${(c.uncertainty * 100).toFixed(0)}%（整体 ±40% 参考；占位参数下仅供参考）</div>` +
        `<div class="prop" style="margin-top:4px;color:#b03030">tokens ${c.carbon_tokens}（占位派生，非真实签发量）</div>` +
        `</details>`
      : `<details class="engdemo" style="margin-top:6px;border:1px dashed #c9a14a;border-radius:6px;padding:4px 6px">` +
        `<summary style="cursor:pointer;color:#1e6b3a;font-size:11px">工程情景演示：碳量计算（点击展开）</summary>` +
        `<div class="prop" style="margin-top:4px">碳量 ${carbonNum} 指示性</div>` +
        `<div class="prop" style="margin-top:4px">不确定度 ±${(c.uncertainty * 100).toFixed(0)}%（整体 ±40% 参考）</div>` +
        `<div class="prop" style="margin-top:4px">tokens ${c.carbon_tokens}</div>` +
        `</details>`;

    const el = document.createElement("div");
    el.className = "claim " + (c.triage === "REVIEW" ? "review" : c.triage === "REJECT" ? "rejected" : "");
    el.innerHTML = `
      <div class="t"><span>${esc(c.claimTypeName)} · ${c.vintage}${c.isControl ? " · 对照" : ""}</span>${badge}</div>
      <div class="m">
        ${fvcHtml}
        ${ecHtml}
        ${amHtml}
        ${reviewReasonHtml}
        ${srcHtml}
        ${phHtml}
        <div class="fc" style="margin-top:4px">${chainHtml(c)}</div>
        <div class="fc" style="margin-top:4px">${cidHtml}</div>
        ${carbonDemoHtml}
      </div>`;
    el.onclick = () => {
      const pid = (p || {}).parcelId;
      if (pid && polyByParcel[pid]) polyByParcel[pid].openPopup();
    };
    box.appendChild(el);
  });

                                       
  const head = document.createElement("div");
  head.style.cssText = "font-size:11px;color:#566;margin:4px 0 10px";
  head.innerHTML = `存量快照(STOCK) <b>${stockCount}</b> 笔（指示性，跨年不可相加为信用）<br>` +
    `碳移除主张(FLOW) <b>${flowCount}</b> 笔，合计 <b>${flowCarbon.toFixed(0)}</b> tC（指示性）<br>` +
    `证据质量评估：<b>${qualityAssessmentLabel()}</b><br>` +
    `复核优先级模型（已训练的无监督工具）：<b>${anomalyModelLabel()}</b>`;
  box.insertBefore(head, box.firstChild);
}

                          
function syncContract() {
                                             
  CHAIN_QUERY_TOKEN++;
  CHAIN = { state: "idle", network: null, error: null };
  CLAIM_CHAIN = {};
  const statusEl = document.getElementById("chainStatus");
  if (statusEl) {
    const addr = currentAddr();
    statusEl.className = "chainst wait";
    statusEl.textContent = addr ? "待核验（地址已填，尚未查询）" : "未配置合约地址";
  }
  if (DATA) renderClaims();
}

function init() {
  const header = document.querySelector("header div:last-child");
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin-left:16px;display:flex;gap:6px;align-items:center";
  wrap.innerHTML = `<span style="font-size:11px;opacity:.85">合约地址</span>`;
  const inp = document.createElement("input");
  inp.id = "addrInput"; inp.placeholder = "粘贴已部署 CarbonMRV 地址 (0x..)，留空=未部署";
  inp.oninput = syncContract;
  wrap.appendChild(inp);

  const btn = document.createElement("button");
  btn.id = "verifyBtn";
  btn.textContent = "核验链上状态";
  btn.onclick = verifyOnChain;
  wrap.appendChild(btn);

  const st = document.createElement("span");
  st.id = "chainStatus";
  st.className = "chainst wait";
  st.textContent = "未配置合约地址";
  wrap.appendChild(st);

  header.appendChild(wrap);

  const slider = document.getElementById("slider");
  const yearLbl = document.getElementById("yearLbl");
  slider.addEventListener("input", () => {
    const i = Number(slider.value);
    yearLbl.textContent = YEARS[i];
    renderParcels(i);
  });

  fetch("records.json")
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      document.title = "CarbonSat-MRV — " + d.projectId.slice(0, 12);
      renderParcels(37);
      renderClaims();
      yearLbl.textContent = "2024";
    })
    .catch((e) => alert("无法加载 records.json：" + e));
}

init();
