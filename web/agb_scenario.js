                                                                                             
  
                                              
                                                 
                               
                                                     
                                                
   
'use strict';
(function () {
  const C = window.AgbCore;
  const $ = id => document.getElementById(id);
  const fmt = (n, d) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d === undefined ? 4 : d });
  const numOrNull = v => { const t = String(v).trim(); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
                                           
  const esc = s => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  let importedPackage = null;
  let formRevision = 0;                           
  let importSeq = 0;

  const B_UNITS = [['tDM/ha', 'tDM/ha（干物质吨/公顷）'], ['kgDM/m2', 'kgDM/m2（干物质千克/平方米）'], ['tC/yr', 'tC/yr（错误：流量，会被拒绝）'], ['tFW/ha', 'tFW/ha（错误：鲜重，会被拒绝）']];
  const FC_UNITS = [['dimensionless', 'dimensionless（无量纲分数）'], ['%', '%（错误：百分数，会被拒绝）']];
  const SRC_TYPES = ['MEASURED', 'LITERATURE', 'LOCAL_SURVEY', 'DEFAULT_TABLE', 'USER_ASSUMPTION', 'SYNTHETIC'];
  const APPL = ['UNKNOWN', 'MEASURED_LOCAL', 'LITERATURE_PENDING_APPLICABILITY', 'USER_ASSUMPTION', 'SYNTHETIC'];

  function selectHtml(id, options, current) {
    return '<select id="' + esc(id) + '">' + options.map(o => {
      const val = Array.isArray(o) ? o[0] : o; const label = Array.isArray(o) ? o[1] : o;
      return '<option value="' + esc(val) + '"' + (val === current ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('') + '</select>';
  }
  function paramFields(prefix, title, units) {
    const p = prefix === 'b' ? C.blankParam('B', 'tDM/ha') : C.blankParam('f_C', 'dimensionless');
    return ''
      + '<label>参数主键<input id="' + prefix + '_parameterId" maxlength="80" value=""></label>'
      + '<label>' + esc(title) + ' 参考值<input id="' + prefix + '_value" type="number" step="any"></label>'
      + '<label>低情景值<input id="' + prefix + '_low" type="number" step="any"></label>'
      + '<label>高情景值<input id="' + prefix + '_high" type="number" step="any"></label>'
      + '<label>单位' + selectHtml(prefix + '_unit', units, p.unit) + '</label>'
      + '<label>来源类型' + selectHtml(prefix + '_sourceType', SRC_TYPES, p.sourceType) + '</label>'
      + '<label>适用性等级' + selectHtml(prefix + '_applicabilityStatus', APPL, p.applicabilityStatus) + '</label>'
      + '<label class="wide">原始出处（文件 / DOI / 标准号）<input id="' + prefix + '_sourceReference" maxlength="500"></label>'
      + '<label>页码 / 表号<input id="' + prefix + '_pageOrTable" maxlength="120"></label>'
      + '<label>适用年份 / 时段<input id="' + prefix + '_applicableYear" maxlength="60"></label>'
      + '<label>适用地区<input id="' + prefix + '_region" maxlength="200"></label>'
      + '<label>适用物种 / 植被类型<input id="' + prefix + '_species" maxlength="200"></label>'
      + '<label>适用龄组<input id="' + prefix + '_ageClass" maxlength="120"></label>'
      + '<label class="wide">取值依据<input id="' + prefix + '_basis" maxlength="500"></label>';
  }
  const PARAM_FIELDS = ['parameterId', 'value', 'low', 'high', 'unit', 'sourceType', 'sourceReference', 'pageOrTable', 'region', 'species', 'ageClass', 'applicableYear', 'basis', 'applicabilityStatus'];

  function readParam(prefix) {
    const p = {};
    PARAM_FIELDS.forEach(f => {
      if (f === 'value' || f === 'low' || f === 'high') { p[f] = numOrNull($(prefix + '_' + f).value); if (Number.isNaN(p[f])) throw new Error(prefix + ' 的 ' + f + ' 不是有限数值'); }
      else p[f] = $(prefix + '_' + f).value;
    });
    return p;
  }
  function writeParam(prefix, p) {
    PARAM_FIELDS.forEach(f => { $(prefix + '_' + f).value = (p[f] === null || p[f] === undefined) ? '' : p[f]; });
  }
  function readRecord() {
    let layers = [];
    try { layers = JSON.parse($('layersJson').value || '[]'); } catch (e) { throw new Error('分层面积 JSON 无法解析'); }
    const st = $('areaSourceType').value;
    return {
      schemaVersion: C.SCHEMA, protocolVersion: C.PROTOCOL, mode: window.__demoMode || 'REAL',
      asOfDate: $('asOfDate').value,
      parcel: { parcelId: $('parcelId').value, name: $('parcelName').value },
      area: { sourceType: st, areaHa: numOrNull($('areaHa').value), geometrySha256: $('geometrySha256').value.trim(), crs: $('crs').value.trim(), algorithm: $('algorithm').value.trim(), unitBasis: 'horizontal_ha', object: $('areaObject').value || C.OBJECT_NAME, fileReference: $('fileReference').value, manual: st === 'MANUAL', overlapChecked: $('overlapChecked').checked, layers },
      biomass: readParam('b'), carbonFraction: readParam('fc'), notes: $('notes').value,
    };
  }
  function writeRecord(r) {
    window.__demoMode = r.mode;
    $('parcelId').value = r.parcel.parcelId; $('parcelName').value = r.parcel.name; $('asOfDate').value = r.asOfDate;
    $('areaSourceType').value = r.area.sourceType; $('areaHa').value = r.area.areaHa === null ? '' : r.area.areaHa;
    $('geometrySha256').value = r.area.geometrySha256; $('crs').value = r.area.crs; $('algorithm').value = r.area.algorithm;
    $('areaObject').value = r.area.object; $('fileReference').value = r.area.fileReference;
    $('overlapChecked').checked = !!r.area.overlapChecked; $('layersJson').value = JSON.stringify(r.area.layers || []);
    writeParam('b', r.biomass); writeParam('fc', r.carbonFraction); $('notes').value = r.notes;
    badge(r.mode);
  }
  function badge(mode) {
    const el = $('modeBadge');
    if (mode === 'SYNTHETIC') { el.className = 'tag warn'; el.textContent = 'SYNTHETIC 合成演示'; }
    else { el.className = 'tag no'; el.textContent = '真实情景（REAL）'; }
  }

  function clearVerdict() { $('packageVerdict').textContent = ''; importedPackage = null; }

     
                                             
                                 
     
  function clearAll(reasonHtml) {
    $('resultBox').innerHTML = reasonHtml ? '<div class="bad">' + reasonHtml + '</div>' : '';
    $('resultWarn').innerHTML = '';
    $('sensBox').innerHTML = '<p class="small">无有效结果 ⇒ 不出情景范围与敏感性。</p>';
    $('tasks').innerHTML = '';
    $('excluded').innerHTML = '';
    $('unassessed').innerHTML = '';
    $('hashDetails').textContent = '情景无效，不生成情景包。';
    importedPackage = null;
    window.__agb._record = null;
    window.__agb._assessment = null;
  }

  function render() {
    let r;
    try { r = readRecord(); } catch (e) { $('resultMode').innerHTML = '<div class="bad">输入错误：' + esc(e.message) + '</div>'; clearAll('结果已清空：解析失败（' + esc(e.message) + '）。请修正输入后再看结果。'); return; }
    const v = C.validateRecord(r);
    if (!v.ok) {
      $('resultMode').innerHTML = '<div class="bad"><b>输入有误（失败关闭）</b>：' + v.errors.map(x => '· ' + esc(x)).join('<br>') + '</div>';
      clearAll('结果已清空：结构校验未通过，共 ' + v.errors.length + ' 项。');
      return;
    }
    let a;
    try { a = C.compute(r); } catch (e) {
      $('resultMode').innerHTML = '<div class="bad">计算失败（失败关闭）：' + esc(e.message) + '</div>';
      clearAll('结果已清空：计算失败（' + esc(e.message) + '）。');
      return;
    }
    const tags = (a.labels || []).map(l => '<span class="tag' + (l === 'SYNTHETIC' ? ' warn' : (l === 'USER_ASSUMPTION' ? ' warn' : '')) + '">' + esc(l) + '</span>').join('');
    $('resultMode').innerHTML = '<div class="notice">模式：<b>' + esc(a.mode) + '</b>　' + tags + (a.conditional ? '<span class="tag no">条件性结果</span>' : '') + '</div>';
    if (a.mode === C.MODES.NO_RESULT) {
      clearAll(esc(a.reason || '必要面积或参数来源不完整 ⇒ 不出结果'));
      $('resultMode').innerHTML = '<div class="notice">模式：<b>' + esc(a.mode) + '</b>　' + tags + '</div>';
    } else {
      $('resultBox').innerHTML = '<div class="big">' + fmt(a.C_AGB_tC, 4) + ' <span style="font-size:14px;color:#607671">tC</span></div>'
        + '<table style="margin-top:8px"><tr><th>项</th><th style="text-align:right">值</th><th>单位</th></tr>'
        + '<tr><td>A（面积）</td><td class="num">' + fmt(a.A_ha, 4) + '</td><td>ha' + (a.A_layered ? '（分层之和，' + a.A_layerSumHa + ' ha）' : '') + '</td></tr>'
        + '<tr><td>B（生物量密度）</td><td class="num">' + fmt(a.B_tDM_per_ha, 4) + '</td><td>tDM/ha' + (a.B_conversion ? '（' + esc(a.B_conversion) + '）' : '') + '</td></tr>'
        + '<tr><td>f_C（碳分数）</td><td class="num">' + fmt(a.f_C, 4) + '</td><td>无量纲</td></tr></table>'
        + '<p class="small">代入：' + fmt(a.A_ha, 4) + ' × ' + fmt(a.B_tDM_per_ha, 4) + ' × ' + fmt(a.f_C, 4) + ' = ' + fmt(a.C_AGB_tC, 4) + ' tC</p>'
        + '<p class="small">面积状态：元数据登记 ' + (a.areaProvenanceRegistered ? '已完成' : '<b>未完成</b>') + '　·　几何独立核验 <b>未做</b>（geometryAreaVerified=false；登记不等于核验）。</p>';
      const warns = []
        .concat(a.warnings || [])
        .concat(a.applicabilityNotes || [])
        .concat(a.sensitivity && a.sensitivity.available === false && a.sensitivity.reason ? [a.sensitivity.reason] : []);
      $('resultWarn').innerHTML = warns.length ? '<div class="warn">' + warns.map(w => '· ' + esc(w)).join('<br>') + '</div>' : '';
      sens(a);
      $('tasks').innerHTML = (a.tasks || []).length
        ? a.tasks.map(t => '<li>' + esc(t.message) + ' <span class="small">[' + esc(t.code) + (t.blocking ? ' · 阻断' : ' · 提示') + ']</span></li>').join('')
        : '<li>当前无补资料任务（不代表真实性或适用性已验证）。</li>';
      $('excluded').innerHTML = (a.excludedPools || []).map(p => '<li>' + esc(C.EXCLUDED_LABELS[p] || p) + '（未纳入）</li>').join('');
      $('unassessed').innerHTML = (a.unassessedElements || []).map(p => '<li>' + esc(C.UNASSESSED_LABELS[p] || p) + '（未评估）</li>').join('');
      $('hashDetails').textContent = '情景摘要域：' + C.SCENARIO_DOMAIN.trim() + '\n包摘要域：' + C.PACKAGE_DOMAIN.trim() + '\n规则/协议：' + C.PROTOCOL + '\n本页不请求网络、不请求钱包。';
      window.__agb._record = r;
      window.__agb._assessment = a;
      return;
    }
    $('tasks').innerHTML = (a.tasks || []).length
      ? a.tasks.map(t => '<li>' + esc(t.message) + ' <span class="small">[' + esc(t.code) + (t.blocking ? ' · 阻断' : ' · 提示') + ']</span></li>').join('')
      : '<li>当前无补资料任务（不代表真实性或适用性已验证）。</li>';
    $('excluded').innerHTML = (a.excludedPools || []).map(p => '<li>' + esc(C.EXCLUDED_LABELS[p] || p) + '（未纳入）</li>').join('');
    $('unassessed').innerHTML = (a.unassessedElements || []).map(p => '<li>' + esc(C.UNASSESSED_LABELS[p] || p) + '（未评估）</li>').join('');
    window.__agb._record = r;
    window.__agb._assessment = a;
  }

  function sens(a) {
    const s = a.sensitivity;
    if (!s || !s.available) {
      const bits = [(s && s.reason) || '缺低/高情景参数 ⇒ 暂不出情景范围与敏感性。'];
      if (s && s.referenceNote) bits.push(s.referenceNote);
      if (s && s.tasks && s.tasks.length) bits.push('相关任务：' + s.tasks.join('、'));
      $('sensBox').innerHTML = '<div class="warn">' + bits.map(x => '· ' + esc(x)).join('<br>') + '</div>';
      return;
    }
    let html = '<table><tr><th>组合</th><th style="text-align:right">B</th><th style="text-align:right">f_C</th><th style="text-align:right">C_AGB（tC）</th></tr>';
    s.combos.forEach(c => { html += '<tr><td>' + esc(c.label) + '</td><td class="num">' + fmt(c.B_tDM_per_ha, 4) + '</td><td class="num">' + fmt(c.f_C, 4) + '</td><td class="num">' + fmt(c.C_AGB_tC, 4) + '</td></tr>'; });
    html += '</table><p class="small">' + esc(s.rangeLabel) + '。' + esc(s.interpretation) + '</p>';
    html += '<p class="small">单参数扰动（其余取参考）：B 低/高 → ' + fmt(s.perturbation[0].C_AGB_tC, 4) + ' / ' + fmt(s.perturbation[1].C_AGB_tC, 4) + '；f_C 低/高 → ' + fmt(s.perturbation[2].C_AGB_tC, 4) + ' / ' + fmt(s.perturbation[3].C_AGB_tC, 4) + '。影响更大的是 <b>' + esc(s.dominantParameter) + '</b>。补测建议须结合来源等级与适用性缺口，不能只看敏感性。</p>';
    $('sensBox').innerHTML = html;
  }

  function doDownload() {
    try {
      const r = readRecord();
      const pkg = C.buildPackage(r, new Date().toISOString());
      const v = C.verifyPackage(pkg);
      const blob = new Blob([JSON.stringify(pkg, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'agb-scenario_' + (r.parcel.parcelId || 'unnamed') + '.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      $('packageVerdict').innerHTML = '已下载。<code>' + esc(pkg.scenarioSha256) + '</code>　核验：' + (v.ok ? '内部自洽' : '失败') + '。未上链、不含信用量。';
    } catch (e) { $('packageVerdict').textContent = '下载失败：' + e.message; }
  }

  function doImport(file) {
    const token = ++importSeq;
    const revisionAtStart = formRevision;
    const reader = new FileReader();
    reader.onload = () => {
      if (token !== importSeq) { $('packageVerdict').textContent = '已忽略过期导入（之后又触发了新的导入）。'; return; }
      if (formRevision !== revisionAtStart) {
        $('packageVerdict').textContent = '已忽略本次导入：读取文件期间表单被改动，避免把旧文件内容写在当前输入之上。';
        return;
      }
      let pkg;
      try { pkg = JSON.parse(reader.result); } catch (e) { $('packageVerdict').innerHTML = '<span style="color:#a32e37">核验失败：无法解析 JSON</span>'; return; }
      const pin = $('expectedSha').value.trim() || undefined;
      const v = C.verifyPackage(pkg, pin);
      if (!v.ok) {
                                        
        $('packageVerdict').innerHTML = '<span style="color:#a32e37"><b>核验失败</b>：' + v.errors.map(e => '· ' + esc(e)).join('<br>') + '</span>';
        $('resultMode').innerHTML = '<div class="bad">导入包核验失败（失败关闭）</div>';
        clearAll('结果已清空：导入包未通过核验。');
        return;
      }
      writeRecord(pkg.record); importedPackage = pkg; formRevision++; render();
      $('packageVerdict').innerHTML = '导入并通过内部核验。情景摘要 <code>' + esc(pkg.scenarioSha256) + '</code>。' + (pin ? '' : '未提供外部可信摘要 ⇒ 内部自洽不证明包未被整体替换。') + (v.warnings.length ? '<br>' + v.warnings.map(w => esc(w)).join('<br>') : '');
    };
    reader.readAsText(file);
  }

  function verifyCurrent() {
    try {
      const pkg = C.buildPackage(readRecord(), new Date().toISOString());
      const v = C.verifyPackage(pkg, $('expectedSha').value.trim() || undefined);
      $('packageVerdict').innerHTML = (v.ok ? '当前情景内部自洽。' : '<span style="color:#a32e37">核验失败：' + v.errors.map(e => esc(e)).join('；') + '</span>') + (v.warnings.length ? '<br>' + v.warnings.map(w => esc(w)).join('<br>') : '');
    } catch (e) { $('packageVerdict').textContent = '核验失败：' + e.message; }
  }

  function demo(kind) {
    let r;
    const today = $('asOfDate').value || new Date().toISOString().slice(0, 10);
    if (kind === 'synthetic') r = C.syntheticRecord(today);
    else if (kind === 'badunit') { r = C.syntheticRecord(today); r.biomass.unit = 'tC/yr'; }
    else { r = C.blankRecord(today); r.parcel.parcelId = 'DEMO-MISSING-01'; r.parcel.name = '合成骨架：参数未填'; r.area.areaHa = 10; }
    writeRecord(r); clearVerdict(); render();
  }

  function init() {
    $('paramB').innerHTML = paramFields('b', 'B', B_UNITS);
    $('paramFC').innerHTML = paramFields('fc', 'f_C', FC_UNITS);
    $('asOfDate').value = new Date().toISOString().slice(0, 10);
    $('areaObject').value = C.OBJECT_NAME;
    const onEdit = () => { formRevision++; clearVerdict(); render(); };
    $('agbForm').addEventListener('input', onEdit);
    $('agbForm').addEventListener('change', onEdit);
    $('btnBlank').addEventListener('click', () => { window.__demoMode = 'REAL'; writeRecord(C.blankRecord($('asOfDate').value || new Date().toISOString().slice(0, 10))); clearVerdict(); formRevision++; render(); });
    $('btnDemo').addEventListener('click', () => demo($('demoCase').value));
    $('btnDownload').addEventListener('click', doDownload);
    $('btnVerifyCurrent').addEventListener('click', verifyCurrent);
    $('packageFile').addEventListener('change', e => { if (e.target.files[0]) doImport(e.target.files[0]); e.target.value = ''; });
    window.__demoMode = 'REAL';
    demo('synthetic');
    $('btnBlank').click();
  }

  window.__agb = {
    getRecord() { return this._record; },
    getAssessment() { return this._assessment; },
    getImportedPackage() { return importedPackage; },
    getPackage() { const r = readRecord(); return C.buildPackage(r, new Date().toISOString()); },
    demo(kind) { demo(kind); },
    readCurrent() { return readRecord(); },
    formRevision() { return formRevision; },
  };

  init();
})();
