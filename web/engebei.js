                                 
  
                                                
                                               
   
(function () {
  'use strict';
  var C = window.EngebeiCore;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var short = function (s) { return s ? String(s).slice(0, 22) + '…' : '—'; };
  var fmt = function (v, d) {
    if (v === null || v === undefined) return '—';
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return v.toFixed(d === undefined ? 2 : d);
  };

  var bundle = null;                           
  var lastGood = null;                               
  var lastGoodNote = '';
  var lastVerdict = null;
  var lastExportPack = null;
  var pinLoaded = null;                       
  var bundleFileSha = null;
  var stats = { externalRequests: 0, walletCalls: 0 };

                                                                           
  function clearDerived(reason) {
    ['caseInfo', 'acquireInfo', 'yearDetail', 'areaInfo', 'srcInfo', 'boundaryInfo', 'chart', 'chartNote']
      .forEach(function (id) { var el = $(id); if (el) el.innerHTML = ''; });
    var t = $('yearTable'); if (t) t.innerHTML = '';
    var s = $('yearSel'); if (s) s.innerHTML = '';
    var v = $('verifyVerdict'); if (v) v.innerHTML = '';
    $('yearHint').textContent = '';
    if (reason) $('loadState').innerHTML = '<span class="bad">' + esc(reason) + '</span>';
  }

  function renderStatute() {
    $('statuteBanner').textContent = C.WINDOW_LABEL + '。';
  }

  function renderCase(v) {
    var w = bundle.window, m = bundle.methodology, d = bundle.delivery;
    var html = '';
    html += '<div class="kv"><span>案例 ID</span><b class="mono">' + esc(bundle.caseId) + '</b></div>';
    html += '<div class="kv"><span>案例类型</span><b>公开资料研究案例（' + esc(bundle.caseKind) + '）</b></div>';
    html += '<div class="kv"><span>范围性质</span><b class="warn">' + esc(w.statute) + '</b></div>';
    html += '<div class="kv"><span>范围标注（逐字）</span><b>' + esc(w.label) + '</b></div>';
    html += '<div class="kv"><span>范围来源</span><b>论文 DOI <span class="mono">' + esc(bundle.sourceRef.paperDoi) + '</span>；来源类型：<span class="mono">' + esc(bundle.sourceRef.paperKind) + '</span></b></div>';
    html += '<div class="kv"><span>取得程度</span><b class="mono">' + esc(bundle.sourceRef.paperAccessLevel) + '</b></div>';
    html += '<div class="kv"><span>作者接受稿来源</span><b class="mono small">' + esc(bundle.sourceRef.paperAuthorVersionUrl) + '</b></div>';
    html += '<div class="kv"><span>作者接受稿 / 出版定稿</span><b class="small">' + esc(bundle.sourceRef.paperVersionNote) + '</b></div>';
    html += '<div class="kv"><span>论文自报坐标</span><b class="mono">' + esc(w.dmsSource) + '</b></div>';
    html += '<div class="kv"><span>本案例窗口（WGS84）</span><b class="mono">W ' + fmt(w.boundsWGS84.W, 9) + ' , S ' + fmt(w.boundsWGS84.S, 9) + ' , E ' + fmt(w.boundsWGS84.E, 9) + ' , N ' + fmt(w.boundsWGS84.N, 9) + '</b></div>';
    html += '<div class="kv"><span>窗口哈希（脚本派生）</span><b class="mono">' + esc(bundle.windowSha256) + '</b></div>';
    html += '<div class="kv"><span>窗口测地面积</span><b class="mono">' + fmt(w.areaNote.windowApproxKm2, 2) + ' km²</b></div>';
    html += '<div class="kv"><span>论文自报面积</span><b class="mono">' + fmt(w.areaNote.paperReportedKm2, 2) + ' km²</b> <span class="tag warn">口径不同 · 待核</span></div>';
    html += '<div class="kv"><span>与 34 格关系</span><b>' + (w.noOverlapWith34Cells ? '包围盒不相交（相交数 = 0）' : '未知') + '</b></div>';
    html += '<div class="kv"><span>计算产品 / 年份</span><b class="mono">' + esc(m.product) + ' · ' + esc(m.band) + ' · ' + bundle.years[0] + '–' + bundle.years[bundle.years.length - 1] + '</b></div>';
    $('caseInfo').innerHTML = html;
    var note = document.createElement('div');
    note.className = 'small';
    note.style.marginTop = '8px';
    note.textContent = w.areaNote.note;
    $('caseInfo').appendChild(note);
  }

  function renderAcquire() {
    var d = bundle.delivery, rs = bundle.records, yrs = bundle.years;
    var failed = yrs.filter(function (y) { return rs[String(y)].computeStatus !== 'OK'; });
    var noValid = yrs.filter(function (y) { return rs[String(y)].validCoverageStatus === 'NO_VALID_PIXELS'; });
    var partial = yrs.filter(function (y) { return rs[String(y)].validCoverageStatus === 'PARTIAL_COVERAGE'; });
    var stateCls = d.state === 'COMPLETE' ? 'ok' : (d.state === 'PARTIAL' ? 'warn' : 'bad');
    var html = '';
    html += '<div class="kv"><span>交付状态</span><b class="' + stateCls + '">' + esc(d.state) + '</b></div>';
    html += '<div class="kv"><span>① 年份是否全部取得</span><b class="mono">' + d.yearsOk.length + ' / ' + d.totalYears + '</b> ' + (failed.length ? '<span class="tag bad">缺 ' + failed.length + ' 年</span>' : '<span class="tag ok">全部取得</span>') + '</div>';
    html += '<div class="kv"><span>② 每年计算是否成功</span><b class="mono">' + bundle.counts.ok + ' / ' + bundle.counts.years + '</b></div>';
    html += '<div class="kv"><span>③ 有效足迹覆盖</span><b>整窗覆盖 <span class="mono">' + bundle.counts.coverageFull + '</span> · 部分覆盖 <span class="mono">' + bundle.counts.coveragePartial + '</span> · 无有效值 <span class="mono">' + bundle.counts.coverageNone + '</span></b></div>';
    if (failed.length) {
      html += '<div class="kv"><span>失败年份</span><b class="bad mono">' + failed.map(function (y) { return y + '(' + rs[String(y)].computeStatus + ')'; }).join('、') + '</b></div>';
    }
    if (partial.length) {
      html += '<div class="kv"><span>覆盖提示</span><b class="warn">' + partial.length + ' 年只有**部分**窗口面积存在有效产品值 ⇒ 结果名称是「该年有效产品足迹上的碳生产量」，**不是**整个研究窗口的总量。</b></div>';
    }
    if (noValid.length) {
      html += '<div class="kv"><span>无有效值年份</span><b>' + noValid.join('、') + '</b></div>';
    }
    html += '<div class="small" style="margin-top:8px">' + esc(d.note) + '</div>';
    $('acquireInfo').innerHTML = html;
  }

  function renderYearOptions() {
    var sel = $('yearSel');
    sel.innerHTML = bundle.years.map(function (y) {
      var r = bundle.records[String(y)];
      var mark = r.computeStatus !== 'OK' ? '（取数失败）' : (r.validCoverageStatus === 'FULL_COVERAGE' ? '（整窗覆盖）' : '（部分覆盖）');
      return '<option value="' + y + '">' + y + ' ' + mark + '</option>';
    }).join('');
    sel.onchange = function () { renderYear(Number(sel.value)); };
    if (bundle.years.length) { sel.value = String(bundle.years[0]); renderYear(bundle.years[0]); }
  }

  function renderYear(y) {
    var r = bundle.records[String(y)];
    $('yearHint').textContent = '';
    if (!r) { clearYearDetail('该年份不在数据包内。'); return; }
    var html = '';
    if (r.computeStatus !== 'OK') {
      html += '<div class="bad">该年**取数失败**（' + esc(r.computeStatus) + '）：' + esc(r.missingReason) + '。' +
        '这是**数据获取/计算**状态，<b>不表示</b>研究窗口当年没有产品值，也**不得**填 0 或插值。</div>';
      $('yearDetail').innerHTML = html;
      return;
    }
    if (r.missing || r.validCoverageStatus === 'NO_VALID_PIXELS') {
      html += '<div class="warn">该年窗口内**无有效产品值**，故不给出生产量（不填 0）。原因：' + esc(r.missingReason) + '</div>';
      $('yearDetail').innerHTML = html;
      return;
    }
    html += '<div class="kv"><span>年度 NPP 碳生产量（模型值）</span><b class="mono">' + fmt(r.prod_tC_yr, 2) + ' tC/yr</b></div>';
    html += '<div class="kv"><span>积分（kg C/yr）</span><b class="mono">' + fmt(r.integral_kgC_yr, 2) + '</b></div>';
    html += '<div class="kv"><span>单位链</span><b class="mono">prod_tC_yr = integral_kgC_yr / 1000</b></div>';
    html += '<div class="kv"><span>窗口测地面积 geomAreaM2</span><b class="mono">' + fmt(r.geomAreaM2, 0) + ' m²</b></div>';
    html += '<div class="kv"><span>栅格总面积 gridAreaM2</span><b class="mono">' + fmt(r.gridAreaM2, 0) + ' m²</b></div>';
    html += '<div class="kv"><span>栅格有效面积 gridValidAreaM2</span><b class="mono">' + fmt(r.gridValidAreaM2, 0) + ' m²</b></div>';
    html += '<div class="kv"><span>栅格有效面积比例 validAreaRatio</span><b class="mono">' + fmt(r.validAreaRatio, 6) + '</b> <span class="tag warn">' + esc(r.validCoverageStatus) + '</span></div>';
    html += '<div class="kv"><span>有效像元数 / 负值像元数</span><b class="mono">' + r.validPixels + ' / ' + r.nppNegPixels + '</b></div>';
    html += '<div class="kv"><span>有效像元原始 DN 均值</span><b class="mono">' + fmt(r.nppRawMean, 4) + '</b></div>';
    html += '<div class="kv"><span>产物口径</span><b class="mono">' + esc(r.product) + ' · ' + esc(r.mask) + ' · ' + esc(r.crs) + ' · scale ' + r.scale + ' · ' + esc(r.method_version) + '</b></div>';
    if (r.validCoverageStatus === 'PARTIAL_COVERAGE') {
      html += '<div class="small warn" style="margin-top:6px">该年比例为 ' + fmt(r.validAreaRatio * 100, 2) + '%，即窗口内约 ' + fmt((1 - r.validAreaRatio) * 100, 2) + '% 的栅格面积**没有**有效产品值 ⇒ 上表数值只代表**有效产品足迹**上的生产量。</div>';
    }
    html += '<div class="small" style="margin-top:8px">足迹同一性恒 UNVERIFIED：不读取像元掩膜 ⇒ 不得把两年面积数值相等读作「同一批像元」。</div>';
    $('yearDetail').innerHTML = html;
  }

  function clearYearDetail(msg) {
    $('yearDetail').innerHTML = '<div class="small">' + esc(msg) + '</div>';
  }

  function renderChart() {
    var yrs = bundle.years, rs = bundle.records;
    var vals = yrs.map(function (y) { return rs[String(y)].computeStatus === 'OK' ? rs[String(y)].prod_tC_yr : null; });
    var nums = vals.filter(function (v) { return typeof v === 'number' && isFinite(v); });
    var min = nums.length ? Math.min.apply(null, nums) : 0;
    var max = nums.length ? Math.max.apply(null, nums) : 1;
    var lo = Math.floor(min * 0.95), hi = Math.ceil(max * 1.05);
    var W = 1040, H = 300, pad = { l: 64, r: 16, t: 14, b: 34 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var x = function (i) { return pad.l + (yrs.length <= 1 ? iw / 2 : iw * i / (yrs.length - 1)); };
    var yv = function (v) { return pad.t + ih * (1 - (v - lo) / (hi - lo || 1)); };
    var eraIdx = yrs.indexOf(C.ERA_BOUNDARY_YEAR);
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img">'];
                                           
    if (eraIdx > 0) {
      svg.push('<rect x="' + x(0) + '" y="' + pad.t + '" width="' + (x(eraIdx - 1) - x(0)) + '" height="' + ih + '" fill="#1d2732"/>');
      svg.push('<rect x="' + x(eraIdx) + '" y="' + pad.t + '" width="' + (x(yrs.length - 1) - x(eraIdx)) + '" height="' + ih + '" fill="#20303f"/>');
      svg.push('<line x1="' + (x(eraIdx - 1) + x(eraIdx)) / 2 + '" y1="' + pad.t + '" x2="' + (x(eraIdx - 1) + x(eraIdx)) / 2 + '" y2="' + (pad.t + ih) + '" stroke="#d29922" stroke-dasharray="4 4"/>');
    }
               
    for (var g = 0; g <= 4; g++) {
      var v = lo + (hi - lo) * g / 4, yy = yv(v);
      svg.push('<line x1="' + pad.l + '" y1="' + yy + '" x2="' + (pad.l + iw) + '" y2="' + yy + '" stroke="#2b333d"/>');
      svg.push('<text x="' + (pad.l - 8) + '" y="' + (yy + 4) + '" fill="#9fb0c0" font-size="11" text-anchor="end">' + Math.round(v) + '</text>');
    }
                                  
    var segs = [[0, eraIdx - 1], [eraIdx, yrs.length - 1]];
    segs.forEach(function (sg) {
      var d = '';
      for (var i = sg[0]; i <= sg[1]; i++) {
        if (!(i >= 0 && i < vals.length)) continue;
        if (vals[i] === null) { d = ''; continue; }
        d += (d ? ' L' : 'M') + x(i) + ' ' + yv(vals[i]);
      }
      if (d) svg.push('<path d="' + d + '" fill="none" stroke="#58a6ff" stroke-width="2"/>');
    });
    yrs.forEach(function (y, i) {
      if (vals[i] === null) {
        svg.push('<text x="' + x(i) + '" y="' + (pad.t + ih - 4) + '" fill="#f85149" font-size="14" text-anchor="middle">×</text>');
      } else {
        svg.push('<circle cx="' + x(i) + '" cy="' + yv(vals[i]) + '" r="3" fill="#7ee787"/>');
      }
      if (i % 2 === 0 || i === yrs.length - 1) {
        svg.push('<text x="' + x(i) + '" y="' + (pad.t + ih + 18) + '" fill="#9fb0c0" font-size="10.5" text-anchor="middle">' + y + '</text>');
      }
    });
    svg.push('<text x="' + pad.l + '" y="' + (H - 6) + '" fill="#9fb0c0" font-size="11">单位：tC/yr（模型值） · 左段 2001–2011，右段 2012–2024</text>');
    svg.push('</svg>');
    $('chart').innerHTML = svg.join('');
    $('chartNote').innerHTML = '分段之间**不连线**、不拟合趋势、不给增长率或「恢复幅度」：' +
      esc((bundle.methodology || {}).eraNote || '') +
      ' 空心/×表示该年取数失败或无有效值（不填 0）。';
  }

  function renderTable() {
    var rows = ['<tr><th>年份</th><th style="text-align:right">tC/yr</th><th style="text-align:right">有效面积比例</th><th style="text-align:right">有效像元</th><th>覆盖状态</th><th>计算状态</th></tr>'];
    bundle.years.forEach(function (y) {
      var r = bundle.records[String(y)];
      var cls = r.computeStatus !== 'OK' ? 'bad' : (r.validCoverageStatus === 'FULL_COVERAGE' ? 'ok' : 'warn');
      rows.push('<tr><td>' + y + '</td><td class="num">' + fmt(r.prod_tC_yr, 2) + '</td><td class="num">' +
        (r.validAreaRatio === null ? '—' : fmt(r.validAreaRatio, 6)) + '</td><td class="num">' +
        (r.validPixels === null ? '—' : r.validPixels) + '</td><td class="' + cls + '">' + esc(r.validCoverageStatus) +
        '</td><td>' + esc(r.computeStatus) + '</td></tr>');
    });
    $('yearTable').innerHTML = rows.join('');
  }

  function renderArea() {
    var first = bundle.records[String(bundle.years[0])];
    var html = '';
    html += '<div class="kv"><span>geomAreaM2（窗口矢量测地面积）</span><b class="mono">' + fmt(first.geomAreaM2, 0) + ' m²</b></div>';
    html += '<div class="kv"><span>gridAreaM2（窗口内全部栅格像元面积和）</span><b class="mono">' + fmt(first.gridAreaM2, 0) + ' m²</b></div>';
    html += '<div class="kv"><span>gridValidAreaM2（有效掩膜栅格面积和）</span><b class="mono">' + fmt(first.gridValidAreaM2, 0) + ' m²</b></div>';
    html += '<div class="bar" style="margin:8px 0"><i style="width:' + (first.validAreaRatio * 100).toFixed(2) + '%"></i></div>';
    html += '<div class="small">有效掩膜面积占比 ' + fmt(first.validAreaRatio * 100, 2) + '%（其余面积**没有**有效产品值；这不是「观测质量」，也不是 QC 掩膜损失）。</div>';
    html += '<div class="small" style="margin-top:6px">三个面积量**不可混用**：矢量面积、栅格总面积、栅格有效面积；积分分母是**逐像元测地面积**，不是「像元数 × 250000 m²」。</div>';
    html += '<div class="small" style="margin-top:6px">栅格总面积与矢量面积不要求相等（投影/像元化差异），本页不强行对齐两者。</div>';
    $('areaInfo').innerHTML = html;
  }

  function renderSrc() {
    var m = bundle.methodology, s = bundle.sourceRef;
    var html = '';
    html += '<div class="kv"><span>产品 / 波段</span><b class="mono">' + esc(m.product) + ' · ' + esc(m.band) + ' · 版本 ' + esc(m.productVersion) + '</b></div>';
    html += '<div class="kv"><span>缩放 / 有效原始值域</span><b class="mono">×' + m.nppScale + ' · [' + m.validRawRange[0] + ', ' + m.validRawRange[1] + ']（排除 32761–32767 填充码；保留 0 与负值）</b></div>';
    html += '<div class="kv"><span>掩膜</span><b class="mono">' + esc(m.maskName) + '</b></div>';
    html += '<div class="kv"><span>投影 / 尺度</span><b class="mono">' + esc(m.crs) + ' · scale ' + m.pixelScaleM + ' m · bestEffort=false</b></div>';
    html += '<div class="kv"><span>积分式</span><b class="mono">' + esc(m.integration) + '</b></div>';
    html += '<div class="kv"><span>单位</span><b class="mono">' + esc(m.prodUnit) + '（模型年度 NPP 碳生产量）</b></div>';
    html += '<div class="kv"><span>方法版本</span><b class="mono">' + esc(m.methodVersion) + '</b></div>';
    html += '<div class="kv"><span>容差语义</span><b class="mono">' + m.rtolNumeric + ' = ' + esc(m.rtolSemantics) + '</b>（仅数值一致性，**非**科学阈值）</div>';
    html += '<div class="kv"><span>源 CSV</span><b class="mono">' + esc(s.csvPath) + '<br>' + esc(s.csvSha256) + '</b></div>';
    html += '<div class="kv"><span>窗口规格</span><b class="mono">' + esc(s.windowSpecPath) + '<br>' + esc(s.windowSpecSha256) + '</b></div>';
    html += '<div class="kv"><span>取数记录</span><b class="mono">' + esc(s.fetchLogPath) + '</b></div>';
    $('srcInfo').innerHTML = html;
  }

  function renderBoundary() {
    var b = bundle.boundary;
    var html = '<div class="row"><span class="tag">claimClass: ' + esc(b.claimClass) + '</span>' +
      '<span class="tag">attributionStatus: ' + esc(b.attributionStatus) + '</span>' +
      '<span class="tag">registrable: ' + esc(b.registrable) + '</span>' +
      '<span class="tag">removalCount: ' + esc(b.removalCount) + '</span>' +
      '<span class="tag">footprintIdentity: ' + esc(b.footprintIdentity) + '</span></div>';
    html += '<div style="margin-top:10px"><b class="ok">能说</b><ul class="notes">' +
      b.canSay.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    html += '<div style="margin-top:8px"><b class="bad">不能说</b><ul class="notes">' +
      b.cannotSay.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    html += '<div style="margin-top:8px"><b class="warn">局限（不得删减）</b><ul class="notes">' +
      b.limitations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    html += '<div class="small" style="margin-top:8px">' + esc(b.redLineNote) + '</div>';
    $('boundaryInfo').innerHTML = html;
  }

  function renderAll() {
    renderCase(); renderAcquire(); renderYearOptions(); renderChart(); renderTable();
    renderArea(); renderSrc(); renderBoundary();
    $('caseInfo').parentNode.classList.remove('hide');
  }

                                                                              
  function adopt(text, label, fileSha) {
    var obj;
    try { obj = JSON.parse(text); } catch (e) {
      rejectImport('JSON 解析失败：' + e.message);
      return false;
    }
    var v = C.verifyBundle(obj);
    lastVerdict = v;
    if (!v.ok) {
      rejectImport('本次载入已被拒绝（结构或语义核验未通过）：' + v.errors.slice(0, 3).join('；'));
      return false;
    }
    bundle = obj;
    lastGood = obj;
    lastGoodNote = label || '载入件';
    bundleFileSha = fileSha || null;
    renderAll();
    $('loadState').innerHTML = '<span class="ok">已载入并通过核验：' + esc(lastGoodNote) + '</span>' +
      ' · 年份 <b>' + bundle.counts.years + '</b> · 交付状态 <b>' + esc(bundle.delivery.state) + '</b>' +
      ' · 数据包摘要 <span class="mono">' + esc(short(bundle.stableDigest)) + '</span>';
    return true;
  }

  function rejectImport(reason) {
                                                
    clearDerived(null);
    var keep = '';
    if (lastGood) {
      bundle = lastGood;
      renderAll();
      keep = '<br><span class="tag warn">当前显示的仍是上一份已核验数据</span>：' + esc(lastGoodNote) +
        '（窗口 <span class="mono">' + esc(short(lastGood.windowSha256)) + '</span>，摘要 <span class="mono">' + esc(short(lastGood.stableDigest)) + '</span>）';
    } else {
      bundle = null;
    }
    $('loadState').innerHTML = '<span class="bad">' + esc(reason) + '</span>' + keep;
  }

  function textSha(t) {
    try {
      return (typeof ethers !== 'undefined' && ethers.sha256 && ethers.toUtf8Bytes)
        ? ethers.sha256(ethers.toUtf8Bytes(t)).slice(2) : null;
    } catch (e) { return null; }
  }

  function autoLoad() {
    fetch('./engebei_bundle.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { adopt(t, 'web/engebei_bundle.json（fetch）', textSha(t)); })
      .catch(function (e) {
        $('loadState').innerHTML = '<span class="warn">自动载入失败（' + esc(e.message) +
          '）。若以 file:// 打开，浏览器会拦截 fetch —— 这是预期行为；请用下方「选择文件载入」选择 <span class="mono">web/engebei_bundle.json</span>。</span>';
      });
  }

  function loadPin() {
    fetch('./engebei_bundle.pin.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (p) { pinLoaded = p; $('verifyVerdict').innerHTML = '<span class="ok">已取得本站独立持有的 pin（stableDigest <span class="mono">' + esc(short(p.stableDigest)) + '</span>）。</span>'; })
      .catch(function (e) {
        pinLoaded = null;
        $('verifyVerdict').innerHTML = '<span class="warn">未取得独立 pin（' + esc(e.message) + '）⇒ 来源层 ② 只能报「未评估（仅包内声明）」。</span>';
      });
  }

                                                                             
  $('btnAuto').onclick = function () { adoptReset(); autoLoad(); };
  $('fileInput').onchange = function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { adoptReset(); adopt(String(rd.result), '载入文件 ' + f.name, textSha(String(rd.result))); };
    rd.readAsText(f);
    ev.target.value = '';
  };
  $('btnClear').onclick = function () {
    bundle = null; lastGood = null; lastGoodNote = ''; lastVerdict = null; lastExportPack = null;
    clearDerived('已清除。页面不再显示任何案例数值。');
    $('loadState').innerHTML = '已清除；未显示任何数据。';
  };
  function adoptReset() { var v = $('verifyVerdict'); if (v) v.innerHTML = ''; var i = $('importVerdict'); if (i) i.innerHTML = ''; }

  $('btnVerify').onclick = function () {
    if (!bundle) { $('verifyVerdict').innerHTML = '<span class="bad">尚未载入数据包。</span>'; return; }
    var v = C.verifyBundle(bundle, { pin: pinLoaded || undefined, fileSha256: bundleFileSha || undefined });
    var prov = v.provenance.map(function (x) { return x.level + ' ' + esc(x.name) + '：<b>' + esc(x.status) + '</b>'; }).join('<br>');
    var pe = v.pinEvaluation || {};
    var pinLines = '<div class="small">② 已发布摘要：<b>' + esc(v.pinStatus || 'NOT_EVALUATED') + '</b>' +
      ' · 内容匹配 <b>' + esc(String(pe.contentMatch)) + '</b>' +
      ' · 文件字节匹配 <b>' + esc(pe.fileBytesMatch === null || pe.fileBytesMatch === undefined ? '未比对' : String(pe.fileBytesMatch)) + '</b></div>';
    var tot = C.annualTotals(bundle);
    $('verifyVerdict').innerHTML = (v.ok ? '<div class="ok">现场重算通过</div>' : '<div class="bad">现场重算未通过</div>') +
      '<div class="small">核验年份 ' + v.checkedYears + ' · 窗口哈希重算 <span class="mono">' + esc(short(v.windowSha256Recomputed)) + '</span>' +
      ' · 数据包摘要重算 <span class="mono">' + esc(short(v.stableDigestRecomputed)) + '</span></div>' +
      '<div class="small">年度合计是否可呈现：<b>' + (tot.ok ? '可（24/24 OK）' : '不可（任一年非 OK ⇒ 全部置空，不输出部分和）') + '</b></div>' +
      pinLines +
      '<div class="small" style="margin-top:6px">' + prov + '</div>' +
      (v.errors.length ? '<div class="bad small">' + v.errors.map(function (x) { return '· ' + esc(x); }).join('<br>') + '</div>' : '');
    lastVerdict = v;
  };

  $('btnPin').onclick = function () {
    if (!pinLoaded) { loadPin(); setTimeout(function () { $('btnPin').click(); }, 400); return; }
    if (!bundle) { $('verifyVerdict').innerHTML = '<span class="bad">尚未载入数据包。</span>'; return; }
    $('btnVerify').click();
  };

  $('btnExport').onclick = function () {
    if (!bundle) { $('importVerdict').innerHTML = '<span class="bad">尚未载入数据包。</span>'; return; }
    try {
      lastExportPack = C.buildExport(bundle, { generatedAtUTC: new Date().toISOString() });
      $('importVerdict').innerHTML = '<div class="ok">已生成导出件（stable 部分不含时间戳）。</div>' +
        '<div class="kv"><span>stableDigest</span><b class="mono">' + esc(lastExportPack.stableDigest) + '</b></div>' +
        '<div class="kv"><span>事件时间戳（仅事件封套）</span><b class="mono">' + esc(lastExportPack.event.generatedAtUTC) + '</b></div>';
    } catch (e) {
      lastExportPack = null;
      $('importVerdict').innerHTML = '<span class="bad">拒绝导出：' + esc(e.message) + '</span>';
    }
  };

  $('btnReimport').onclick = function () {
    var text = null;
    if (lastExportPack) text = JSON.stringify(lastExportPack);
    else { $('importVerdict').innerHTML = '<span class="bad">没有可重新导入的导出件，请先生成。</span>'; return; }
    var pack;
    try { pack = JSON.parse(text); } catch (e) { $('importVerdict').innerHTML = '<span class="bad">解析失败：' + esc(e.message) + '</span>'; return; }
    var v = C.verifyExport(pack, { currentBinding: bundle ? { windowSha256: bundle.windowSha256, csvSha256: bundle.sourceRef.csvSha256 } : undefined });
    var st = C.stalenessOf(pack, bundle ? { windowSha256: bundle.windowSha256, csvSha256: bundle.sourceRef.csvSha256 } : null);
    var html = '<h3 style="margin:6px 0;font-size:13px">重新导入导出件</h3>';
    html += v.ok ? '<div class="ok">该件自校验通过（① 内部重算；外层身份与内含数据包一致）。</div>' : '<div class="bad">该件自校验未通过：' + v.errors.map(function (x) { return '· ' + esc(x); }).join('<br>') + '</div>';
    html += '<div class="kv"><span>文件内 stableDigest</span><b class="mono">' + esc(pack.stableDigest || '—') + '</b></div>';
    html += '<div class="kv"><span>本次会话重算 stableDigest</span><b class="mono">' + esc(C.dig(C.EXPORT_STABLE_DOMAIN, pack.stable)) + '</b></div>';
    html += '<div class="kv"><span>窗口版本</span><b>' + (st.windowSame ? '<span class="tag ok">与本机当前窗口一致</span>' : '<span class="tag bad">窗口不一致 / 已过期</span>') + ' ' + esc(short(st.label)) + '</b></div>';
    html += '<div class="kv"><span>源产物版本</span><b>' + (st.sourceSame === null ? '<span class="tag">未比对</span>' : (st.sourceSame ? '<span class="tag ok">源 CSV 摘要一致</span>' : '<span class="tag bad">同窗口但源产物版本不同</span>')) + '</b></div>';
    html += '<div class="warn small">' + esc(st.note) + '</div>';
    html += '<div class="small">' + esc(C.SELF_DIGEST_NOTE) + '</div>';
    $('importVerdict').innerHTML = html;
  };

  $('btnDownload').onclick = function () {
    if (!lastExportPack) { $('importVerdict').innerHTML = '<span class="bad">没有可下载的导出件，请先生成。</span>'; return; }
    var blob = new Blob([JSON.stringify(lastExportPack, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'engebei_case_export_' + (bundle ? bundle.caseId : 'case') + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    $('importVerdict').innerHTML = '<div class="ok">已触发下载：' + esc(a.download) + '</div>';
  };

  window.addEventListener('error', function () { stats.walletCalls += 0; });

                               
  window.__engebei = {
    getBundle: function () { return bundle; },
    getLastGood: function () { return lastGood; },
    getExportPack: function () { return lastExportPack; },
    getPin: function () { return pinLoaded; },
    verify: function () { return C.verifyBundle(bundle, { pin: pinLoaded || undefined, fileSha256: bundleFileSha || undefined }); },
    importText: function (t, label, sha) { return adopt(t, label || '手动导入', sha || null); },
    rejectImport: rejectImport,
    loadPin: loadPin,
    setPin: function (p) { pinLoaded = p; },
    stats: stats,
  };

  renderStatute();
  autoLoad();
  loadPin();
})();
