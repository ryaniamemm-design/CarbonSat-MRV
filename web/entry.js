                                         
  
                                    
                                                                       
                                                    
  
                
                                                       
                                                            
                                                      

(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const short = (h, n) => (h ? String(h).slice(0, n || 16) + "…" : "—");
  const num = (v, d) => (v == null || v === "" ? "—" : Number(v).toLocaleString("zh-CN", { maximumFractionDigits: d == null ? 1 : d }));

  const F = {
    merkle: "../evidence/merkle_batch_v2.json",
    merkleV1: "../evidence/merkle_batch.json",                             
    records: "../evidence/npp_evidence_records.json",                           
    chain: "chain_anchor_config.json",
    claims: "records.json",
    annual: "../data/npp_annual_production_integral.csv",
  };

  function banner(kind, msg) {
    const el = $("#banners");
    if (!el) return;
    const cls = kind === "bad" ? "b-bad" : kind === "warn" ? "b-warn" : "b-ok";
    el.insertAdjacentHTML("beforeend", '<div class="banner ' + cls + '">' + msg + "</div>");
  }

  async function getJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " → HTTP " + r.status);
    return r.json();
  }
  async function getText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " → HTTP " + r.status);
    return r.text();
  }

                                                                             
  function renderTwoContracts(cfg, claimsJson) {
    const old = (claimsJson && claimsJson.chain) || {};
    const b = cfg.boundary || {};
    $("#twoContracts").innerHTML =
      '<div class="card card-old">' +
        '<h3>A · 旧「碳主张」合约（<code>web/records.json</code>）</h3>' +
        '<div class="kv"><span>地址</span><b><code>' + esc(old.contractAddress) + "</code></b></div>" +
        '<div class="kv"><span>已部署</span><b class="tag tag-no">' + esc(String(old.deployed)) + "</b></div>" +
        '<div class="kv"><span>网络</span><b>' + esc(old.name || "—") + "</b></div>" +
        '<div class="k">它承载的是 <b>' + (claimsJson.claims || []).length + " 条碳主张</b>的提交入口，" +
          "本地状态仅<b>建议值</b>（REVIEW），<b>不构成已上链</b>。" +
          (old.note ? '<br/><span class="dim">' + esc(old.note) + "</span>" : "") + "</div>" +
      "</div>" +
      '<div class="card card-live">' +
        '<h3>B · 独立 <code>EvidenceAnchor</code>（Sepolia 公共测试网）</h3>' +
        '<div class="kv"><span>地址</span><b><code>' + esc(cfg.contractAddress) + "</code></b></div>" +
        '<div class="kv"><span>chainId</span><b>' + esc(cfg.chainId) + "</b></div>" +
        '<div class="kv"><span>部署 tx / 区块</span><b>' + short(cfg.deployTxHash, 18) + " / " + esc(cfg.deployBlock) + "</b></div>" +
        '<div class="kv"><span>登记 tx / 区块</span><b>' + short(cfg.registerTxHash, 18) + " / " + esc(cfg.registerBlock) + "</b></div>" +
        '<div class="kv"><span>已登记记录</span><b class="tag tag-yes">' + esc(cfg.recordId) + "</b></div>" +
        '<div class="kv"><span>锚定字段</span><b>' + (b.onChainAnchoredFields || []).map(esc).join(" · ") + "</b></div>" +
        '<div class="k dim">核验时间 ' + esc(cfg.verifiedAtUTC) + "；只读 RPC " + esc((cfg.rpc || {}).verifiedReadbackRpcUrl) + "</div>" +
      "</div>" +
      '<div class="verdict">' +
        "<b>结论（现场最容易被误读的一点）</b>：<br/>" +
        "A 的 <code>deployed=false</code> <b>≠</b> 整个项目没上链 —— A 只是<b>未部署的主张合约</b>；" +
        "B 是<b>另一个独立合约</b>，已在 Sepolia 登记了 <b>1 条</b>描述性证据。" +
        '<br/><span class="dim">但仍必须说清：链上只有这 1 条记录的 ' +
        (b.onChainAnchoredFields || []).map(esc).join(" / ") + " 三项；" +
        "整包 packSha256、A2 年度地类流、源文件逐项核验结果<b>均未上链</b>（" +
        'wholeBundle=' + esc(String(b.wholeBundleOnChainAnchored)) +
        "、a2Stream=" + esc(String(b.a2StreamOnChainAnchored)) +
        "、sourceFiles=" + esc(String(b.sourceFileVerificationOnChainAnchored)) + "）。</span>" +
      "</div>";
  }

                                                                                   
    
                                                                    
                                                             
                                                            
  function renderArchitecture(merkle, cfg) {
    const root = merkle.root, pad = merkle.padLeaf;
    const svg = [
      '<svg viewBox="0 0 680 342" width="100%" role="img" aria-label="架构图">',
      '<defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">',
      '<path d="M0,0 L7,3 L0,6 z" fill="#5b7083"/></marker></defs>',
            
      '<rect x="8" y="18" width="150" height="86" rx="6" fill="#f4f7fb" stroke="#9bb"/>',
      '<text x="20" y="38" font-size="12" fill="#0c447c" font-weight="700">离线数据源</text>',
      '<text x="20" y="56" font-size="11" fill="#33506b">MOD17A3HGF NPP 子集</text>',
      '<text x="20" y="72" font-size="11" fill="#33506b">MCD12Q1 逐年地类</text>',
      '<text x="20" y="88" font-size="11" fill="#33506b">源 CSV + 逐项核验脚本</text>',
            
      '<rect x="188" y="18" width="150" height="86" rx="6" fill="#eef4fb" stroke="#7aa7d0"/>',
      '<text x="200" y="38" font-size="12" fill="#0c447c" font-weight="700">816 条证据记录</text>',
      '<text x="200" y="56" font-size="11" fill="#33506b">15 字段 payload</text>',
      '<text x="200" y="72" font-size="11" fill="#33506b">leaf = keccak(payload)</text>',
      '<text x="200" y="88" font-size="11" fill="#33506b">≡ 单条锚定 packHash</text>',
             
      '<rect x="368" y="6" width="300" height="140" rx="6" fill="#fbf8ef" stroke="#d8b25e"/>',
      '<text x="380" y="26" font-size="12" fill="#7a5300" font-weight="700">三层承诺（越往下越「粗」）</text>',
      '<text x="380" y="45" font-size="11" fill="#6b5518">① 单叶 = keccak(payload) = 单条 packHash</text>',
      '<text x="380" y="60" font-size="10.5" fill="#8a7440">　' + short(cfg.packHash, 24) + "（" + esc(cfg.recordId) + "）</text>",
      '<text x="380" y="80" font-size="11" fill="#6b5518">② 批次根 root = ' + short(root, 24) + "</text>",
      '<text x="380" y="97" font-size="11" fill="#6b5518">③ 整包 packSha256（未上链）</text>',
      '<text x="380" y="116" font-size="11" fill="#6b5518">根覆盖 816 个叶；补位到 ' + esc(merkle.paddedCount) + "，depth " + esc(merkle.depth) + "</text>",
      '<text x="380" y="133" font-size="10" fill="#8a7440">padLeaf ' + short(pad, 18) + "（与 ① / ② 不同层）</text>",
           
      '<rect x="188" y="190" width="480" height="112" rx="6" fill="#eef8f2" stroke="#63a98a"/>',
      '<text x="200" y="211" font-size="12" fill="#1d5c43" font-weight="700">链上（Sepolia 11155111）— 只登记「单条」记录的三项</text>',
      '<text x="200" y="232" font-size="11" fill="#2c6b52">recordId = ' + esc(cfg.recordId) + "</text>",
      '<text x="200" y="250" font-size="11" fill="#2c6b52">packHash = ' + short(cfg.packHash, 26) + "　← 就是上面的 ① 单叶</text>",
      '<text x="200" y="268" font-size="11" fill="#2c6b52">methodVersion = ' + esc(cfg.methodVersion) + "</text>",
      '<text x="200" y="286" font-size="11" fill="#2c6b52">declarationCategory = ' + esc(cfg.declarationCategory) + "（唯一允许值）</text>",
           
      '<line x1="158" y1="61" x2="186" y2="61" stroke="#5b7083" stroke-width="1.4" marker-end="url(#ar)"/>',
      '<line x1="338" y1="61" x2="366" y2="61" stroke="#5b7083" stroke-width="1.4" marker-end="url(#ar)"/>',
      '<path d="M250 146 L250 186" stroke="#63a98a" stroke-width="1.4" marker-end="url(#ar)" stroke-dasharray="4 3"/>',
      '<text x="256" y="170" font-size="10" fill="#1d5c43">链上只有 ① 的单条对象；② 批次根未上链</text>',
      '<text x="8" y="332" font-size="10.5" fill="#8a5a00">批次根与整包哈希均为离线计算，onChainAnchored = false —— 不得表述为「整批已上链」。</text>',
      "</svg>",
    ].join("");
    $("#arch").innerHTML = svg;
  }

                                                                        
  function renderStates() {
    const states = [
      { n: "①", t: "单条内容哈希", d: "payload keccak256；链上锚定的就是它", where: "浏览器 / Node", on: true },
      { n: "②", t: "整包清单与下载包哈希", d: "本地离线重算；只证明清单自洽", where: "浏览器 / Node", on: false },
      { n: "③", t: "链上登记", d: "只有单条记录的三项元数据可读回", where: "Sepolia", on: true },
      { n: "④", t: "源文件逐项核验", d: "仅 Python 脚本可做，覆盖 42 个清单文件（manifest.fileCount）", where: "Python", on: false },
    ];
    $("#states").innerHTML = states.map((s) =>
      '<div class="state"><div class="sn">' + s.n + '</div><div class="st">' + esc(s.t) + "</div>" +
      '<div class="sd">' + esc(s.d) + "</div>" +
      '<div class="sw"><span class="tag ' + (s.on ? "tag-yes" : "tag-no") + '">' + (s.on ? "含链上步骤" : "纯离线") +
      "</span> <span class=\"dim\">" + esc(s.where) + "</span></div></div>").join("") +
      '<div class="verdict dim">四态<b>不是</b>四选一：① 是内容一致性，② 是整包自洽，③ 是链上单条存证，④ 是源文件逐项核对。' +
      "任何一态通过都<b>不</b>等于其他态通过；本页只现场重做 ①，并展示 ②③④ 的既有实测结论。</div>";
  }

                                                                 
                                                         
                          
  function breakAnnualCsv(text, mode) {
    const L = String(text).split(/\r?\n/);
    const h = L[0].split(",").map((s) => s.trim());
    const iY = h.indexOf("year"), iP = h.indexOf("prod_tC_yr"), iI = h.indexOf("integral_kgC_yr"), iM = h.indexOf("missing");

                                                        
    if (mode === "dupheader") {
      L[0] = h.concat(["prod_tC_yr"]).join(",");
      for (let i = 1; i < L.length; i++) if (L[i].trim() !== "") L[i] = L[i] + ",0";
      return L.join("\n");
    }
                                                       
    if (mode === "extra") {
      const extra = h.map((n) => (n === "cellId" ? "cell_9999" : n === "year" ? "2012"
        : n === "prod_tC_yr" ? "123" : n === "integral_kgC_yr" ? "123000"
        : n === "missing" ? "False" : "0")).join(",");
      return L.join("\n") + "\n" + extra;
    }

    let idx = -1;
    for (let i = 1; i < L.length; i++) {
      const f = L[i].split(",");
      if (f.length > iY && Number(f[iY]) === 2012) { idx = i; break; }
    }
    if (idx < 0) return text;
    if (mode === "drop") { L.splice(idx, 1); return L.join("\n"); }
    if (mode === "dup") { L.splice(idx, 0, L[idx]); return L.join("\n"); }
    const f = L[idx].split(",");
                                               
    if (mode === "noyear") { f[iY] = "abc"; L[idx] = f.join(","); return L.join("\n"); }
                                                   
    if (mode === "parse") { L[idx] = L[idx] + ",EXTRA_COL"; return L.join("\n"); }
    if (mode === "empty") f[iP] = "";
    else if (mode === "nan") f[iP] = "NaN";
    else if (mode === "inf") f[iP] = "Infinity";
    else if (mode === "missing") f[iM] = "true";
    else if (mode === "unit") f[iP] = f[iI];
    L[idx] = f.join(",");
    return L.join("\n");
  }
  let ANNUAL_RAW = null;

                                                           
  function annualRejectHtml(R) {
    const reasons = [];
    for (const e of R.headerErrors) reasons.push("表头级 " + e.code + "：" + e.msg);
    for (const e of R.unlocatableYearRows) reasons.push("无法定位年份：" + e.msg);
    return '<div style="border-left:4px solid #c0392b;background:#fdecec;padding:10px 12px;border-radius:4px">' +
      '<b style="color:#c0392b">整份输入被拒绝：不产出任何年度、不绘制任何柱</b>' +
      '<div class="dim" style="margin:4px 0 6px">致命错误 ' + reasons.length +
      " 条 —— R1 重复表头 / R2 无法定位年份 拒绝的是<b>整份输入</b>，而不是某一年。" +
      "理由：连「这一行属于哪一年」都无法确定时，任何年度合计都不可核验。</div>" +
      reasons.map((s) => '<div class="res res-no"><b>✗</b> ' + esc(s) + "</div>").join("") + "</div>";
  }

                                                                                     
    
                                                                       
                                                           
                                                     
                                          
                                                                               
  function renderAnnual(csvText) {
    if (csvText) ANNUAL_RAW = csvText;
    const AC = window.AnnualCore;
    const sel = $("#annualBreak");
    const mode = sel ? sel.value : "";
    const R = AC.aggregateAnnual(mode ? breakAnnualCsv(ANNUAL_RAW, mode) : ANNUAL_RAW);
    const rows = R.years;
    const rejected = rows.length === 0;                              
    const complete = rows.filter((r) => r.status === AC.STATUS_COMPLETE);
    const incomplete = rows.filter((r) => r.status === AC.STATUS_INCOMPLETE);

                                      
    $("#annualSpec").innerHTML = [
      ["规范版本", R.specVersion],
      ["期望主键", R.expectedCells.length + " 格 × " + R.expectedYears.length + " 年 = " + R.expectedKeyCount + " 键"],
      ["K1 期望主键", "缺失 " + R.keyErrors.missing.length + " · 意外 " + R.keyErrors.unexpected.length + " · 越界 " + R.keyErrors.badYear.length],
      ["K2 唯一性", "重复键 " + R.keyErrors.duplicate.length],
      ["K3 有限值", "prod_tC_yr / integral_kgC_yr 必须有限（允许 0 与负值）"],
      ["K4 缺测标志", "missing ∈ {true,false}；true ⇒ 该格年不可用"],
      ["K5 单位链", R.unitChainSpec],
      ["R1 重复表头", R.duplicateColumns.length ? "❌ " + R.duplicateColumns.length + " 个重名列 ⇒ 整份拒绝" : "0（通过）"],
      ["R2 年份可定位", R.unlocatableYearRows.length ? "❌ " + R.unlocatableYearRows.length + " 行无法定位 ⇒ 整份拒绝" : "0 行（通过）"],
      ["R3 额外行/解析错误", "解析错误 " + R.parseErrors.length + " 行 ⇒ 该年不可用；越界键 " + R.keyErrors.badYear.length + " 个"],
      ["判读", rejected ? "❌ 整份拒绝（不产出任何年度）"
        : "COMPLETE " + complete.length + " 年 · INCOMPLETE " + incomplete.length + " 年"],
    ].map((r) => '<div class="kv"><span>' + esc(r[0]) + "</span><b><code>" + esc(r[1]) + "</code></b></div>").join("");

                                                                    
    const vals = complete.map((r) => r.total);
    const hi = Math.max(0, Math.max.apply(null, vals.length ? vals : [0]));
    const lo = Math.min(0, Math.min.apply(null, vals.length ? vals : [0]));
    const span = (hi - lo) || 1;
    const W = 660, H = 204, L = 64, T = 14, B = 42, iw = W - L - 14, ih = H - T - B;
    const bw = rows.length ? iw / rows.length : iw;
    const yOf = (v) => T + ih - ((v - lo) / span) * ih;
    const y0 = yOf(0);

    const bars = rows.map((r, i) => {
      const x = L + i * bw + bw * 0.14, w = bw * 0.72, cx = (x + w / 2).toFixed(1);
      const yrLabel = (i % 2 === 0 || r.year === 2012)
        ? '<text x="' + cx + '" y="' + (T + ih + 14) + '" font-size="9" fill="#5b7083" text-anchor="middle">' + r.year + "</text>" : "";
      if (r.status !== AC.STATUS_COMPLETE) {
                                              
        return '<rect x="' + x.toFixed(1) + '" y="' + (y0 - 9).toFixed(1) + '" width="' + w.toFixed(1) + '" height="9"' +
          ' fill="url(#hatch)" stroke="#c0392b" stroke-width="0.8">' +
          "<title>" + r.year + "：INCOMPLETE（缺测 " + r.missingRows + " · 非法 " + r.invalidRows + "）—— 不绘制总量（total=null）</title></rect>" +
          '<text x="' + cx + '" y="' + (y0 - 12).toFixed(1) + '" font-size="8" fill="#c0392b" text-anchor="middle">INCOMPLETE</text>' + yrLabel;
      }
      const yv = yOf(r.total);
      const top = Math.min(y0, yv), hgt = Math.abs(yv - y0);
      const isJump = r.year === 2012;
      return '<rect x="' + x.toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0.6, hgt).toFixed(1) +
        '" fill="' + (isJump ? "#c0392b" : "#4a86c8") + '"><title>' + r.year + "：" + num(r.total) + " tC/yr（" + r.usableRows + " 格）</title></rect>" + yrLabel;
    }).join("");

    const grid = [hi, (hi + lo) / 2, lo].map((v) => {
      const y = yOf(v);
      return '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - 14) + '" y2="' + y.toFixed(1) + '" stroke="#e2e8ef"/>' +
        '<text x="' + (L - 5) + '" y="' + (y + 3).toFixed(1) + '" font-size="9" fill="#7b8c9c" text-anchor="end">' + num(v, 0) + "</text>";
    }).join("");

    $("#annual").innerHTML = rejected ? annualRejectHtml(R) : '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="年度 NPP 序列">' +
      '<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="5" height="5" fill="#fdecec"/><line x1="0" y1="0" x2="0" y2="5" stroke="#e2aeae" stroke-width="1.6"/></pattern></defs>' +
      grid + bars +
      '<line x1="' + L + '" y1="' + y0.toFixed(1) + '" x2="' + (W - 14) + '" y2="' + y0.toFixed(1) + '" stroke="#9bb0c2"/>' +
      '<text x="' + L + '" y="' + (T + ih + 31) + '" font-size="9.5" fill="#7b8c9c">单位：tC/yr（34 格内积分求和）　·　斜纹空槽 = INCOMPLETE（不绘制总量）</text></svg>';

                                                                 
    const st = AC.selftest(ANNUAL_RAW);
    const stBad = (st.failures || []).length;
    $("#annualValidation").innerHTML =
      '<div class="kv"><span>自检结果</span><b>' + (st.ok
        ? '<span class="tag tag-yes">' + st.passed + "/" + st.count + " 通过</span>"
        : '<span class="tag tag-bad">' + (st.count - stBad) + "/" + st.count + " 通过（" + stBad + " 失败）</span>") +
      ' <span class="dim">反例优先：补空值 / 删行 / 重复 / NaN / Inf / 缺测标志 / 单位链 / 越界 / 缺列 / <b>额外行(R3)</b> / <b>解析错误(R3)</b> / <b>无法定位年份(R2)</b> / <b>重复表头(R1)</b>；正例：合法零、合法负值</span></b></div>' +
      (st.cases || []).map((c) =>
        '<div class="res ' + (c.pass ? "res-ok" : "res-no") + '"><b>' + (c.pass ? "✓" : "✗") + "</b> " + esc(c.name) +
        ' <span class="dim">' + esc(c.detail) + "</span></div>").join("");

                       
    const bn = $("#annualBreakNote");
    if (bn) {
      const incY = incomplete.map((y) => y.year).join("、");
      if (mode && rejected) {
        bn.innerHTML = "已现场制造<b>整份拒绝</b>（" + esc(mode) + "）：按 R1/R2 规则<b>不产出任何年度、不绘制任何柱</b>、" +
          "也不给任何总量；致命错误 <b>" + (R.headerErrors.length + R.unlocatableYearRows.length) + "</b> 条。";
      } else if (mode) {
        bn.innerHTML = '已现场篡改内存里的 CSV（2012 年第一格 / 额外行）：判读变为 <b>' + complete.length + " 年 COMPLETE / " +
          incomplete.length + " 年 INCOMPLETE</b>" + (incY ? "（INCOMPLETE：" + esc(incY) + "）" : "") +
          " —— 受影响的那一年<b>不再有总量、也不再画柱</b>（图上显示斜纹空槽）；R3 只影响该年，其余年份照常。";
      } else {
        bn.innerHTML = '<span class="dim">选一项可现场看到「坏输入 ⇒ 该年 INCOMPLETE、不绘制总量」，' +
          "以及「重复表头 / 无法定位年份 ⇒ <b>整份拒绝</b>」；下面的自检面板始终基于未篡改的真实 CSV。</span>";
      }
    }

                      
    const t = AC.totalsByYear(R);
    const pct = (t[2011] != null && t[2012] != null && t[2011] > 0) ? ((t[2012] - t[2011]) / t[2011]) * 100 : null;
    const missTotal = rows.reduce((s, r) => s + r.missingRows, 0);
    const BOUNDARY = "<br/><b>必须同时读到的边界</b>：这是 <b>34 格样本</b>的 MOD17 <b>模型值</b>积分之和 —— <b>不代表库布其</b>、" +
      "<b>不是碳汇</b>（NPP 缺呼吸、扰动与土壤碳），也<b>不是</b>碳信用或减排量。";
    if (rejected) {
      $("#annualNote").innerHTML =
        '<b style="color:#c0392b">整份输入被拒绝（R1 重复表头 / R2 无法定位年份）</b>：表头错误 <b>' + R.headerErrors.length +
        "</b> 条、无法定位年份 <b>" + R.unlocatableYearRows.length + "</b> 行 ⇒ <b>不产出任何年度、不绘制任何柱、不给任何总量</b>。" +
        "<br/><b>为何比「某年 INCOMPLETE」更严</b>：R1 会让被忽略的重名列被静默错读；R2 连「这一行属于哪一年」都无法确定 —— 此时任何年度合计都不可核验。" +
        "<br/><span class=\"dim\">对照 R3（额外行 / 解析错误，但年份可定位）只让<b>受影响的那一年</b>变 INCOMPLETE，其余年份照常给出总量。</span>" +
        BOUNDARY +
        "<br/><span class=\"dim\">注：本页只做算术聚合与输入校验，不产生任何碳科学结论。</span>";
    } else {
      $("#annualNote").innerHTML =
        "聚合自 <code>data/npp_annual_production_integral.csv</code>：<b>" + complete.length + "</b> 年 COMPLETE、" +
        "<b>" + incomplete.length + "</b> 年 INCOMPLETE；期望主键 " + R.expectedKeyCount + " 个（" +
        R.expectedCells.length + " 格 × " + R.expectedYears.length + " 年），缺测 " + missTotal + " 行。" +
        "<br/><b>INCOMPLETE 年一律不绘制总量</b>（total 保持 <code>null</code>，绝不用「已到的部分」冒充全年合计）。" +
        (pct == null ? "" : "<br/>2011→2012 台阶 <b>+" + pct.toFixed(1) + "%</b>（本页按 CSV 现场重算：2011=" + num(t[2011], 1) +
          "、2012=" + num(t[2012], 1) + "）：成因<b>未证实</b>，不得解读为植被恢复或治理增汇。") +
        BOUNDARY +
        "<br/><span class=\"dim\">注：年份 COMPLETE 只说明「该年 34 个格年的输入齐备且通过五项逐年校验 + 三条行/表头级规则」，<b>不</b>说明上游缺测标志本身正确。</span>";
    }
  }

                                                                                    
  let REC = null;
  async function loadRecords() {
    if (REC) return REC;
    const j = await getJSON(F.records);
    REC = j.records || j.items;
    return REC;
  }

                                                   
                                                       
  const V1 = {
    pair(a, b) {
      const x = String(a).toLowerCase(), y = String(b).toLowerCase();
      return x < y ? ethers.keccak256(ethers.concat([x, y])) : ethers.keccak256(ethers.concat([y, x]));
    },
    levels(leaves, padLeaf, depth) {
      let cur = leaves.map((l) => String(l).toLowerCase())
        .concat(new Array(Math.pow(2, depth) - leaves.length).fill(String(padLeaf).toLowerCase()));
      const lv = [cur];
      while (cur.length > 1) {
        const nx = [];
        for (let i = 0; i < cur.length; i += 2) nx.push(this.pair(cur[i], cur[i + 1]));
        lv.push(nx);
        cur = nx;
      }
      return lv;
    },
    chainAt(lv, depth, pos) {
      const out = [];
      let i = pos;
      for (let k = 0; k < depth; k++) { out.push(lv[k][i ^ 1]); i >>= 1; }
      return out;
    },
    fold(leaf, proof) {                                     
      let cur = String(leaf).toLowerCase();
      for (let i = 0; i < proof.length; i++) cur = this.pair(cur, String(proof[i]));
      return cur;
    },
  };
  let V1LIVE = null;                                     

  let C = null, ART = null, TREE = null;

  async function renderMerkleDemo(merkle) {
    ART = merkle;
    C = window.MerkleCore;
    TREE = C.buildTree(merkle.leaves.map((t) => t.leaf));

    const spec = [
      ["规范版本", C.MERKLE_SPEC_VERSION],
      ["内部节点", C.INTERNAL_NODE_SPEC],
      ["路径折叠", C.PATH_FOLD_SPEC],
      ["叶数 / 补位 / 深度", merkle.leafCount + " → " + merkle.paddedCount + " → " + merkle.depth],
      ["批次根（产物）", merkle.root],
      ["recordSetSha256", merkle.recordSetSha256],
      ["onChainAnchored", String(merkle.onChainAnchored)],
    ];
    $("#merkleSpec").innerHTML = spec.map((r) =>
      '<div class="kv"><span>' + esc(r[0]) + "</span><b><code>" + esc(r[1]) + "</code></b></div>").join("");

    const opts = merkle.samples.map((s, i) =>
      '<option value="' + i + '">#' + s.index + " · " + esc(s.recordId) + "（" + esc(s.label) + "）</option>").join("");
    $("#mdPick").innerHTML = opts;
    const claimEl = $("#mdClaim");
    const syncClaim = () => {
      const s = merkle.samples[Number($("#mdPick").value || 0)];
      if (claimEl && s) claimEl.value = String(s.index === 0 ? 1 : 0);
    };
    syncClaim();
    $("#mdPick").onchange = () => { syncClaim(); runDemo(); };
    if (claimEl) claimEl.onchange = () => runDemo();

                      
    const okRoot = TREE.root === merkle.root;
    let badge = okRoot
      ? '<span class="tag tag-yes">浏览器独立重算根 == 产物根</span> <span class="dim">' + short(TREE.root, 22) + "</span>"
      : '<span class="tag tag-bad">浏览器重算根 ≠ 产物根（严重）</span>';

                                                   
    V1LIVE = null;
    try {
      const v1art = await getJSON(F.merkleV1);
      const lv = V1.levels(v1art.leaves.map((t) => t.leaf), v1art.padLeaf, v1art.depth);
      const v1root = lv[lv.length - 1][0];
      V1LIVE = { art: v1art, lv: lv, root: v1root, anchored: v1root === String(v1art.root).toLowerCase() };
      badge += V1LIVE.anchored
        ? '<br/><span class="tag tag-no">v1 参考实现自锚定通过</span> <span class="dim">' +
          "根 " + short(v1root, 22) + "（修复前产物，只读对照）</span>"
        : '<br/><span class="tag tag-bad">v1 参考实现自锚定失败 ⇒ 下方不显示 v1 对照结论</span>';
    } catch (e) {
      badge += '<br/><span class="tag tag-no">未取到修复前产物（' + esc(e.message) + "）⇒ 不显示 v1 对照</span>";
    }
    $("#mdTree").innerHTML = badge;

    const pb = merkle.positionBinding || {};
    $("#mdCases").innerHTML =
      '<div class="kv"><span>PB1</span><b>' + esc((pb.sameLeafOtherIndex || {}).name || "") +
      " — 真实 index " + esc((pb.sameLeafOtherIndex || {}).trueIndex) + "，伪报 " +
      esc(JSON.stringify((pb.sameLeafOtherIndex || {}).claimedIndexes)) + "</b></div>" +
      '<div class="kv"><span>PB2</span><b>' + esc((pb.padLeafFalseIndex || {}).name || "") +
      " — 补位位置 " + esc((pb.padLeafFalseIndex || {}).padPosition) + "，伪报 " +
      esc(JSON.stringify((pb.padLeafFalseIndex || {}).claimedIndexes)) + "</b></div>";

    await runDemo();
  }

  async function runDemo() {
    const i = Number($("#mdPick").value || 0);
    const s = ART.samples[i];
    const claimed = Number($("#mdClaim").value);
    const row = (ok, label, detail) =>
      '<div class="res ' + (ok ? "res-ok" : "res-no") + '"><b>' + (ok ? "✓" : "✗") + "</b> " + label +
      (detail ? ' <span class="dim">' + detail + "</span>" : "") + "</div>";

    let html = "";
                       
    let leaf = s.leaf, v1ok = null;
    try {
      const recs = await loadRecords();
      const rec = recs.find((r) => r.recordId === s.recordId && Number(r.year) === Number(s.year));
      if (!rec) { html += row(false, "记录体重算叶", "在 816 条记录里找不到 " + esc(s.recordId)); }
      else {
        leaf = C.leafOfRecord(rec);
        v1ok = (leaf === String(s.leaf).toLowerCase());
        html += row(v1ok, "① 由记录体重算叶（buildPayload → keccak256）",
          "<code>" + short(leaf, 26) + "</code> vs 产物叶 <code>" + short(s.leaf, 26) + "</code>");
      }
    } catch (e) {
      html += row(false, "① 读取 816 条记录失败", esc(e.message));
    }

                       
    const correct = C.processProof(leaf, s.index, s.proof);
    const ok2 = correct === String(ART.root).toLowerCase();
    html += row(ok2, "② 按真实 index=" + s.index + " 的路径位折叠", "得 <code>" + short(correct, 26) + "</code>（应等于批次根）");

                                                        
    let target = claimed, sub = "";
    if (!Number.isInteger(target) || target === s.index) {
      target = (s.index + 1) % ART.leafCount;
      sub = '　<span class="dim">（输入的 index 与真实 index 相同或非法，已改用 ' + target + " 演示）</span>";
    }
    const pb1ok = !(C.processProof(leaf, target, s.proof) === String(ART.root).toLowerCase());
    let v1note1 = "";
    if (V1LIVE && V1LIVE.anchored) {
                                                          
      const v1proof = V1.chainAt(V1LIVE.lv, V1LIVE.art.depth, s.index);
      const v1pass = V1.fold(leaf, v1proof) === V1LIVE.root;
      v1note1 = '　<span class="dim">对照（修复前 v1：用 v1 自己的证明 + 忽略 index）：同一叶在<b>任意</b> index 下都会 ' +
        (v1pass ? "<b>通过</b>" : "不通过") + " —— 这正是被修掉的缺陷</span>";
    }
    html += row(pb1ok, "③ PB1 反例：把 index 改成 " + target + "（叶与证明都不动）",
      (pb1ok ? "被拒 ✓" : "竟然通过 ✗（位置未绑定！）") + sub + v1note1);

                                          
    const padPos = (ART.positionBinding.padLeafFalseIndex || {}).padPosition;
    const padProof = C.siblingChainAt(padPos, TREE);
    const pb2Targets = (ART.positionBinding.padLeafFalseIndex || {}).claimedIndexes || [0];
    let pb2all = true, pb2detail = [];
    for (const j of pb2Targets) {
      const passed = C.processProof(ART.padLeaf, j, padProof) === String(ART.root).toLowerCase();
      if (passed) pb2all = false;
      pb2detail.push(j + "→" + (passed ? "通过" : "拒绝"));
    }
    let v1note2 = "";
    if (V1LIVE && V1LIVE.anchored) {
      const v1padProof = V1.chainAt(V1LIVE.lv, V1LIVE.art.depth, padPos);
      const v1pass = V1.fold(V1LIVE.art.padLeaf, v1padProof) === V1LIVE.root;
      v1note2 = '　<span class="dim">对照（修复前 v1）：此处会 ' + (v1pass ? "<b>通过</b>" : "不通过") +
        " —— 补位叶伪报合法位置</span>";
    }
    html += row(pb2all, "④ PB2 反例：补位叶 + 真实补位证明（位置 " + padPos + "）+ 伪报 index",
      esc(pb2detail.join("、")) + v1note2);

    html += '<div class="verdict dim">以上四步全部在<b>你自己的浏览器里</b>完成：' +
      "用本页自带的 keccak 与协议实现重算叶、按 index 的 10 个路径位折叠。" +
      "它<b>只</b>证明「该叶位于该根的第 index 位」—— 不证明记录内容真实、不产生碳科学结论；批次根<b>未上链</b>。</div>";
    $("#mdResults").innerHTML = html;
  }

                                                                    
  async function boot() {
    if (!window.ethers) throw new Error("ethers 未加载（应为本地 web/vendor/ethers.umd.min.js）");
    if (!window.E2ECore) throw new Error("web/e2e_core.js（冻结件）未加载");
    if (!window.MerkleCore) throw new Error("web/merkle_core.js 未加载");
    if (!window.AnnualCore) throw new Error("web/annual_core.js 未加载");

    const [cfg, claimsJson, merkle, csv] = await Promise.all([
      getJSON(F.chain), getJSON(F.claims), getJSON(F.merkle), getText(F.annual),
    ]);

    $("#stamp").textContent = "chain_anchor_config verifiedAtUTC = " + cfg.verifiedAtUTC +
      "　|　merkleSpecVersion = " + merkle.merkleSpecVersion +
      "　|　annualSpecVersion = " + window.AnnualCore.ANNUAL_SPEC_VERSION +
      "　|　本页零 CDN 依赖，全部计算在本机浏览器内完成";

    renderTwoContracts(cfg, claimsJson);
    renderArchitecture(merkle, cfg);
    renderStates();
    renderAnnual(csv);
    const breakSel = $("#annualBreak");
    if (breakSel) breakSel.onchange = () => renderAnnual();
    await renderMerkleDemo(merkle);

    banner("ok", "只读演示已就绪：不部署、不发交易、不需要钱包与私钥。批次根未上链；链上只有 1 条记录的三项元数据。");
  }

  window.addEventListener("DOMContentLoaded", function () {
    boot().catch((e) => {
      banner("bad", "<b>初始化失败：</b>" + esc(e.message) +
        "<br/>请确认通过静态服务器打开本页（例如 <code>serve_web.ps1</code>），且 <code>evidence/</code>、<code>data/</code> 可访问。");
      console.error(e);
    });
  });
})();
