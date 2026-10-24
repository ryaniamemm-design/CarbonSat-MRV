                                                                                                        
  
                                              
                                                    
                                          
                                     
                                               
   
'use strict';
(function () {
  const C = window.NppEntryCore;
  const $ = id => document.getElementById(id);
  const fmt = (n, d) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 3 : d });
                                           
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const svgNS = 'http://www.w3.org/2000/svg';
  let bundle = null, pin = null, verification = null, bundleFileSha = null, bundleSource = '';

  function setLoadState(html, cls) { const el = $('loadState'); el.className = cls || 'notice'; el.innerHTML = html; }

  async function fetchText(path) {
    try { const r = await fetch(path, { cache: 'no-store' }); if (!r.ok) return null; return await r.text(); } catch (e) { return null; }
  }

                   
  function renderVerification(label, state) {
    const v = verification;
    if (!v) { $('verification').innerHTML = '<p class="small">尚未载入数据包。</p>'; return; }
    const rows = [];
    rows.push(['载入方式', esc(label)]);
    rows.push(['① 内部重算（结构 + 关系式 + 内容摘要）', v.structure && v.structure.ok && v.content && v.content.ok ? '<b>通过</b>' : '<b>未通过</b>']);
    rows.push(['② 已发布摘要（pin）', '<b>' + esc(v.publishedPin ? v.publishedPin.status : 'UNKNOWN') + '</b>　' + esc(v.publishedPin ? v.publishedPin.note : '')]);
    rows.push(['② 文件字节摘要（本次读取）', esc(bundleFileSha ? bundleFileSha.slice(0, 16) + '…' : '（内存载入，无文件字节）')]);
    rows.push(['② 已发布文件摘要（pin 登记）', esc(pin ? pin.bundleFileSha256.slice(0, 16) + '…' : '（未找到 pin 文件）')]);
    rows.push(['③ 源文件逐项复算', '<b>未核验</b>（本页不读源 CSV/A2）']);
    rows.push(['内容摘要（重算）', '<code>' + esc(v.content && v.content.recomputed ? v.content.recomputed : '—') + '</code>']);
    rows.push(['本次载入判定', state === 'REJECTED' ? '<b>已拒绝</b>' : (state === 'OK' ? '<b>已接受</b>' : '—')]);
    $('verification').innerHTML = '<div class="kv">' + rows.map(r => '<span>' + r[0] + '</span><b>' + r[1] + '</b>').join('') + '</div>'
      + (v.errors && v.errors.length ? '<div class="bad">' + v.errors.map(x => '· ' + esc(x)).join('<br>') + '</div>' : '')
      + '<p class="small">' + esc(v.trustNote || '') + '</p>';
  }

                                  
  function applyBundleText(text, label) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, errors: ['数据包解析失败：' + e.message] }; }
    const fileSha = C.textSha256(text);
    const v = C.verifyBundle(parsed, { pin: pin || undefined, fileSha256: fileSha });
    verification = v;
    if (!v.ok) {
      renderVerification(label, 'REJECTED');
      const prev = bundle ? '页面仍是<b>上一份已核验</b>的数据包视图（未采用本次被拒内容）。' : '页面当前无可用数据包视图。';
      setLoadState('<b>本次载入已被拒绝（失败关闭）</b>：' + esc(v.errors.join('；')) + '　' + prev, 'bad');
      return { ok: false, errors: v.errors, verification: v };
    }
    bundle = parsed; bundleFileSha = fileSha; bundleSource = label;
    renderVerification(label, 'OK');
    buildControls();
    const extra = v.publishedPin.status === 'MATCHED' ? '与已发布摘要一致。'
      : (v.publishedPin.status === 'CONTENT_ONLY' || v.publishedPin.status === 'CONTENT_OK_FILE_DIFFERENT' ? '内容与已发布摘要一致（未按字节比对）。' : '未与已发布摘要比对（未找到 pin）⇒ 只能证明内部自洽，不能证明未被整体替换。');
    setLoadState('已载入数据包：' + esc(String(parsed.observedCellYears)) + ' 格年 / ' + esc(String(parsed.observedClassRows)) + ' 地类行；来源 ' + esc(parsed.generatedFrom.productionIntegral.path) + '（' + esc(parsed.generatedFrom.productionIntegral.sha256.slice(0, 12)) + '…）。' + extra + ' ③ 源文件逐项复算：未核验。', 'notice');
    show();
    return { ok: true, verification: v };
  }

  function buildControls() {
    const cs = $('cellSelect');
    if (!cs.options.length) {
      bundle.cells.forEach(c => { const o = document.createElement('option'); o.value = c.cellId; o.textContent = c.cellId + '（' + c.lon.toFixed(2) + '°E, ' + c.lat.toFixed(2) + '°N）'; cs.appendChild(o); });
      const ys = $('yearSelect');
      bundle.years.forEach(y => { const o = document.createElement('option'); o.value = String(y); o.textContent = String(y); ys.appendChild(o); });
      cs.addEventListener('change', show);
      ys.addEventListener('change', show);
      $('btnExport').addEventListener('click', doExport);
      $('bundleFile').addEventListener('change', e => { if (e.target.files[0]) loadFromFile(e.target.files[0]); e.target.value = ''; });
    }
    if (!cs.value || !bundle.cells.some(c => c.cellId === cs.value)) cs.value = bundle.cells[0].cellId;
    const ys = $('yearSelect');
    if (!ys.value) ys.value = '2012';
  }

  function loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = applyBundleText(String(reader.result), '选择文件：' + file.name);
      if (!res.ok) renderVerification('选择文件：' + file.name, 'REJECTED');
    };
    reader.readAsText(file);
  }

  function show() {
    if (!bundle) return;
    try {
      const cellId = $('cellSelect').value, year = Number($('yearSelect').value);
      const d = C.describeCellYear(bundle, cellId, year);
      $('identity').innerHTML = '<b>' + esc(d.identity) + '</b><br>' + esc(d.eraLabel) + '　·　格心 ' + Number(d.lon).toFixed(4) + '°E / ' + Number(d.lat).toFixed(4) + '°N　·　有效面积 ' + fmt(d.footprint.validAreaHa, 2) + ' ha';
      footprintSvg(d);
      values(d);
      landCover(d);
      yearTotals();
      series(cellId);
      provenance(d);
      $('excluded').innerHTML = d.excludedErrors.map(x => '<li>' + esc(x) + '</li>').join('');
      window.__nppEntry._view = d;
    } catch (e) {
      window.__nppEntry._view = null;
      $('values').innerHTML = '<div class="bad">渲染失败（失败关闭）：' + esc(e.message) + '</div>';
      $('landCover').innerHTML = ''; $('yearTotals').innerHTML = ''; $('series').innerHTML = '';
      $('provenance').innerHTML = ''; $('viewHash').textContent = '';
    }
  }

  function footprintSvg(d) {
    const W = 640, H = 320, pad = 24;
    const lons = bundle.cells.map(c => c.lon), lats = bundle.cells.map(c => c.lat);
    const lo0 = Math.min.apply(null, lons) - 0.06, lo1 = Math.max.apply(null, lons) + 0.06;
    const la0 = Math.min.apply(null, lats) - 0.06, la1 = Math.max.apply(null, lats) + 0.06;
    const x = lon => pad + (lon - lo0) / (lo1 - lo0) * (W - 2 * pad);
    const y = lat => H - pad - (lat - la0) / (la1 - la0) * (H - 2 * pad);
    const h = 0.03;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', '100%'); svg.setAttribute('height', '320');
    const bg = document.createElementNS(svgNS, 'rect'); bg.setAttribute('x', 0); bg.setAttribute('y', 0); bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', '#f7faf8');
    svg.appendChild(bg);
    bundle.cells.forEach(c => {
      const r = document.createElementNS(svgNS, 'rect');
      const sel = c.cellId === d.cellId;
      r.setAttribute('x', x(c.lon - h)); r.setAttribute('y', y(c.lat + h));
      r.setAttribute('width', Math.max(3, x(c.lon + h) - x(c.lon - h))); r.setAttribute('height', Math.max(3, y(c.lat - h) - y(c.lat + h)));
      r.setAttribute('fill', sel ? 'rgba(23,103,80,0.28)' : 'rgba(23,103,80,0.06)');
      r.setAttribute('stroke', sel ? '#176750' : '#9ebdaf'); r.setAttribute('stroke-width', sel ? '2' : '1');
      r.setAttribute('data-cell', c.cellId);
      svg.appendChild(r);
    });
    const note = document.createElementNS(svgNS, 'text');
    note.setAttribute('x', pad); note.setAttribute('y', H - 6); note.setAttribute('fill', '#607671'); note.setAttribute('font-size', '11');
    note.textContent = '示意位置图（WGS84 经纬度，等距近似）；方格为离散采样框，非治理地块边界。高亮=' + d.cellId;
    svg.appendChild(note);
    const box = $('footprintSvg'); box.innerHTML = ''; box.appendChild(svg);
  }

  function values(d) {
    const v = d.values;
    const rows = [
      ['生产量（tC/yr）', v.prod_tC_yr.value, fmt(v.prod_tC_yr.value, 2), v.prod_tC_yr.label],
      ['积分原值（kgC/yr）', v.integral_kgC_yr.value, fmt(v.integral_kgC_yr.value, 1), v.integral_kgC_yr.label],
      ['栅格有效面积（m²）', v.gridValidAreaM2.value, fmt(v.gridValidAreaM2.value, 1), v.gridValidAreaM2.label],
      ['栅格总面积（m²）', v.gridTotalAreaM2.value, fmt(v.gridTotalAreaM2.value, 1), v.gridTotalAreaM2.label],
      ['矢量测地面积（m²）', v.geomAreaM2.value, fmt(v.geomAreaM2.value, 1), v.geomAreaM2.label],
      ['有效面积比例', v.validAreaRatio.value, fmt(v.validAreaRatio.value, 4), v.validAreaRatio.label],
    ];
    let html = '<div class="big">' + (d.usable ? fmt(v.prod_tC_yr.value, 2) + ' <span style="font-size:14px;color:#607671">tC/yr</span>' : '— 不可用') + '</div>';
    html += '<table style="margin-top:10px"><tr><th>量</th><th style="text-align:right">值</th><th>说明</th></tr>';
    rows.forEach(r => { html += '<tr><td>' + esc(r[0]) + '</td><td class="num">' + esc(r[2]) + '</td><td class="small">' + esc(r[3]) + '</td></tr>'; });
    html += '</table><p class="small">流量（tC/yr）与库存（tC）不可相加；本页只有流量。模型 NPP 不是实测通量，不是碳汇。</p>';
    $('values').innerHTML = html;
    const yc = d.yearCompleteness;
    $('usableState').innerHTML = d.usable
      ? '<div class="notice">该格年可用。该年 ' + esc(String(yc.cellCount)) + ' 格合计：' + (yc.complete ? esc(fmt(yc.total_tC, 2)) + ' tC/yr（完整）' : '<b>空（不完整，缺 ' + esc(String(yc.missingCount)) + ' 格）</b>') + '。视图摘要：<code>' + esc(d.viewSha256) + '</code></div>'
      : '<div class="bad">该格年<b>不可用</b>：' + esc(d.unusableReason) + '。生产量保持空，不填 0。</div>';
  }

  function landCover(d) {
    if (!d.landCover.length) { $('landCover').innerHTML = '<p class="small">该格年没有地类分解行。</p>'; return; }
    const maxA = Math.max.apply(null, d.landCover.map(r => Number.isFinite(r.classValidAreaM2) ? r.classValidAreaM2 : 0)) || 1;
    let html = '<table><tr><th>IGBP 类别</th><th style="text-align:right">有效面积（m²）</th><th style="text-align:right">生产量（tC/yr）</th><th style="text-align:right">强度（kgC·m⁻²·yr⁻¹）</th><th>占比条</th></tr>';
    d.landCover.forEach(r => {
      const w = Math.max(2, (Number.isFinite(r.classValidAreaM2) ? r.classValidAreaM2 : 0) / maxA * 100);
      html += '<tr><td>' + esc(r.lcCode) + ' · ' + esc(r.lcName) + '</td><td class="num">' + fmt(r.classValidAreaM2, 1) + '</td><td class="num">' + (r.noValidProduct ? '<span class="tag no">无有效产品值</span>' : fmt(r.prod_tC_yr, 2)) + '</td><td class="num">' + (r.noValidProduct ? '—' : fmt(r.intensity_kg_m2_yr, 4)) + '</td><td><div class="lc-bar" style="width:' + w + '%"></div></td></tr>';
    });
    html += '</table>';
    $('landCover').innerHTML = html;
  }

  function yearTotals() {
    const rows = C.allYearTotals(bundle);
    let html = '<table><tr><th>年</th><th style="text-align:right">合计（tC/yr）</th><th>完整性</th><th>era</th></tr>';
    rows.forEach(r => {
      html += '<tr><td>' + esc(r.year) + '</td><td class="num">' + (r.complete ? fmt(r.total_tC, 2) : '<span class="tag no">空（不完整）</span>') + '</td><td class="small">' + (r.complete ? '34/34 可用' : esc(String(r.missingCount)) + ' 格不可用') + '</td><td class="small">era ' + esc(r.era) + '</td></tr>';
    });
    html += '</table>';
    $('yearTotals').innerHTML = html;
  }

  function series(cellId) {
    const s = C.annualSeries(bundle, cellId);
    const W = 640, H = 200, pad = 30, n = s.series.length;
    const vals = s.series.map(x => x.prod_tC_yr).filter(v => Number.isFinite(v));
    const mx = vals.length ? Math.max.apply(null, vals) : 1, mn = vals.length ? Math.min.apply(null, vals) : 0;
    const bw = (W - 2 * pad) / n;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', '100%'); svg.setAttribute('height', '200');
    const bg = document.createElementNS(svgNS, 'rect'); bg.setAttribute('width', W); bg.setAttribute('height', H); bg.setAttribute('fill', '#f7faf8'); svg.appendChild(bg);
    const span = Math.max(mx - mn, 1e-9);
    s.series.forEach((x, i) => {
      const bx = pad + i * bw + 1, bwid = Math.max(2, bw - 2);
      if (!Number.isFinite(x.prod_tC_yr)) {
        const t = document.createElementNS(svgNS, 'rect'); t.setAttribute('x', bx); t.setAttribute('y', H - pad - 4); t.setAttribute('width', bwid); t.setAttribute('height', '4'); t.setAttribute('fill', '#a32e37'); svg.appendChild(t);
        return;
      }
      const hh = 8 + (x.prod_tC_yr - mn) / span * (H - 2 * pad - 10);
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', bx); r.setAttribute('y', H - pad - hh); r.setAttribute('width', bwid); r.setAttribute('height', hh);
      r.setAttribute('fill', x.era === 2 ? '#2f8f6f' : '#7fb69f');
      r.dataset.year = String(x.year);
      svg.appendChild(r);
    });
    const y2012 = pad + (s.series.findIndex(x => x.year === 2012)) * bw;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', y2012); line.setAttribute('x2', y2012); line.setAttribute('y1', 10); line.setAttribute('y2', H - pad);
    line.setAttribute('stroke', '#a32e37'); line.setAttribute('stroke-dasharray', '4 3'); svg.appendChild(line);
    const lbl = document.createElementNS(svgNS, 'text');
    lbl.setAttribute('x', y2012 + 4); lbl.setAttribute('y', 18); lbl.setAttribute('fill', '#a32e37'); lbl.setAttribute('font-size', '11');
    lbl.textContent = '2012 附近结构性断点（成因未证实）'; svg.appendChild(lbl);
    const foot = document.createElementNS(svgNS, 'text');
    foot.setAttribute('x', pad); foot.setAttribute('y', H - 8); foot.setAttribute('fill', '#607671'); foot.setAttribute('font-size', '11');
    foot.textContent = '原始序列（tC/yr）；深色=era 2，浅色=era 1；红条=该格年不可用。不绘制跨断点增长箭头/增长率/治理效果。';
    svg.appendChild(foot);
    const box = $('series'); box.innerHTML = ''; box.appendChild(svg);
  }

  function provenance(d) {
    $('provenance').innerHTML = d.provenance.map(p => '<div class="kv"><span>' + esc(p.label) + '</span><b>' + esc(p.value) + '</b></div>').join('');
    $('viewHash').textContent = d.viewSha256;
    window.__nppEntry._viewSha = d.viewSha256;
  }

  function doExport() {
    try {
      const d = window.__nppEntry._view;
      if (!bundle || !d) { $('exportVerdict').textContent = '当前没有已通过核验的数据包视图，拒绝导出。'; return; }
      const opts = { pin: pin || undefined, fileSha256: bundleFileSha };
      const pack = C.buildExport(bundle, d.cellId, d.year, opts);
      const v = C.verifyExport(pack, Object.assign({ bundle }, opts));
      if (!v.ok) { $('exportVerdict').innerHTML = '<b>导出被拒绝</b>：' + v.errors.map(x => '· ' + esc(x)).join('<br>'); return; }
      const blob = new Blob([JSON.stringify(pack, null, 2) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'npp-estimate-view_' + d.cellId + '_' + d.year + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      $('exportVerdict').innerHTML = '已导出；核验：内部重算通过、与数据包交叉重算通过。摘要 <code>' + esc(pack.exportSha256) + '</code>。'
        + '<br>① 内部重算：通过　② 已发布摘要：' + esc(v.provenance[1].status) + '　③ 源文件逐项复算：未核验。仅视图快照，未上链、不含碳量或信用量。';
    } catch (e) { $('exportVerdict').textContent = '导出失败：' + e.message; }
  }

  async function boot() {
    pin = null;
    const pinText = await fetchText('npp_estimate_bundle.pin.json');
    if (pinText) { try { pin = JSON.parse(pinText); } catch (e) { pin = null; } }
    const text = await fetchText('npp_estimate_bundle.json');
    if (text) { applyBundleText(text, '页面自动读取（含 pin 比对）'); return; }
    setLoadState('未能自动读取 web/npp_estimate_bundle.json（可能以 file:// 打开）。请用“载入数据包”选择该文件；未与已发布摘要比对前，页面不会声称来源已核验。', 'warn');
    renderVerification('未载入', '—');
  }

  window.__nppEntry = {
    get loaded() { return !!bundle; },
    getBundle() { return bundle; },
    getView() { return this._view; },
    getViewSha() { return this._viewSha; },
    getVerification() { return verification; },
    getPin() { return pin; },
    getFileSha() { return bundleFileSha; },
    select(cellId, year) {
      if (!bundle) return false;
      try { $('cellSelect').value = cellId; $('yearSelect').value = String(year); show(); return true; } catch (e) { return false; }
    },
    loadText(text) { return applyBundleText(text, '内存文本载入（外部内容）'); },
    yearTotals() { return bundle ? C.allYearTotals(bundle) : null; },
  };

  boot();
})();
