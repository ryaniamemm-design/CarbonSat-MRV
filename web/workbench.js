                                
  
                         
                                                         
                               
  
                                                       
                                           
   
(function () {
  'use strict';

  var C = window.WorkbenchCore;
  var T = window.CarbonSatEnglish;
  var rawEsc = T.esc;
  var N = window.NppEntryCore;
  var E = window.EngebeiCore;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return T.text(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var REGISTRY = null;                                              
  var STATE = C.createState();
  var GATE = C.createGate();
  var VIEWS = {};                                                   
  var UI = { tab: 'detail', srcOpen: false, search: '' };
  var TILES = { status: 'off', note: '', cache: {}, errors: 0, ok: 0, pending: 0, since: 0 };
  var STATS = {
    staleDropped: 0, loads: 0, rejections: 0,
    externalRequests: 0, walletCalls: 0,
  };

                                                                            
  function banner(kind, html) {
    var b = $('banner');
    var translated=T.text(html||'');
    if(/[\u3400-\u9fff]/.test(translated)){translated=(kind==='bad'?'Input rejected. Unverified input is not adopted.':'Request notice. Invalid location parameters are rejected; the default or previous verified selection is retained.')+'<details class="rawEvidence" data-original><summary>Original diagnostic (Chinese)</summary>'+html+'</details>';}
    b.innerHTML=html?'<div class="'+kind+'">'+translated+'</div>':'';
  }
  function sha256Hex(buf) {
    return C.sha256Bytes(new Uint8Array(buf));
  }
  function bytesToText(buf) { return new TextDecoder('utf-8').decode(buf); }

                        
                                                  
                                        
  async function fetchBytes(path) {
    var r;
    try { r = await fetch(path, { cache: 'no-store' }); }
    catch (e) { var en = new Error('网络获取失败：' + e.message); en.kind = 'NETWORK'; throw en; }
    if (r.status === 404) { var e404 = new Error('未找到：' + path); e404.kind = 'NOT_FOUND'; e404.status = 404; throw e404; }
    if (!r.ok) { var eh = new Error('HTTP ' + r.status + '：' + path); eh.kind = 'HTTP'; eh.status = r.status; throw eh; }
    return await r.arrayBuffer();
  }

                                                                               
                                                              
  function sibling(p) { return String(p).split('/').pop(); }

  async function loadCaseData(caseKey) {
    var conf = C.CASES[caseKey];
    STATS.loads += 1;

                         
    var bundleBuf = await fetchBytes(sibling(conf.bundlePath));
    var fileSha = sha256Hex(bundleBuf);
    var bundle;
    try { bundle = JSON.parse(bytesToText(bundleBuf)); }
    catch (e) { throw new Error('数据包不是合法 JSON：' + e.message); }

                                            
                                                   
                                           
                                                  
    var pin = null, pinInput = 'ABSENT', pinReason = '文件不存在（HTTP 404）';
    try {
      var pinBuf = await fetchBytes(sibling(conf.pinPath));
      var parsedPin;
      try { parsedPin = JSON.parse(bytesToText(pinBuf)); }
      catch (e) { throw new Error('发布摘要（pin）不是合法 JSON ⇒ 拒绝载入：' + e.message); }
      if (parsedPin === null || typeof parsedPin !== 'object' || Array.isArray(parsedPin)) {
        throw new Error('发布摘要（pin）结构非法（' + (parsedPin === null ? 'null' : (Array.isArray(parsedPin) ? 'array' : typeof parsedPin)) + '）⇒ 拒绝载入');
      }
      pin = parsedPin; pinInput = 'OK'; pinReason = '';
    } catch (e) {
      var kind = e && e.kind;
      if (kind === 'NOT_FOUND') { pinInput = 'ABSENT'; pinReason = e.message; }
      else if (kind === 'NETWORK' || kind === 'HTTP') { pinInput = 'FETCH_FAILED'; pinReason = e.message; }
      else { throw e; }
    }

    var verdict = (caseKey === 'A')
      ? N.verifyBundle(bundle, { pin: pin || undefined, fileSha256: fileSha })
      : E.verifyBundle(bundle, { pin: pin || undefined, fileSha256: fileSha });

    if (!verdict.ok) {
      var err = new Error('核验未通过：' + (verdict.errors || []).slice(0, 3).join('；'));
      err.verdict = verdict;
      throw err;
    }
    var model = (caseKey === 'A')
      ? C.buildModelA(bundle, { pin: pin, fileSha256: fileSha, verdict: verdict })
      : C.buildModelB(bundle, { pin: pin, fileSha256: fileSha, verdict: verdict });
    model.sourceKind = 'file';
    model.pinInput = pinInput;
    model.pinReason = pinReason;
    return { bundle: bundle, pin: pin, fileSha: fileSha, verdict: verdict, model: model };
  }

  function pickObject(model, wanted) {
    if (!model) return null;
    if (wanted && C.objectById(model, wanted)) return wanted;
    return model.objects.length ? model.objects[0].id : null;
  }
  function pickYear(model, wanted) {
    if (!model) return null;
    var y = Number(wanted);
    if (Number.isInteger(y) && model.years.indexOf(y) >= 0) return y;
    return model.years[model.years.length - 1];
  }

     
                                                 
                                                              
     
  async function activate(caseKey, opts) {
    var o = opts || {};
    var token = GATE.next();
    STATE = Object.assign({}, STATE, {
      caseKey: caseKey, status: 'loading', model: null, objectId: null,
      year: o.year || null, lastRejected: null, retainedFrom: null,
    });
    if (TILES.status !== 'on') TILES.status = 'off';
    render();

    var data;
    try {
                                          
                                             
      data = await loadCaseData(caseKey);
    } catch (e) {
      if (token !== GATE.current || STATE.caseKey !== caseKey) { STATS.staleDropped += 1; return false; }
      var prev = STATE.retainedFrom;
      STATE = Object.assign({}, STATE, {
        status: 'error',
        lastRejected: { caseKey: caseKey, reason: e.message, at: new Date().toISOString() },
      });
      STATS.rejections += 1;
      render();
      banner('bad', '<b>案例 ' + caseKey + ' 载入被拒绝。</b>' + esc(e.message) +
        (prev ? '<br>当前页面上仍显示的是<b>上一份已核验结果</b>（' + esc(prev.caseKey) + ' / ' + esc(prev.objectId || '—') + ' / ' + esc(prev.year) + '）；新输入<b>未被采用</b>。' : ''));
      return false;
    }

                                              
    if (token !== GATE.current || STATE.caseKey !== caseKey) { STATS.staleDropped += 1; return false; }

    STATE = Object.assign({}, STATE, {
      model: data.model,
      status: 'ready',
      objectId: pickObject(data.model, o.objectId),
      year: pickYear(data.model, o.year),
    });
    render();
    return true;
  }

                                                                            
  function selectObject(id) {
    if (!STATE.model) return;
    if (!C.objectById(STATE.model, id)) {
      banner('warn', '未知对象：' + esc(id) + '。已忽略该选择，当前仍为 ' + esc(STATE.objectId || '—') + '。');
      return;
    }
    if (id === STATE.objectId) return;
    STATE = Object.assign({}, STATE, { objectId: id });
    render();
  }

  function selectYear(y) {
    if (!STATE.model) return;
    var v = Number(y);
    if (STATE.model.years.indexOf(v) < 0) {
      banner('warn', '未知年份：' + esc(y) + '。已忽略，当前仍为 ' + esc(STATE.year) + '。');
      return;
    }
    if (v === STATE.year) return;
    STATE = Object.assign({}, STATE, { year: v });
    render();
  }

                                                                            
  function render() {
    renderStatus();
    renderCaseButtons();
    renderYearSelect();
    renderObjectList();
    renderRightPanel();
    renderMap();
    renderSeries();
    renderTab();
    renderLegend();
  }

  function renderCaseButtons() {
    ['A', 'B'].forEach(function (k) {
      var b = $('caseSeg' + k);
      if (b) b.setAttribute('aria-pressed', STATE.caseKey === k ? 'true' : 'false');
    });
  }

                                                       
  function renderStatus() {
    var el = $('statusGroup');
    if (!STATE.model) {
      el.innerHTML = '<span class="chip ' + (STATE.status === 'loading' ? 'warn' : '') + '"><span class="dot"></span>' +
        (STATE.status === 'loading' ? 'Verifying…' : 'Not loaded') + '</span>';
      return;
    }
    var m = STATE.model;
    var v = m.verdict || {};
    var pinOk = C.pinMatches(v.pinStatus);
    var pinCls = pinOk ? 'ok' : (v.pinStatus === 'MISMATCHED' ? 'bad' : 'warn');
    var pinLabel = (m.pinInput === 'FETCH_FAILED' && !pinOk) ? C.TX.pin.PIN_FETCH_FAILED : C.txPin(v.pinStatus);
    var html = '<span class="chip ' + (v.ok ? 'ok' : 'bad') + '" title="' + esc(v.ok ? 'Internal checks passed' : 'Internal checks failed') + '">' +
      '<span class="dot"></span>' + (v.ok ? 'Internally consistent' : 'Internal mismatch') + '</span>' +
      '<span class="chip ' + pinCls + '" title="' + esc(v.pinStatus || '') + '"><span class="dot"></span>' + esc(pinLabel) + '</span>';
    var d = STATE.objectId ? C.detailOf(m, STATE.objectId, STATE.year) : null;
    if (d && d.ok && d.coverage.status === 'PARTIAL_COVERAGE') {
      html += '<span class="chip warn" title="PARTIAL_COVERAGE"><span class="dot"></span>Partial coverage</span>';
    }
    el.innerHTML = html;
  }

  function renderYearSelect() {
    var sel = $('yearSelect');
    var years = STATE.model ? STATE.model.years : [];
    if (!years.length) { sel.innerHTML = '<option>—</option>'; sel.disabled = true; return; }
    sel.disabled = false;
    sel.innerHTML = years.map(function (y) {
      return '<option value="' + y + '">' + y + '</option>';
    }).join('');
    sel.value = String(STATE.year);
  }

function renderObjectList() {
    var list=$('objList'), note=$('listNote');
    if(!STATE.model){list.innerHTML='<div class="empty">No verified objects loaded.</div>';$('objCount').textContent='—';note.textContent='';return;}
    var m=STATE.model,q=UI.search.trim().toLowerCase(),rows=m.objects.filter(function(o){return !q||o.searchKey.indexOf(q)>=0||T.text(o.label).toLowerCase().indexOf(q)>=0;});
    $('objCount').textContent=rows.length+' / '+m.objects.length;
    var brk=colorBreaksFor(m),html='',last=null;
    rows.forEach(function(o){
      if(m.caseKey==='A'&&o.group!==last){html+='<div class="groupLabel">'+esc(C.GROUP_LABEL[o.group])+'</div>';last=o.group;}
      var pv=C.valueOf(m,o.id,STATE.year),col=C.colorFor(pv.value,brk);
      html+='<div class="objItem" role="option" data-id="'+esc(o.id)+'" aria-selected="'+(o.id===STATE.objectId)+'" tabindex="0" title="'+esc(o.label+' · '+STATE.year)+'"><span class="sw" style="background:'+col.fill+';border-color:'+col.edge+'"></span><span class="nm">'+esc(o.label)+'</span><span class="val">'+(C.isNum(pv.value)?C.fmtNum(pv.value,0):'—')+'</span></div>';
    });
    list.innerHTML=html||'<div class="empty">No matching objects.</div>';
    note.textContent=m.caseKey==='A'?'Annual production (tC/yr). Groups are illustrative labels, not verified treatment or control areas.':'One paper-reported research window. Separate from the 34-cell case.';
  }

  function colorBreaksFor(m) {
    if (m.__brk) return m.__brk;
    var vals = [];
    m.objects.forEach(function (o) {
      C.seriesOf(m, o.id).forEach(function (p) { if (C.isNum(p.value)) vals.push(p.value); });
    });
    m.__brk = C.colorBreaks(vals);
    return m.__brk;
  }

  function kvRow(k, v, cls) {
    return '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + v + '</span></div>';
  }

function renderRightPanel() {
    if(!STATE.model||!STATE.objectId){['objName','mainValue'].forEach(function(id){$(id).textContent='—';});['objSub','factRow','objScope','sourceRows','areaRows','methodRows','srcSummary','evidenceQuick'].forEach(function(id){$(id).innerHTML='';});$('mainSub').textContent=STATE.status==='loading'?'Verifying local files…':'No verified case loaded.';return;}
    var m=STATE.model,obj=C.objectById(m,STATE.objectId),d=C.detailOf(m,STATE.objectId,STATE.year);
    $('objName').textContent=T.text(obj.label);
    $('objSub').textContent=STATE.year+' · '+(STATE.year<2012?'2001–2011 segment':'2012–2024 segment')+(m.caseKey==='A'&&obj.sublabel?' · '+T.text(obj.sublabel):'');
    $('mainValue').className='heroValue'+(d.usable?'':' na');
    $('mainValue').innerHTML=d.usable?C.fmtNum(d.prod,2)+'<span class="unit">tC/yr</span>':'—';
    $('mainSub').textContent=d.usable?'MOD17 model output · Integral '+C.fmtNum(d.integral,0)+' kgC/yr':'Unavailable for this year; never filled with zero.';
    var partial=d.coverage.status==='PARTIAL_COVERAGE';
    $('factRow').innerHTML='<div class="fact'+(partial?' warn':'')+'" title="'+esc(d.coverage.status)+'"><span class="k">Coverage status</span><span class="v">'+esc(C.txCoverage(d.coverage.status))+'</span></div><div class="fact"><span class="k">Valid-area ratio</span><span class="v">'+C.fmtRatio(d.ratio)+'</span></div><div class="fact areaFact"><span class="k">Valid product area</span><span class="v">'+C.fmtArea(d.areas.valid.m2).km2+' km²</span></div>';
    $('objScope').innerHTML=m.caseKey==='B'?'Paper-reported Engebei research window. <b>Not an official project or management-unit boundary.</b> Values cover this year’s valid product footprint only.':'Discrete sampling cells (centre ±0.03°), selected for data availability. <b>Not project or management-unit boundaries.</b>';
    var sp=C.sourcePanel(m,{registry:REGISTRY,selection:{objectId:STATE.objectId,year:STATE.year}}),ev=sp.evidenceStatus;
    var titles={internal:'Internal consistency',pin:'Published release reference',local:'Historical recomputation',upstream:'Historical upstream sample',notverified:'Unresolved evidence'};
    function label(r){if(r.key==='internal')return r.ok?'Passed':'Failed';if(r.key==='pin')return r.ok?'Matches release':(r.raw==='MISMATCHED'?'Mismatch':'Not compared');if(r.key==='local')return ev==='APPLICABLE'?'Applicable history':ev==='APPLICABLE_CONTENT_ONLY'?'Content only':'Not established';if(r.key==='upstream')return r.ok?'In sample (9/840)':'Not verified for selection';return 'Not verified';}
    function description(r){
      if(r.key==='internal')return m.caseKey==='A'?'Keys, types, all 816 cell-year identities, unit/area relationships and content digest checked in this browser.':'Year completeness, field relationships, area ratio, method declarations and content digest checked in this browser.';
      if(r.key==='pin')return r.ok?'Content and file-byte comparisons are shown by the recorded pin evaluation; matching the reference does not establish scientific accuracy.':'Release-reference comparison is incomplete or failed. No release-match claim is made. Raw status: '+r.raw+'.';
      if(r.key==='local')return ev==='APPLICABLE'||ev==='APPLICABLE_CONTENT_ONLY'?'The current identity is bound to a historical report'+(ev==='APPLICABLE_CONTENT_ONLY'?' by content only; disk bytes are not comparable.':'.')+' This workbench has not rerun that source recomputation.':'The historical report is not established as applicable to this input. Do not inherit its conclusions.';
      if(r.key==='upstream')return 'Historical reproduction covers 9 of 840 object-years under a stated protocol; 831 were not sampled. '+(r.ok?'This selected object-year is in that sample.':'No sampled-reproduction claim is made for this selected object-year.')+' No online reproduction runs in this workbench.';
      return (m.caseKey==='B'?'The published paper version and official project vectors were not obtained; the author-accepted manuscript and research rectangle are distinct from a project boundary. ':'')+'Pixel-footprint identity, field accuracy, causal effects and real-user usability remain unverified. The 2012 break cause and land-cover uncertainty are unresolved.';
    }
    $('evidenceQuick').innerHTML=sp.rows.slice(0,3).map(function(r){return '<div class="quickRow"><span>'+titles[r.key]+'</span><span class="quickState '+r.state+'">'+label(r)+'</span></div>';}).join('');
    var count=sp.rows.filter(function(r){return r.state==='ok';}).length;
    $('srcSummary').textContent=count+' matched';
    $('sourceRows').innerHTML=sp.rows.map(function(r){return '<div class="srcRow '+r.state+'" data-src="'+r.key+'"><span class="mark" aria-hidden="true"></span><span class="t">'+titles[r.key]+'</span><span class="badge">'+label(r)+'</span><div class="d">'+description(r)+'</div><div class="s">'+(r.key==='internal'?'Internal consistency is not source truth.':r.key==='pin'?'Release matching is not field validation.':'Historical evidence and unresolved items cannot substitute for scientific validation.')+'</div></div>';}).join('')+'<div class="identity">'+sp.identity.map(function(x){return kvRow(T.text(x.label),'<span class="mono '+x.state+'">'+esc(x.actual)+(x.state==='ok'?'':' ≠ '+esc(x.expected))+'</span>');}).join('')+'</div><details class="rawEvidence" data-original><summary>Original evidence wording (Chinese)</summary>'+sp.rows.map(function(r){return '<p><b>'+rawEsc(r.title)+' · '+rawEsc(r.verdict)+'</b><br>'+rawEsc(r.detail)+'<br>'+rawEsc(r.scope)+'</p>';}).join('')+'</details><div class="srcNote">A matching self-digest is not source authentication. A historical report applies only where its identity is bound.</div>';
    var areas=[['Valid reduction area',C.fmtArea(d.areas.valid.m2).m2+' m²'],['Reduction total area',C.fmtArea(d.areas.total.m2).m2+' m²'],['Geometry area',C.fmtArea(d.areas.geom.m2).m2+' m²'],['Valid-area ratio',C.fmtRatio(d.ratio)],['Raw NPP integral',C.isNum(d.integral)?C.fmtNum(d.integral,3)+' kgC/yr':'—']];
    d.extra.forEach(function(x){areas.push([T.text(x.label),esc(x.value)]);});
    $('areaRows').innerHTML=areas.map(function(r){return kvRow(r[0],r[1]);}).join('')+'<p class="tiny">Geometry, reduction total and valid area are distinct. Equal areas do not establish identical pixel positions.</p>';
    var methods=[['Method version',esc(m.methodVersion)],['Bundle','<span class="mono">'+esc(sp.header.bundlePath)+'</span>'],['File SHA-256','<span class="mono">'+esc(m.fileSha256||'Memory input; no disk bytes')+'</span>'],['Content digest','<span class="mono">'+esc(m.contentDigest)+'</span>'],['Evidence applicability',esc(ev)],['Local report',esc(sp.header.localReport||'Not available')],['Upstream report',esc(sp.header.upstreamReport||'Not available')]];
    $('methodRows').innerHTML=methods.map(function(r){return kvRow(r[0],r[1]);}).join('')+'<p class="tiny">500 m is the configured reduction scale, not a complete native-grid specification. Coverage is not QC or accuracy.</p><details class="rawEvidence" data-original><summary>Original geometry / source label (Chinese)</summary><p>'+rawEsc(m.caseKey==='B'?m.bundle.window.label:m.geometryRule.rule)+'</p></details><p class="tiny">Read-only. One historical descriptive Sepolia record (cell_0030_2012); this page does not anchor the bundle or send transactions.</p>';
  }

function renderLegend(){
    var m=STATE.model,bar=$('legendBar'),ticks=$('legendTicks');
    $('legendTitle').textContent='Annual production'+(m?' · '+STATE.year+' · tC/yr':'');$('legendNote').textContent='Footprint totals, not pixel-level values';
    if(!m){bar.style.background='transparent';ticks.innerHTML='';return;}
    var b=colorBreaksFor(m);if(!b.breaks.length)return;
    var colors=C.RAMP.slice(0,b.breaks.length-1);bar.style.background='linear-gradient(90deg,'+colors.join(',')+')';
    var low=b.breaks[0],high=b.breaks[b.breaks.length-1];ticks.innerHTML=[low,(low+high)/2,high].map(function(n){return '<span>'+C.fmtNum(n,0)+'</span>';}).join('');
  }

  function mapSize() {
    var w = $('mapWrap');
    return { w: Math.max(160, w.clientWidth), h: Math.max(160, w.clientHeight) };
  }

  function ensureView() {
    var m = STATE.model;
    if (!m) return null;
    var s = mapSize();
    var v = VIEWS[m.caseKey];
    if (!v) {
      v = VIEWS[m.caseKey] = C.fitView(m.bounds, s.w, s.h, 34);
      v.zoom = 1;
      v.baseScale = v.scale;
    }
    if (v.w !== s.w || v.h !== s.h) {
                                                                              
                                                                            
      var relativeZoom = v.baseScale ? v.scale / v.baseScale : 1;
      var resizedFit = C.fitView(m.bounds, s.w, s.h, 34);
      v.baseScale = resizedFit.scale;
      v.scale = resizedFit.scale * relativeZoom;
      v.w = s.w; v.h = s.h; v.width = s.w; v.height = s.h;
    }
    v.width = s.w; v.height = s.h;
    return v;
  }

  function renderMap() {
    var svg = $('frame'), empty = $('mapEmpty');
    if (!STATE.model) {
      svg.innerHTML = '';
      empty.classList.remove('hidden');
      empty.innerHTML = STATE.status === 'loading' ? 'Loading local evidence…' : '无可用研究范围（Not loaded或核验未通过）。';
      drawBasemap();
      return;
    }
    empty.classList.add('hidden');
    var m = STATE.model;
    var v = ensureView();
    var brk = colorBreaksFor(m);
    var w = v.width, h = v.height;

    $('mapScope').textContent = m.caseKey === 'A'
      ? '34 discrete research cells · centre ±0.03° · illustrative geometry'
      : 'Paper-reported Engebei research window · not a project boundary';

                                      
    var grid = m.caseKey === 'A'
      ? { W: 107.20, E: 109.30, S: 40.02, N: 40.58, lonStep: 0.5, latStep: 0.1 }
      : { W: 109.26, E: 109.50, S: 40.290, N: 40.455, lonStep: 0.05, latStep: 0.05 };
    var parts = [];
    var lonVals = [], latVals = [], i, lo, la;
    for (lo = Math.ceil(grid.W / grid.lonStep) * grid.lonStep; lo <= grid.E + 1e-9; lo += grid.lonStep) lonVals.push(lo);
    for (la = Math.ceil(grid.S / grid.latStep) * grid.latStep; la <= grid.N + 1e-9; la += grid.latStep) latVals.push(la);

    lonVals.forEach(function (val) {
      var a = C.project(v, val, grid.S), b = C.project(v, val, grid.N);
      if (a.x < -20 || a.x > w + 20) return;
      parts.push('<line x1="' + a.x.toFixed(1) + '" y1="' + Math.max(0, a.y).toFixed(1) + '" x2="' + b.x.toFixed(1) +
        '" y2="' + Math.min(h, b.y).toFixed(1) + '" stroke="#dde4e5" stroke-width="1"/>');
    });
    latVals.forEach(function (val) {
      var a = C.project(v, grid.W, val), b = C.project(v, grid.E, val);
      if (a.y < -20 || a.y > h + 20) return;
      parts.push('<line x1="' + Math.max(0, a.x).toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + Math.min(w, b.x).toFixed(1) +
        '" y2="' + b.y.toFixed(1) + '" stroke="#dde4e5" stroke-width="1"/>');
    });
                          
    var pickLabels = function (vals, projectFn) {
      var pts = vals.map(function (x) { return { val: x, p: projectFn(x) }; });
      if (pts.length <= 3) return pts;
      var out = [pts[0]], mid = pts[Math.floor(pts.length / 2)], last = pts[pts.length - 1];
      if (Math.abs(mid.p - out[0].p) > 70) out.push(mid);
      if (Math.abs(last.p - out[out.length - 1].p) > 70) out.push(last);
      return out;
    };
    pickLabels(lonVals, function (x) { return C.project(v, x, grid.S).x; })
      .filter(function (o) { return o.p > 30 && o.p < w - 30; })
      .forEach(function (o) {
        parts.push('<text x="' + o.p.toFixed(1) + '" y="12" text-anchor="middle" font-size="10.5" fill="#8b9aa0">' + o.val.toFixed(2) + '°E</text>');
      });
    pickLabels(latVals, function (y) { return C.project(v, grid.W, y).y; })
      .filter(function (o) { return o.p > 24 && o.p < h - 16; })
      .forEach(function (o) {
        parts.push('<text x="6" y="' + (o.p + 3.5).toFixed(1) + '" font-size="10.5" fill="#8b9aa0">' + o.val.toFixed(2) + '°N</text>');
      });

                             
    m.objects.forEach(function (o) {
      var r = C.rowOf(m, o.id, STATE.year);
      var val = r && C.isNum(r.prod_tC_yr) ? r.prod_tC_yr : null;
      var col = C.colorFor(val, brk);
      var box = C.projectBox(v, o.bbox);
      var sel = o.id === STATE.objectId;
      parts.push('<rect class="cellRect" data-id="' + esc(o.id) + '" x="' + box.x.toFixed(1) + '" y="' + box.y.toFixed(1) +
        '" width="' + Math.max(1, box.w).toFixed(1) + '" height="' + Math.max(1, box.h).toFixed(1) + '" rx="2" ' +
        'fill="' + col.fill + '" fill-opacity="' + (sel ? 1 : 0.67) + '" ' +
        'stroke="' + (sel ? '#0f5c55' : col.edge) + '" stroke-width="' + (sel ? 3 : 0.8) + '"/>');
    });

                                  
    var kmPerDegLon = 111.32 * Math.cos((m.bounds.S + m.bounds.N) / 2 * Math.PI / 180);
    var targetPx = 86;
    var deg = (targetPx / v.scale) * 360;
    var km = deg * kmPerDegLon;
    km = km > 100 ? Math.round(km / 50) * 50 : (km > 20 ? Math.round(km / 10) * 10 : Math.max(1, Math.round(km)));
    var pxLen = (km / kmPerDegLon) / 360 * v.scale;
    var sx = 12, sy = h - 14;
    parts.push('<g><rect x="' + sx + '" y="' + (sy - 2) + '" width="' + pxLen.toFixed(1) + '" height="3" fill="#3a4a51"/>' +
      '<rect x="' + sx + '" y="' + (sy - 5) + '" width="1.5" height="9" fill="#3a4a51"/>' +
      '<rect x="' + (sx + pxLen - 1.5).toFixed(1) + '" y="' + (sy - 5) + '" width="1.5" height="9" fill="#3a4a51"/>' +
      '<text x="' + sx + '" y="' + (sy - 9) + '" font-size="10.5" fill="#3a4a51">' + km + ' km</text></g>');

    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = parts.join('');
    drawBasemap();
  }

                                                                           
  function drawBasemap() {
    var cv = $('basemap');
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#eef1e9';
    ctx.fillRect(0, 0, w, h);

    $('attrib').textContent = TILES.status === 'on' || TILES.status === 'failed'
      ? 'Basemap © OpenStreetMap contributors' : '';

    if (TILES.status !== 'on') return;
    var m = STATE.model;
    if (!m) return;
    var v = VIEWS[m.caseKey];
    if (!v) return;

    var z = Math.max(3, Math.min(16, Math.round(Math.log2(v.scale / 256))));
    var n = Math.pow(2, z);
    var s = v.scale / n;
    var x0 = Math.floor(v.cx * n - (w / 2) / s), x1 = Math.ceil(v.cx * n + (w / 2) / s);
    var y0 = Math.floor(v.cy * n - (h / 2) / s), y1 = Math.ceil(v.cy * n + (h / 2) / s);
    if ((x1 - x0) * (y1 - y0) > 200) return;

    for (var x = x0; x <= x1; x++) {
      for (var y = y0; y <= y1; y++) {
        if (y < 0 || y >= n) continue;
        var tx = ((x % n) + n) % n;
        var url = 'https://tile.openstreetmap.org/' + z + '/' + tx + '/' + y + '.png';
        var rec = TILES.cache[url];
        if (!rec) {
          rec = TILES.cache[url] = { img: new Image(), ok: false, err: false };
          TILES.pending += 1;
          rec.img.onload = function () {
            TILES.pending -= 1; TILES.ok += 1;
            STATS.externalRequests += 1;
            var url2 = this.__url;
            if (url2 && TILES.cache[url2]) TILES.cache[url2].ok = true;
            scheduleBasemapRedraw();
          };
          rec.img.onerror = function () {
            TILES.pending -= 1; TILES.errors += 1;
            STATS.externalRequests += 1;
            var url2 = this.__url;
            if (url2 && TILES.cache[url2]) TILES.cache[url2].err = true;
            if (TILES.ok === 0 && TILES.errors > 0) {
              TILES.status = 'failed';
              TILES.note = '底图加载失败（离线或网络受限）；研究范围与全部指标仍可用。';
              renderBasemapButton();
              scheduleBasemapRedraw();
            }
          };
          rec.img.__url = url;
          rec.img.crossOrigin = 'anonymous';
          rec.img.src = url;
        }
        if (rec.ok) {
          var px = (x / n - v.cx) * v.scale + w / 2;
          var py = (y / n - v.cy) * v.scale + h / 2;
          try { ctx.drawImage(rec.img, px, py, s + 0.6, s + 0.6); } catch (e) {                 }
        }
      }
    }
  }

  var basemapRaf = 0;
  function scheduleBasemapRedraw() {
    if (basemapRaf) return;
    basemapRaf = requestAnimationFrame(function () { basemapRaf = 0; drawBasemap(); });
  }

  function renderBasemapButton() {
    var b = $('btnBasemap');
    if (TILES.status === 'on') { b.textContent = 'Basemap: on'; b.setAttribute('aria-pressed', 'true'); }
    else if (TILES.status === 'failed') { b.textContent = 'Basemap unavailable'; b.setAttribute('aria-pressed', 'false'); }
    else { b.textContent = 'Basemap: off'; b.setAttribute('aria-pressed', 'false'); }
  }

  function toggleBasemap() {
    if (TILES.status === 'on') {
      TILES.status = 'off';
      renderBasemapButton();
      drawBasemap();
      banner('warn', '已关闭在线底图：当前为本地矢量视图（研究框 + 经纬网 + 比例尺），不发起网络请求。');
      return;
    }
    TILES.status = 'on';
    TILES.errors = 0; TILES.ok = 0;
    renderBasemapButton();
    banner('warn', '已开启在线底图：会向 <span class="mono">tile.openstreetmap.org</span> 请求瓦片（© OpenStreetMap contributors）。底图仅作地理参考，<b>不参与</b>任何数值或核验。');
    drawBasemap();
    setTimeout(function () {
      if (TILES.status === 'on' && TILES.ok === 0) {
        TILES.status = 'failed';
        TILES.note = '底图加载失败（离线或网络受限）；研究范围与全部指标仍可用。';
        renderBasemapButton();
        banner('warn', '在线Basemap unavailable（未取得任何瓦片）。核心查看功能不受影响：研究框、经纬网、比例尺与全部指标仍按本地产物显示。');
        drawBasemap();
      }
    }, 6000);
  }

                                                                            
  function renderSeries() {
    var svg = $('series');
    var note = $('seriesNote');
    if (!STATE.model || !STATE.objectId) {
      svg.innerHTML = '';
      $('seriesScope').textContent = '';
      note.textContent = '';
      return;
    }
    var m = STATE.model;
    var series = C.seriesOf(m, STATE.objectId);
    var pts = series.filter(function (p) { return C.isNum(p.value); });
    var w = svg.clientWidth || 640, h = svg.clientHeight || 225;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

    if (!pts.length) {
      svg.innerHTML = '<text x="' + (w / 2) + '" y="' + (h / 2) + '" text-anchor="middle" font-size="12" fill="#8b9aa0">该对象无可用序列（全部年份不可用）</text>';
      note.textContent = '';
      return;
    }
    var padL = 53, padR = 20, padT = 32, padB = 26;
    var iw = w - padL - padR, ih = h - padT - padB;
    var minV = Math.min.apply(null, pts.map(function (p) { return p.value; }));
    var maxV = Math.max.apply(null, pts.map(function (p) { return p.value; }));
    if (maxV === minV) { maxV = minV + 1; }
    var pad = (maxV - minV) * 0.16;
    minV -= pad; maxV += pad;
    var xs = function (y) { return padL + (y - 2001) / 23 * iw; };
    var ys = function (v) { return padT + ih - (v - minV) / (maxV - minV) * ih; };

    var parts = [];
                     
    [0, 0.5, 1].forEach(function (t) {
      var vv = minV + (maxV - minV) * t;
      var yy = ys(vv);
      parts.push('<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#edf1f2"/>');
      parts.push('<text x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8b9aa0">' + C.fmtNum(vv, 0) + '</text>');
    });
    [2001, 2008, 2016, 2024].forEach(function (y) {
      parts.push('<text x="' + xs(y).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle" font-size="10" fill="#8b9aa0">' + y + '</text>');
    });
                                
    var bx = xs(2012);
    parts.push('<line x1="' + bx.toFixed(1) + '" y1="' + padT + '" x2="' + bx.toFixed(1) + '" y2="' + (padT + ih) + '" stroke="#c9a24a" stroke-width="1" stroke-dasharray="3 3"/>');
    parts.push('<text x="' + (bx + 5).toFixed(1) + '" y="' + (padT - 6) + '" font-size="10" fill="#8a5a00">2012 break · cause unverified</text>');

                      
    [[1, '#94a890'], [2, '#176b52']].forEach(function (seg) {
      var d = series.filter(function (p) { return p.era === seg[0] && C.isNum(p.value); })
        .map(function (p, k) { return (k ? 'L' : 'M') + xs(p.year).toFixed(1) + ' ' + ys(p.value).toFixed(1); }).join(' ');
      if (d) parts.push('<path d="' + d + '" fill="none" stroke="' + seg[1] + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>');
    });

                                   
    series.forEach(function (p) {
      if (!C.isNum(p.value)) return;
      var cx = xs(p.year), cy = ys(p.value);
      var sel = p.year === STATE.year;
      parts.push('<circle class="serHit" data-year="' + p.year + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="9" fill="transparent" style="cursor:pointer"/>');
      parts.push('<circle class="serPt" data-year="' + p.year + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
        '" r="' + (sel ? 5 : 2.8) + '" fill="' + (sel ? '#0f5c55' : '#ffffff') + '" stroke="' + (sel ? '#0f5c55' : '#9fb3b8') +
        '" stroke-width="' + (sel ? 2 : 1.3) + '" pointer-events="none"/>');
    });
    parts.push('<line x1="' + xs(STATE.year).toFixed(1) + '" y1="' + padT + '" x2="' + xs(STATE.year).toFixed(1) +
      '" y2="' + (padT + ih) + '" stroke="#0f5c55" stroke-width="1" stroke-opacity="0.35"/>');

    svg.innerHTML = parts.join('');

    var d = C.detailOf(m, STATE.objectId, STATE.year);

    $('seriesScope').textContent=T.text(C.objectById(m,STATE.objectId).label)+' · 2001–2024 · tC/yr';
    $('seriesSelected').textContent=STATE.year+' / '+(d.usable?C.fmtNum(d.prod,2)+' tC/yr':'Unavailable');
    note.innerHTML='Two separate analysis segments. <b>No line or difference crosses 2012.</b> Its cause remains unverified; no treatment attribution.'+(m.caseKey==='B'?' All 24 years have partial valid coverage.':'');

  }

                                                                              
function renderTab(){
    var body=$('tabBody');document.querySelectorAll('.tabs button').forEach(function(b){b.setAttribute('aria-selected',b.dataset.tab===UI.tab?'true':'false');});
    if(!STATE.model||!STATE.objectId){body.innerHTML='<div class="empty">No verified record loaded.</div>';return;}
    var m=STATE.model,d=C.detailOf(m,STATE.objectId,STATE.year);
    if(UI.tab==='detail'){
      body.innerHTML='<table><tbody>'+row('Object / year',esc(STATE.objectId)+' · '+STATE.year)+row('Modelled NPP production',d.usable?C.fmtNum(d.prod,6)+' tC/yr':'Unavailable')+row('Raw integral',d.usable?C.fmtNum(d.integral,3)+' kgC/yr':'—')+row('Geometry area',C.fmtArea(d.areas.geom.m2).km2+' km²')+row('Reduction total area',C.fmtArea(d.areas.total.m2).km2+' km²')+row('Valid reduction area',C.fmtArea(d.areas.valid.m2).km2+' km²')+row('Coverage',esc(d.coverage.status))+'</tbody></table>'+(d.landCover.length?'<table style="margin-top:14px"><thead><tr><th>Land cover</th><th>Valid area m²</th><th>tC/yr</th><th>kgC/m²/yr</th></tr></thead><tbody>'+d.landCover.map(function(x){return '<tr><td>'+esc(x.name)+' ('+esc(x.code)+')</td><td>'+C.fmtNum(x.areaM2,0)+'</td><td>'+(C.isNum(x.prod)?C.fmtNum(x.prod,2):'null')+'</td><td>'+(C.isNum(x.intensity)?x.intensity.toFixed(4):'null')+'</td></tr>';}).join('')+'</tbody></table><p class="tiny">Zero valid class area leaves production and intensity null, not measured zero.</p>':'<p class="tiny">No land-cover decomposition is provided for this case.</p>');return;
    }
    if(UI.tab==='ledger'){
      var h=C.locateHref(m,STATE.objectId,STATE.year),share=C.shareHref(m,STATE.objectId,STATE.year);
      body.innerHTML='<div class="ledgerBox"><h3>Carry this record into review.</h3><p class="why">'+(h.ok?'The ledger locates this cell and year, independently verifies its input and compares adjacent years within the same analysis segment.':'Engebei is a separate research window. The 34-cell ledger does not apply to this case; no cross-case task export is available.')+'</p>'+(h.ok?'<a class="btn primary" id="btnLedger" href="'+esc(h.href)+'" data-cell="'+esc(STATE.objectId)+'" data-year="'+STATE.year+'">Open located change ledger ↗</a>':'')+'<p class="tiny">Location parameters carry identity only, never data or verification conclusions. Task export is complete under the ledger rules; no filtered export is offered.</p><button type="button" class="btn ghost" id="btnShare">Copy record link</button><span class="tiny" id="shareNote"> Contains only case / object / year.</span></div>';
      $('btnShare').onclick=function(){var u=location.origin+location.pathname+'?'+share.href.split('?')[1];if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(u).then(function(){$('shareNote').textContent=' Copied: '+u;},function(){$('shareNote').textContent=' Copy manually: '+u;});else $('shareNote').textContent=' Copy manually: '+u;};return;
    }
    body.innerHTML='<div class="boundaryGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px"><div><h3>Supported use</h3><ul><li>Inspect annual modelled NPP on each year’s valid product footprint.</li><li>Keep geometry, total and valid area separate.</li><li>Review adjacent years for the same cell within one analysis segment.</li><li>Check internal consistency and release-reference matching separately.</li></ul></div><div><h3>Unsupported claims</h3><ul><li>No net carbon sink, carbon credit or stock-change quantity.</li><li>No treatment effect or restoration attribution.</li><li>No cross-2012 differences, growth rates or causal explanation.</li><li>No verified pixel identity, field accuracy or real-user benefit.</li></ul></div></div><p class="tiny">DESCRIPTIVE_NPP_ONLY · insufficient_evidence · registrable=false · REMOVAL=0. No carbon quantification, deployment or new transaction. Only one historical descriptive record was anchored on Sepolia; the full bundle and Engebei case remain off-chain.</p>';
  }

  function row(k, v) { return '<tr><th style="width:42%">' + k + '</th><td>' + v + '</td></tr>'; }

                                                                            
  function bind() {
    document.querySelectorAll('#caseSeg button').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-case');
        if (k === STATE.caseKey && STATE.status === 'ready') return;
        UI.search = ''; $('searchInput').value = '';
        activate(k, { objectId: null, year: STATE.year });
      };
    });

    $('yearSelect').onchange = function () { selectYear(this.value); };

    $('searchInput').oninput = function () { UI.search = this.value; renderObjectList(); };

    $('objList').addEventListener('click', function (e) {
      var it = e.target.closest ? e.target.closest('.objItem') : null;
      if (it) selectObject(it.getAttribute('data-id'));
    });
    $('objList').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var it = e.target.closest ? e.target.closest('.objItem') : null;
      if (it) { e.preventDefault(); selectObject(it.getAttribute('data-id')); }
    });

    $('frame').addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.classList && t.classList.contains('cellRect')) {
        if (Math.abs(DRAG.moved) > 4) return;
        selectObject(t.getAttribute('data-id'));
      }
    });
    $('frame').addEventListener('mousemove', function (e) {
      var t = e.target;
      var tip = $('mapTip');
      if (t && t.classList && t.classList.contains('cellRect')) {
        var id = t.getAttribute('data-id');
        var r = STATE.model && C.rowOf(STATE.model, id, STATE.year);
        var v = r && C.isNum(r.prod_tC_yr) ? C.fmtNum(r.prod_tC_yr, 2) + ' ' + C.UNIT.prod : '不可用';
        var rect = $('mapWrap').getBoundingClientRect();
        tip.textContent = id + ' · ' + v;
        tip.style.left = (e.clientX - rect.left) + 'px';
        tip.style.top = (e.clientY - rect.top) + 'px';
      } else if (!DRAG.active) {
        tip.textContent = '';
      }
    });
    $('frame').addEventListener('mouseleave', function () { $('mapTip').textContent = ''; });

              
    var svg = $('frame');
    svg.addEventListener('mousedown', function (e) {
      if (!STATE.model) return;
      DRAG.active = true; DRAG.moved = 0; DRAG.x = e.clientX; DRAG.y = e.clientY;
      svg.classList.add('dragging');
    });
    window.addEventListener('mousemove', function (e) {
      if (!DRAG.active) return;
      var v = VIEWS[STATE.caseKey];
      if (!v) return;
      var dx = e.clientX - DRAG.x, dy = e.clientY - DRAG.y;
      DRAG.moved += Math.abs(dx) + Math.abs(dy);
      DRAG.x = e.clientX; DRAG.y = e.clientY;
      v.cx -= dx / v.scale; v.cy -= dy / v.scale;
      renderMap();
    });
    window.addEventListener('mouseup', function () {
      if (!DRAG.active) return;
      DRAG.active = false;
      $('frame').classList.remove('dragging');
      setTimeout(function () { DRAG.moved = 0; }, 0);
    });

    $('frame').addEventListener('wheel', function (e) {
      if (!STATE.model) return;
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });

    $('zoomIn').onclick = function () { zoomAt(null, null, 1.3); };
    $('zoomOut').onclick = function () { zoomAt(null, null, 1 / 1.3); };
    $('btnFit').onclick = function () {
      if (!STATE.model) return;
      delete VIEWS[STATE.caseKey];
      renderMap();
    };
    $('btnBasemap').onclick = toggleBasemap;

    $('series').addEventListener('click', function (e) {
      var y = e.target && e.target.getAttribute && e.target.getAttribute('data-year');
      if (y) selectYear(y);
    });

    $('btnSourceFold').onclick = function () {
      UI.srcOpen = !UI.srcOpen;
      var box = $('sourceRows'), btn = $('btnSourceFold');
      box.hidden = !UI.srcOpen;
      btn.setAttribute('aria-expanded', UI.srcOpen ? 'true' : 'false');
      btn.querySelector('.caret').textContent = UI.srcOpen ? '▴' : '▾';
      renderRightPanel();
      box.hidden = !UI.srcOpen;
    };

    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.onclick = function () { UI.tab = b.getAttribute('data-tab'); renderTab(); };
    });

    window.addEventListener('resize', function () { renderMap(); renderSeries(); });
  }

  var DRAG = { active: false, x: 0, y: 0, moved: 0 };
  function zoomAt(cx, cy, f) {
    var v = VIEWS[STATE.caseKey];
    if (!v) return;
    var w = v.width, h = v.height;
    var px = cx === null ? w / 2 : cx - $('mapWrap').getBoundingClientRect().left;
    var py = cy === null ? h / 2 : cy - $('mapWrap').getBoundingClientRect().top;
    var nx = (px - w / 2) / v.scale + v.cx;
    var ny = (py - h / 2) / v.scale + v.cy;
    v.scale = Math.max(v.baseScale * 0.4, Math.min(v.baseScale * 40, v.scale * f));
    v.cx = nx - (px - w / 2) / v.scale;
    v.cy = ny - (py - h / 2) / v.scale;
    renderMap();
  }

                                                                                       
  window.__workbench = {
    getState: function () {
      return {
        caseKey: STATE.caseKey, objectId: STATE.objectId, year: STATE.year,
        status: STATE.status,
        modelCaseId: STATE.model ? STATE.model.caseId : null,
        objects: STATE.model ? STATE.model.objects.length : 0,
        lastRejected: STATE.lastRejected,
        tab: UI.tab,
      };
    },
    getModel: function () { return STATE.model; },
    getSeries: function () { return STATE.model && STATE.objectId ? C.seriesOf(STATE.model, STATE.objectId) : []; },
    getDetail: function () { return STATE.model && STATE.objectId ? C.detailOf(STATE.model, STATE.objectId, STATE.year) : null; },
    getSource: function () {
      return STATE.model
        ? C.sourcePanel(STATE.model, { registry: REGISTRY, selection: { objectId: STATE.objectId, year: STATE.year } })
        : null;
    },
    getRegistry: function () { return REGISTRY; },
    getEvidence: function () { return STATE.model ? C.evaluateEvidence(STATE.model, REGISTRY) : null; },
    getStats: function () { return JSON.parse(JSON.stringify(STATS)); },
    getBasemap: function () { return { status: TILES.status, ok: TILES.ok, errors: TILES.errors, note: TILES.note }; },
    switchCase: function (k) { return activate(k, { year: STATE.year }); },
    selectObject: selectObject,
    selectYear: selectYear,
                                                           
    importCase: async function (caseKey, bundleText, pinText) {
      var token = GATE.next();
      var prev = STATE.model ? { caseKey: STATE.model.caseKey, objectId: STATE.objectId, year: STATE.year } : null;
      try {
        var bundle = JSON.parse(bundleText);
        var pin = null, pinInput = 'ABSENT', pinReason = '未提供（内存载入）';
        if (pinText) {
          try { pin = JSON.parse(pinText); }
          catch (e) { throw new Error('发布摘要（pin）不是合法 JSON ⇒ 拒绝载入：' + e.message); }
          if (pin === null || typeof pin !== 'object' || Array.isArray(pin)) {
            throw new Error('发布摘要（pin）结构非法（' + (pin === null ? 'null' : (Array.isArray(pin) ? 'array' : typeof pin)) + '）⇒ 拒绝载入');
          }
          pinInput = 'OK'; pinReason = '';
        }
        var fileSha = C.sha256Bytes(new TextEncoder().encode(bundleText));
        var verdict = caseKey === 'A'
          ? N.verifyBundle(bundle, { pin: pin || undefined, fileSha256: fileSha })
          : E.verifyBundle(bundle, { pin: pin || undefined, fileSha256: fileSha });
        if (token !== GATE.current) { STATS.staleDropped += 1; return { ok: false, reason: '过期请求' }; }
        if (!verdict.ok) {
          STATS.rejections += 1;
          STATE = Object.assign({}, STATE, {
            status: prev ? 'ready' : 'error',
            lastRejected: { caseKey: caseKey, reason: (verdict.errors || []).join('；'), at: new Date().toISOString() },
            retainedFrom: prev,
          });
          render();
          banner('bad', '<b>载入被拒绝（' + esc(caseKey) + '）。</b>' + esc((verdict.errors || []).slice(0, 3).join('；')) +
            (prev ? '<br>当前显示的是<b>上一份已核验结果</b>：' + esc(prev.caseKey) + ' / ' + esc(prev.objectId) + ' / ' + esc(prev.year) + '；新输入<b>未被采用</b>。' : ''));
          return { ok: false, errors: verdict.errors };
        }
        var model = caseKey === 'A'
          ? C.buildModelA(bundle, { pin: pin, fileSha256: fileSha, verdict: verdict })
          : C.buildModelB(bundle, { pin: pin, fileSha256: fileSha, verdict: verdict });
                                                        
        model.sourceKind = 'memory';
        model.pinInput = pinInput;
        model.pinReason = pinReason;
        STATE = Object.assign({}, STATE, {
          caseKey: caseKey, model: model, status: 'ready',
          objectId: pickObject(model, STATE.objectId), year: pickYear(model, STATE.year),
          lastRejected: null, retainedFrom: prev,
        });
        render();
        return { ok: true, pinStatus: C.normalizeVerdict(verdict, caseKey).pinStatus };
      } catch (e) {
        STATS.rejections += 1;
        STATE = Object.assign({}, STATE, {
          lastRejected: { caseKey: caseKey, reason: e.message, at: new Date().toISOString() },
          retainedFrom: prev, status: prev ? 'ready' : 'error',
        });
        render();
        banner('bad', '<b>载入失败：</b>' + esc(e.message));
        return { ok: false, errors: [e.message] };
      }
    },
    clear: function () {
      STATE = C.createState();
      render();
      banner('warn', '已清除：页面不再显示任何案例数值。');
    },
  };

                                                                            
                                                
  async function loadRegistry() {
    try {
      var r = await fetch('workbench_evidence_registry.json', { cache: 'no-store' });
      if (!r.ok) return null;
      var j = await r.json();
      return (j && j.cases) ? j : null;
    } catch (e) { return null; }
  }

  async function boot() {
    bind();
    render();
    REGISTRY = await loadRegistry();
    var parsed = C.parseShareParams(location.search, null);
    var caseKey = parsed.caseKey || 'A';
    await activate(caseKey, { objectId: parsed.objectId, year: parsed.year });

    var bad = parsed.rejected.slice();
    if (parsed.objectId && !(STATE.model && C.objectById(STATE.model, parsed.objectId))) bad.push('未知对象：' + parsed.objectId);
    if (parsed.year && !(STATE.model && STATE.model.years.indexOf(parsed.year) >= 0)) bad.push('未知年份：' + parsed.year);
    if (bad.length) {
      banner('warn', '定位参数已拒绝：' + esc(bad.join('；')) + '。已回退到默认选择，<b>未</b>静默忽略。');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
