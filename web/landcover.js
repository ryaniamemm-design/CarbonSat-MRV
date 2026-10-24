                                                   
  
                                                                           
                                                                              
                                        
  
      
                                                             
                                                                     
                                       

(function () {
  "use strict";

  const state = { data: null, selected: null, currentPkg: null, tampered: false };
  window.__lcp = state;                 

  const NUM_DISPLAY = ["areaM2", "classValidAreaM2", "coverageRatio", "prod_kgC_yr", "prod_tC_yr",
    "intensity_kg_m2_yr", "cellTotalAreaM2", "cellValidAreaM2", "totalIntegral_kgC_yr", "totalProd_tC_yr"];
  const $ = (id) => document.getElementById(id);

  function fmt(v) {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
    return String(v);
  }
  function short(s, n) { s = String(s || ""); return s.length > (n || 34) ? s.slice(0, n || 34) + "…" : s; }

  function bandTag(b) {
    const label = { full: "完整有效足迹", partial: "部分有效足迹", zero: "无有效产品值" }[b] || b;
    return '<span class="tag ' + b + '">' + label + "</span>";
  }

  async function load() {
    const res = await fetch("landcover_sample.json", { cache: "no-store" });
    if (!res.ok) throw new Error("无法加载 landcover_sample.json（HTTP " + res.status + "）");
    state.data = await res.json();
    renderMeta();
    renderStats();
    renderTable();
    renderLims();
  }

  function renderMeta() {
    const m = state.data.meta;
    const a2 = m.sourceA2;
    $("meta").innerHTML =
      '<div class="stat">流：<code>' + (m.streamId || "A2_NPP_LANDCOVER_VALID_FOOTPRINT") + "</code></div>" +
      '<div class="stat">方法版本：<code>' + a2.methodVersion + "</code></div>" +
      '<div class="stat">类别行：' + a2.classRows + " / 格年：" + a2.cellYears + "</div>" +
      '<div class="stat">声明类别：<code>' + m.declarationCategory + "</code></div>" +
      '<div class="stat">归因：<code>' + m.attributionStatus + "</code></div>" +
      '<div class="stat">链接：<code>UNLINKED</code></div>' +
      '<div class="kv" style="margin-top:8px">' +
        "<b>A2 contentAnchor</b><div class='hash'>" + a2.contentAnchor + "</div>" +
        "<b>A2 文件 sha256</b><div class='hash'>" + a2.a2ContentSha256 + "</div>" +
        "<b>整包 packSha256</b><div class='hash'>" + m.wholeBundlePackSha256 + "</div>" +
        "<b>methodHash</b><div class='hash'>" + m.methodHash + "</div>" +
        "<b>样本自锚点</b><div class='hash'>" + state.data.sampleSha256 + "</div>" +
      "</div>" +
      '<div class="lim">整包 packSha256 与 methodHash <b>未上链</b>；本页核验为链下自证。</div>';
  }

  function renderStats() {
    const d = {};
    state.data.records.forEach((r) => { d[r.coverageBand] = (d[r.coverageBand] || 0) + 1; });
    $("stats").innerHTML = ["full", "partial", "zero"].map((b) =>
      '<span class="stat">' + bandTag(b) + " × " + (d[b] || 0) + "</span>").join("");
  }

  function renderTable() {
    const cols = ["cellId", "year", "lcCode", "lcName", "areaM2", "classValidAreaM2",
      "coverageRatio", "prod_kgC_yr", "intensity_kg_m2_yr"];
    $("tbl").tHead.innerHTML = "<tr><th>覆盖档</th>" +
      cols.map((c) => "<th>" + c + "</th>").join("") + "<th>classRowRef</th></tr>";
    $("tbl").tBodies[0].innerHTML = state.data.records.map((r, i) =>
      '<tr data-i="' + i + '">' +
      "<td>" + bandTag(r.coverageBand) + "</td>" +
      cols.map((c) => "<td>" + fmt(r[c]) + "</td>").join("") +
      "<td class='hash'>" + short(r.classRowRef, 22) + "</td>" +
      "</tr>").join("");
    Array.prototype.forEach.call($("tbl").tBodies[0].rows, (tr) => {
      tr.addEventListener("click", () => select(parseInt(tr.getAttribute("data-i"), 10)));
    });
  }

  function renderLims() {
    $("lims").innerHTML = (state.data.meta.limitations || []).map((x) => "<li>" + x + "</li>").join("");
  }

  function select(i) {
    state.selected = i;
    state.tampered = false;
    state.lastRecompute = null;
    state.lastTamper = null;
    state.lastDownload = null;
    const r = state.data.records[i];
    Array.prototype.forEach.call($("tbl").tBodies[0].rows, (tr, j) =>
      tr.classList.toggle("sel", j === i));
    const band = state.data.meta ? r.coverageBand : r.coverageBand;
    const prodCell = (r.classValidAreaM2 === 0)
      ? '<b style="color:#9b2226">无有效产品值（缺测）</b>'
      : fmt(r.prod_kgC_yr) + " " + "<span class='sub'>kg C/yr（有效足迹内产品积分值）</span>";
    $("detail").innerHTML =
      "<div><b>" + r.cellId + " / " + r.year + " / lc" + r.lcCode + " (" + r.lcName + ")</b> " + bandTag(band) + "</div>" +
      '<div class="kv" style="margin-top:8px">' +
        "<b>有效足迹内产品积分值</b><div>" + prodCell + "</div>" +
        "<b>逐类有效面积 classValidAreaM2</b><div>" + fmt(r.classValidAreaM2) + " m²（强度分母）</div>" +
        "<b>全类面积 areaM2</b><div>" + fmt(r.areaM2) + " m²（仅背景指标，不做强度分母）</div>" +
        "<b>有效足迹强度 intensity</b><div>" + (r.intensity_kg_m2_yr === null ? "null（缺测）" : fmt(r.intensity_kg_m2_yr) + " kg C/m²/yr") + "</div>" +
        "<b>覆盖比例 coverageRatio</b><div>" + fmt(r.coverageRatio) + "</div>" +
        "<b>格年合计 totalIntegral</b><div>" + fmt(r.cellContext.totalIntegral_kgC_yr) + " kg C/yr</div>" +
        "<b>格年兄弟集（cellFootprintRef 输入）</b><div>" + (r.cellContext.classRowRefs || []).length + " 项</div>" +
        "<b>classRowRef</b><div class='hash'>" + r.classRowRef + "</div>" +
        "<b>cellFootprintRef</b><div class='hash'>" + r.cellFootprintRef + "</div>" +
      "</div>" +
      '<div class="lim">"有效足迹内产品积分值" = MOD17 模型 NPP × 像元面积 的积分，<b>非地面实测</b>、非碳汇、非碳信用。</div>';
    $("pkgOut").textContent = "（已选中 " + r.cellId + "/" + r.year + "/lc" + r.lcCode + "，可点『重算并核验锚点』）";
  }

  function currentRow() {
    return state.selected === null ? null : state.data.records[state.selected];
  }
  function cellOf(r) {
                                                                    
                                                                    
    return {
      cellId: r.cellId, year: r.year,
      cellTotalAreaM2: r.cellContext.cellTotalAreaM2,
      cellValidAreaM2: r.cellContext.cellValidAreaM2,
      totalIntegral_kgC_yr: r.cellContext.totalIntegral_kgC_yr,
      totalProd_tC_yr: r.cellContext.totalProd_tC_yr,
      classRowRefs: (r.cellContext.classRowRefs || []).slice(),
    };
  }
  function metaContext() {
    const m = state.data.meta;
    return {
      sourceA2ContentAnchor: m.sourceA2.contentAnchor,
      a2ContentSha256: m.sourceA2.a2ContentSha256,
      wholeBundlePackSha256: m.wholeBundlePackSha256,
      methodHash: m.methodHash,
      declarationCategory: m.declarationCategory,
      attributionStatus: m.attributionStatus,
    };
  }

  function doRecompute() {
    const r = currentRow();
    if (!r) { $("pkgOut").textContent = "（请先选择一条记录）"; return; }
    const cell = cellOf(r);
    const pkg = A2Core.buildRowPackage(r, cell, metaContext());
    state.currentPkg = pkg;
                                              
    const expected = { classRowRef: r.classRowRef, cellFootprintRef: r.cellFootprintRef };
    const v = A2Core.verifyRowPackage(pkg, expected);
    const classOk = pkg.classRowRef === r.classRowRef;
    const cellOk = pkg.cellFootprintRef === r.cellFootprintRef;
    const lines = [];
    lines.push("[锚点重算] 类别行 " + r.cellId + "/" + r.year + "/lc" + r.lcCode + "  覆盖档=" + r.coverageBand);
    lines.push("  classRowRef      重算=" + pkg.classRowRef);
    lines.push("                   记录=" + r.classRowRef);
    lines.push("                   一致=" + classOk);
    lines.push("  cellFootprintRef 重算=" + pkg.cellFootprintRef);
    lines.push("                   记录=" + r.cellFootprintRef);
    lines.push("                   一致=" + cellOk
      + "（格年兄弟集 " + cell.classRowRefs.length + " 项：独立重算，非信任包内值）");
    lines.push("  下载包 packageSha256 = " + pkg.packageSha256 + "（对除自身外内容自算）");
    lines.push("  null 语义：classValidAreaM2=" + r.classValidAreaM2 + "，prod=" + fmt(pkg.record.prod_kgC_yr)
      + "（零有效足迹必须为 null，导出不得写 0）");
    lines.push("  核验结果 = " + (v.ok ? "通过 ✔" : "失败 ✘ " + v.errors.join("; ")));
    $("pkgOut").textContent = lines.join("\n");
    state.lastRecompute = {
      ok: v.ok, classOk: classOk, cellOk: cellOk,
      verifyOk: v.ok, errors: v.errors.slice(),
      siblingCount: cell.classRowRefs.length,
      classRowRef: pkg.classRowRef, cellFootprintRef: pkg.cellFootprintRef,
    };
  }

  function doTamper() {
    const r = currentRow();
    if (!r) { $("pkgOut").textContent = "（请先选择一条记录）"; return; }
                                   
    const bad = JSON.parse(JSON.stringify(r));
    bad.prod_kgC_yr = (typeof r.prod_kgC_yr === "number" ? r.prod_kgC_yr : 0) + 1;
    const pkg = A2Core.buildRowPackage(r, cellOf(r), metaContext());                   
    const tampered = JSON.parse(JSON.stringify(pkg));
    tampered.record.prod_kgC_yr = bad.prod_kgC_yr;                                    
    const v = A2Core.verifyRowPackage(tampered,
      { classRowRef: r.classRowRef, cellFootprintRef: r.cellFootprintRef });
    $("pkgOut").textContent =
      "[篡改示范] 仅把下载包内 prod_kgC_yr 由 " + fmt(r.prod_kgC_yr) + " 改为 " + fmt(tampered.record.prod_kgC_yr) + "\n" +
      "  重算 classRowRef   = " + v.recomputed.classRowRef + "\n" +
      "  包内 classRowRef   = " + tampered.classRowRef + "\n" +
      "  核验结果 = " + (v.ok ? "通过（不应发生！）" : "失败 ✔：" + v.errors.join("; "));
    state.lastTamper = { ok: !v.ok, errors: v.errors.slice(), recomputed: v.recomputed.classRowRef,
      inPackage: tampered.classRowRef };
  }

  function doDownload() {
    const r = currentRow();
    if (!r) { $("pkgOut").textContent = "（请先选择一条记录）"; return; }
    const pkg = A2Core.buildRowPackage(r, cellOf(r), metaContext());
    state.currentPkg = pkg;
    const text = JSON.stringify(pkg, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "carbonsat-A2-" + r.cellId + "_" + r.year + "_lc" + r.lcCode + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $("pkgOut").textContent =
      "[下载] " + a.download + "（" + text.length + " 字节）\n" +
      "  record.prod_kgC_yr = " + fmt(pkg.record.prod_kgC_yr) + "（null 原样保留，未被写成 0）\n" +
      "  classRowRef        = " + pkg.classRowRef + "\n" +
      "  cellFootprintRef   = " + pkg.cellFootprintRef + "\n" +
      "  packageSha256      = " + pkg.packageSha256;
    state.lastDownload = { filename: a.download, text: text, prod: pkg.record.prod_kgC_yr,
      classRowRef: pkg.classRowRef, cellFootprintRef: pkg.cellFootprintRef,
      packageSha256: pkg.packageSha256, declarationCategory: pkg.declarationCategory,
      bytes: text.length };
  }

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    $("btnRecompute").addEventListener("click", doRecompute);
    $("btnTamper").addEventListener("click", doTamper);
    $("btnPkg").addEventListener("click", doDownload);
    load()
      .then(() => { if (state.data.records.length) select(0); })
      .catch((e) => { $("meta").textContent = "加载失败：" + e.message; });
  });
})();
