                                                                    
  
                                          
  
                                             
                                 
  
     
                                                                                         
                                              
                                                               
                                                               
                                                                  
                                   
                                                     
                                                   
                                                     
                                          
                                                     
                                              
                                             
   
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    module.exports = factory(
      require('./npp_entry_core.js'),
      require('./engebei_core.js'),
      bytes => crypto.createHash('sha256').update(bytes).digest('hex')
    );
  } else {
    root.WorkbenchCore = factory(root.NppEntryCore, root.EngebeiCore,
      bytes => root.ethers.sha256(bytes).slice(2));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (N, E, sha256Bytes) {
  'use strict';

                                                                              
  const MODULE_VERSION = 'CarbonSat-ResearchWorkbench-v1.1';
  const SCHEMA = 'CarbonSat-ResearchWorkbenchState-v1.1';
  const GENERATOR = 'web/workbench_core.js';
  const ERA_BOUNDARY_YEAR = 2012;
  const FOOTPRINT_IDENTITY = 'UNVERIFIED';

  const CASES = Object.freeze({
    A: Object.freeze({
      caseId: 'kubuqi_34_cells',
      label: '案例 A · 34 个离散研究足迹',
      shortLabel: 'A · 34 格',
      bundlePath: 'web/npp_estimate_bundle.json',
      pinPath: 'web/npp_estimate_bundle.pin.json',
      bundleLabel: 'NPP 估算清单 v1.1',
      objectNoun: '研究格',
      scopeLabel: '数据可用性筛选出的 34 个离散采样方框（格心 ±0.03°），非治理项目边界、非治理小班边界',
      scopeShort: '离散采样足迹（非项目边界）',
      ledgerAvailable: true,
    }),
    B: Object.freeze({
      caseId: 'engebei_paper_window_v1',
      label: '案例 B · 恩格贝研究窗口',
      shortLabel: 'B · 恩格贝',
      bundlePath: 'web/engebei_bundle.json',
      pinPath: 'web/engebei_bundle.pin.json',
      bundleLabel: '恩格贝研究案例 v1.2',
      objectNoun: '研究窗口',
      scopeLabel: '恩格贝相关论文报告范围研究窗口，非官方项目边界，非治理小班边界',
      scopeShort: '论文报告范围研究窗口（非官方项目边界、非治理小班边界）',
      ledgerAvailable: false,
    }),
  });

                                                    
                                                                      
                                                                                        
  const AOI = Object.freeze({
    treated: Object.freeze({ W: 108.10, S: 40.05, E: 109.20, N: 40.55 }),
    control: Object.freeze({ W: 107.30, S: 40.05, E: 108.00, N: 40.55 }),
  });
  const AOI_SOURCE = 'audit/preparatory_hardening_2026-10-16/SOURCE_ADDENDUM.md §2.1（gee/01_kubuqi_fvc.js L86–93；gee/02_kubuqi_grid_samples.js L65–70）';
  const AOI_NOTE = '分组来自示意 AOI 矩形，仅作标签；不是真实治理/对照划分。';

                                              
  const UNIT = Object.freeze({
    prod: 'tC/yr',
    integral: 'kgC/yr',
    area: 'm²',
    areaKm2: 'km²',
    ratio: '无量纲',
    intensity: 'kgC/m²/yr',
  });

  const AREA_LABELS = Object.freeze({
    geom: '矢量测地面积',
    total: '栅格总面积',
    valid: '栅格有效面积',
  });

  const AREA_NOTES = Object.freeze({
    geom: '矢量方框的测地面积，与栅格面积有像元边界效应差异。',
    total: '该格（或窗口）的栅格总面积；不得代替有效面积作分母。',
    valid: '有效产品足迹面积，是生产量的分母。',
  });

  const BOUNDARY = Object.freeze({
    claimClass: 'DESCRIPTIVE_NPP_ONLY',
    attributionStatus: 'insufficient_evidence',
    registrable: false,
    removalCount: 0,
    footprintIdentity: FOOTPRINT_IDENTITY,
    carbonQuantification: 'NOT_PERFORMED',
    onChain: 'NOT_ANCHORED（本工作台不上链、不发交易）',
    note: 'NPP 是 MOD17 模型值，不是碳汇、不是碳信用、不是治理成效。',
  });

                                                                              
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

  function fmtNum(v, digits) {
    if (!isNum(v)) return '—';
    const d = digits === undefined ? 2 : digits;
    return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtArea(v) {
    if (!isNum(v)) return { m2: '—', km2: '—' };
    return { m2: fmtNum(v, 0), km2: fmtNum(v / 1e6, 2) };
  }
  function fmtRatio(v) {
    if (!isNum(v)) return '—';
    return (v * 100).toFixed(2) + '%';
  }
  function eraOf(year) { return Number(year) >= ERA_BOUNDARY_YEAR ? 2 : 1; }
  function eraLabel(era) { return era === 2 ? 'era 2（2012–2024）' : 'era 1（2001–2011）'; }

                                                                              
  function mercatorY(lat) {
    const r = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
    const rad = r * Math.PI / 180;
    return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
  }
  function normPoint(lon, lat) {
    return { x: (Number(lon) + 180) / 360, y: mercatorY(lat) };
  }
  function bboxOfCenter(lon, lat, half) {
    return { W: lon - half, S: lat - half, E: lon + half, N: lat + half };
  }
  function bboxNorm(b) {
    return {
      x0: normPoint(b.W, b.N).x, y0: normPoint(b.W, b.N).y,
      x1: normPoint(b.E, b.S).x, y1: normPoint(b.E, b.S).y,
    };
  }
  function boundsOfBoxes(boxes) {
    let W = Infinity, S = Infinity, Ei = -Infinity, Nn = -Infinity;
    boxes.forEach(b => {
      W = Math.min(W, b.W); S = Math.min(S, b.S); Ei = Math.max(Ei, b.E); Nn = Math.max(Nn, b.N);
    });
    return { W, S, E: Ei, N: Nn };
  }
                                                       
  function fitView(bounds, width, height, pad) {
    const p = pad === undefined ? 24 : pad;
    const n = bboxNorm(bounds);
                                                   
                                                          
                     
    const w = Math.max(1e-9, n.x1 - n.x0);
    const h = Math.max(1e-9, n.y1 - n.y0);
    const scale = Math.min((width - p * 2) / w, (height - p * 2) / h);
    return {
      cx: (n.x0 + n.x1) / 2,
      cy: (n.y0 + n.y1) / 2,
      scale,
      width, height,
    };
  }
  function project(view, lon, lat) {
    const n = normPoint(lon, lat);
    return { x: (n.x - view.cx) * view.scale + view.width / 2, y: (n.y - view.cy) * view.scale + view.height / 2 };
  }
  function projectBox(view, b) {
    const tl = project(view, b.W, b.N);
    const br = project(view, b.E, b.S);
    return { x: tl.x, y: tl.y, w: Math.max(1, br.x - tl.x), h: Math.max(1, br.y - tl.y) };
  }
  function unproject(view, px, py) {
    const x = (px - view.width / 2) / view.scale + view.cx;
    const y = (py - view.height / 2) / view.scale + view.cy;
    const lon = x * 360 - 180;
    const n = Math.PI * (1 - 2 * y);
    const lat = Math.atan(Math.sinh(n)) * 180 / Math.PI;
    return { lon, lat };
  }

                                                                                   
  function inBox(lon, lat, b) { return lon >= b.W && lon <= b.E && lat >= b.S && lat <= b.N; }
  function groupOf(lon, lat) {
    if (inBox(lon, lat, AOI.control)) return 'control';
    if (inBox(lon, lat, AOI.treated)) return 'treated';
    return 'unassigned';
  }
  const GROUP_LABEL = Object.freeze({
    treated: '治理矩形内（示意）',
    control: '对照矩形内（示意）',
    unassigned: '不在任一示意矩形内',
  });

                                                                             
  function pinIdentity(pin) {
    if (!isObj(pin)) return { present: false, bundleFileSha256: null, bundleContentSha256: null, generatedAtUTC: null };
    return {
      present: true,
      bundleFileSha256: pin.bundleFileSha256 || null,
      bundleContentSha256: pin.bundleContentSha256 || pin.stableDigest || null,
      generatedAtUTC: pin.generatedAtUTC || null,
      bundlePath: pin.bundlePath || null,
      schemaVersion: pin.schemaVersion || null,
    };
  }

  function emptyVerdict() {
    return { ok: false, errors: ['尚未核验'], provenance: [], pinStatus: 'NOT_EVALUATED', pinEvaluation: null };
  }

     
                                        
                                                                         
                                                                                    
     
  function normalizeVerdict(v, caseKey) {
    if (!v) return emptyVerdict();
    if (caseKey === 'A') {
      const pp = v.publishedPin || {};
      return {
        ok: !!v.ok,
        errors: v.errors || [],
        pinStatus: pp.status || 'NOT_EVALUATED',
        pinEvaluation: {
          contentMatch: pp.contentShaMatch === undefined ? null : pp.contentShaMatch,
          fileBytesMatch: pp.fileShaMatch === undefined ? null : pp.fileShaMatch,
          fileBytesCompared: !!pp.fileBytesCompared,
          note: pp.note || '',
        },
        checkedYears: 0,
        provenance: v.labels || [],
        trustNote: v.trustNote || '',
      };
    }
    return {
      ok: !!v.ok,
      errors: v.errors || [],
      pinStatus: v.pinStatus || 'NOT_EVALUATED',
      pinEvaluation: v.pinEvaluation || null,
      checkedYears: v.checkedYears || 0,
      provenance: v.provenance || [],
      trustNote: '',
    };
  }

                                                       
  function pinMatches(status) {
    return /^MATCHED/.test(String(status || ''));
  }

     
                                                      
                       
     
  function buildModelA(bundle, ctx) {
    const c = ctx || {};
    const half = isNum(bundle.cellGeometry && bundle.cellGeometry.halfSpanDeg)
      ? bundle.cellGeometry.halfSpanDeg : null;
    if (!isNum(half) || half <= 0) throw new Error('数据包缺少有效的 cellGeometry.halfSpanDeg，无法由规则派生格框');
    const objects = bundle.cells.map(cell => {
      const bbox = bboxOfCenter(cell.lon, cell.lat, half);
      return {
        id: cell.cellId,
        label: cell.cellId,
        sublabel: GROUP_LABEL[groupOf(cell.lon, cell.lat)],
        lon: cell.lon, lat: cell.lat,
        bbox,
        group: groupOf(cell.lon, cell.lat),
        searchKey: (cell.cellId + ' ' + GROUP_LABEL[groupOf(cell.lon, cell.lat)]).toLowerCase(),
      };
    });
    return {
      caseId: CASES.A.caseId,
      caseKey: 'A',
      bundle,
      pin: c.pin || null,
      fileSha256: c.fileSha256 || null,
      verdict: normalizeVerdict(c.verdict, 'A'),
      years: bundle.years.slice(),
      objects,
      bounds: boundsOfBoxes(objects.map(o => o.bbox)),
      geometryRule: {
        kind: 'center_half_span',
        halfSpanDeg: half,
        rule: '格心 ±' + half + '° 方框',
        source: 'web/npp_estimate_bundle.json#cellGeometry + data/grid_samples.csv 格心',
        note: '方框规则与 FVC 管线同几何；已由 SOURCE_ADDENDUM §2.1 独立复核。',
      },
      sourceRef: bundle.generatedFrom || {},
      contentDigest: (c.verdict && c.verdict.content && c.verdict.content.recomputed) || null,
      windowSha256: null,
      methodVersion: bundle.methodology && bundle.methodology.method_version,
      coverageNote: '有效面积比例按格逐格不同；只有该年**有效产品足迹上**的模型值，不是整格总量。',
      ledgerAvailable: true,
    };
  }

                                                         
  function buildModelB(bundle, ctx) {
    const c = ctx || {};
    const b = bundle.window.boundsWGS84;
    const bbox = { W: b.W, S: b.S, E: b.E, N: b.N };
    const objects = [{
      id: bundle.caseId,
      label: '恩格贝研究窗口',
      sublabel: '论文报告范围研究窗口（非官方项目边界、非治理小班边界）',
      lon: (b.W + b.E) / 2,
      lat: (b.S + b.N) / 2,
      bbox,
      group: 'window',
      searchKey: 'engebei 恩格贝 研究窗口 paper window',
    }];
    return {
      caseId: CASES.B.caseId,
      caseKey: 'B',
      bundle,
      pin: c.pin || null,
      fileSha256: c.fileSha256 || null,
      verdict: normalizeVerdict(c.verdict, 'B'),
      years: bundle.years.slice(),
      objects,
      bounds: boundsOfBoxes([bbox]),
      geometryRule: {
        kind: 'window_bounds',
        halfSpanDeg: null,
        rule: '论文报告经纬范围外接矩形',
        source: 'web/engebei_bundle.json#window.boundsWGS84',
        note: '矩形不等于论文不规则研究区；不提供正式项目矢量。',
      },
      sourceRef: bundle.sourceRef || {},
      contentDigest: (c.verdict && c.verdict.stableDigestRecomputed) || null,
      windowSha256: (c.verdict && c.verdict.windowSha256Recomputed) || bundle.windowSha256 || null,
      methodVersion: bundle.methodology && bundle.methodology.methodVersion,
      coverageNote: '24/24 年均为 PARTIAL_COVERAGE（有效像元 813）；数值只代表**该年有效产品足迹上**的模型 NPP 生产量。',
      ledgerAvailable: false,
    };
  }

                                                                              
  function objectById(model, id) {
    return model.objects.filter(o => o.id === id)[0] || null;
  }

  function rowOf(model, objectId, year) {
    if (!model) return null;
    if (model.caseKey === 'A') {
      const r = model.bundle.cellYears[objectId + '|' + Number(year)];
      return r || null;
    }
    const r = model.bundle.records[String(Number(year))];
    return r || null;
  }

                                                    
  function valueOf(model, objectId, year) {
    const r = rowOf(model, objectId, year);
    if (!r) return { value: null, usable: false, reason: '该年记录不存在' };
    if (model.caseKey === 'A') {
      const u = N.cellYearUsable(r);
      return { value: u.usable ? r.prod_tC_yr : null, usable: u.usable, reason: u.reason };
    }
    const failed = !(r.computeStatus === 'OK');
    const covered = r.validCoverageStatus === 'FULL_COVERAGE' || r.validCoverageStatus === 'PARTIAL_COVERAGE';
    const usable = !failed && !r.missing && covered && isNum(r.prod_tC_yr);
    return { value: usable ? r.prod_tC_yr : null, usable, reason: usable ? '' : '该年不可用' };
  }

                                                        
  function seriesOf(model, objectId) {
    if (!model) return [];
    return model.years.map(y => {
      const r = rowOf(model, objectId, y);
      if (!r) return { year: y, value: null, usable: false, reason: '该年记录不存在', era: eraOf(y), eraLabel: eraLabel(eraOf(y)) };
      if (model.caseKey === 'A') {
        const u = N.cellYearUsable(r);
        return {
          year: y,
          value: u.usable ? r.prod_tC_yr : null,
          integral: u.usable ? r.integral_kgC_yr : null,
          usable: u.usable, reason: u.reason,
          era: eraOf(y), eraLabel: eraLabel(eraOf(y)),
          coverage: isNum(r.validAreaRatio) ? r.validAreaRatio : null,
        };
      }
      const failed = !(r.computeStatus === 'OK');
      const covered = r.validCoverageStatus === 'FULL_COVERAGE' || r.validCoverageStatus === 'PARTIAL_COVERAGE';
      const usable = !failed && !r.missing && covered && isNum(r.prod_tC_yr);
      return {
        year: y,
        value: usable ? r.prod_tC_yr : null,
        integral: usable ? r.integral_kgC_yr : null,
        usable,
        reason: usable ? '' : (failed ? '该年计算未成功：' + r.computeStatus : (r.missing ? '该年缺测' : '该年无有效覆盖')),
        era: eraOf(y), eraLabel: eraLabel(eraOf(y)),
        coverage: isNum(r.validAreaRatio) ? r.validAreaRatio : null,
      };
    });
  }

                                         
  function detailOf(model, objectId, year) {
    const obj = objectById(model, objectId);
    const r = rowOf(model, objectId, year);
    if (!obj || !r) return { ok: false, reason: '未知对象或年份' };
    const y = Number(year);
    if (model.caseKey === 'A') {
      const u = N.cellYearUsable(r);
      const lc = (r.landCover || []).map(x => {
        const noValid = !(isNum(x.classValidAreaM2) && x.classValidAreaM2 > 0);
        return {
          code: x.lcCode, name: x.lcName,
          areaM2: x.classValidAreaM2,
          prod: noValid ? null : x.prod_tC_yr,
          intensity: noValid ? null : x.intensity_kg_m2_yr,
          note: noValid ? '该类别有效面积为 0：无有效产品值（不是真零）' : '',
        };
      });
      return {
        ok: true,
        caseKey: 'A', objectId, year: y, era: eraOf(y), eraLabel: eraLabel(eraOf(y)),
        usable: u.usable, unusableReason: u.reason,
        prod: u.usable ? r.prod_tC_yr : null,
        integral: u.usable ? r.integral_kgC_yr : null,
        areas: {
          geom: { label: AREA_LABELS.geom, m2: r.geomAreaM2, note: AREA_NOTES.geom },
          total: { label: AREA_LABELS.total, m2: r.gridTotalAreaM2, note: AREA_NOTES.total },
          valid: { label: AREA_LABELS.valid, m2: r.gridValidAreaM2, note: AREA_NOTES.valid },
        },
        ratio: r.validAreaRatio,
        coverage: {
          status: isNum(r.validAreaRatio) && r.validAreaRatio >= E.FULL_COVERAGE_RATIO ? 'FULL_COVERAGE' : 'PARTIAL_COVERAGE',
          note: '该年有效产品足迹占栅格总面积的比例；不是植被覆盖率、不是治理覆盖率。阈值沿用既有常量 FULL_COVERAGE_RATIO。',
        },
        landCover: lc,
        extra: [
          { label: '缺测标志', value: r.missing ? '是（' + (r.missingReason || '原因未说明') + '）' : '否' },
          { label: '地类产品', value: model.bundle.methodology && model.bundle.methodology.lcProduct },
          { label: '产品 / 掩膜', value: (model.bundle.methodology && model.bundle.methodology.product) + ' / ' + (model.bundle.methodology && model.bundle.methodology.mask) },
        ],
      };
    }
    const failed = !(r.computeStatus === 'OK');
    const covered = r.validCoverageStatus === 'FULL_COVERAGE' || r.validCoverageStatus === 'PARTIAL_COVERAGE';
    const usable = !failed && !r.missing && covered && isNum(r.prod_tC_yr);
    return {
      ok: true,
      caseKey: 'B', objectId, year: y, era: eraOf(y), eraLabel: eraLabel(eraOf(y)),
      usable,
      unusableReason: usable ? '' : (failed ? '该年计算未成功：' + r.computeStatus : (r.missing ? '该年缺测' : '该年无有效覆盖')),
      prod: usable ? r.prod_tC_yr : null,
      integral: usable ? r.integral_kgC_yr : null,
      areas: {
        geom: { label: AREA_LABELS.geom, m2: r.geomAreaM2, note: AREA_NOTES.geom },
        total: { label: '栅格总面积（window gridAreaM2）', m2: r.gridAreaM2, note: AREA_NOTES.total },
        valid: { label: AREA_LABELS.valid, m2: r.gridValidAreaM2, note: AREA_NOTES.valid },
      },
      ratio: r.validAreaRatio,
      coverage: {
        status: r.validCoverageStatus,
        note: '每年均为部分覆盖 ⇒ 只能说「该年有效产品足迹上的模型值」，不得当作整窗总量。',
      },
      landCover: [],
      extra: [
        { label: '有效像元数', value: isNum(r.validPixels) ? String(r.validPixels) : '—' },
        { label: '平均原始 DN（非通量）', value: isNum(r.nppRawMean) ? fmtNum(r.nppRawMean, 2) : '—' },
        { label: '原始 DN 负值像元', value: isNum(r.nppNegPixels) ? String(r.nppNegPixels) : '—' },
        { label: '计算状态', value: String(r.computeStatus) },
        { label: '覆盖状态', value: String(r.validCoverageStatus) },
        { label: '产品 / 掩膜', value: (model.bundle.methodology && model.bundle.methodology.product) + ' / ' + (model.bundle.methodology && model.bundle.methodology.maskName) },
      ],
    };
  }

                                                                                 
     
                              
                                   
     
  function colorBreaks(values) {
    const nums = values.filter(isNum);
    if (!nums.length) return { breaks: [], labels: [] };
    const lo = Math.floor(Math.min.apply(null, nums) / 1000) * 1000;
    const hi = Math.ceil(Math.max.apply(null, nums) / 1000) * 1000;
    const n = 5;
    const step = (hi - lo) / n || 1;
    const breaks = [];
    for (let i = 0; i <= n; i++) breaks.push(lo + step * i);
    return { breaks, labels: breaks.map((x, i) => (i === 0 ? '' : '') + fmtNum(x, 0)) };
  }
  const RAMP = Object.freeze(['#e8f3ee', '#c3e2d5', '#93cbb7', '#57ab95', '#2b8271', '#155f52']);
  const RAMP_EDGE = Object.freeze(['#b9d5c9', '#9dc7b7', '#77b19f', '#4d8f7d', '#2b6f61', '#134c43']);

  function colorFor(value, brk) {
    if (!isNum(value) || !brk || brk.breaks.length < 2) return { fill: '#eceff1', edge: '#cfd8dc', cls: 'n/a' };
    const b = brk.breaks;
    for (let i = 0; i < b.length - 1; i++) {
      if (value <= b[i + 1] || i === b.length - 2) return { fill: RAMP[i], edge: RAMP_EDGE[i], cls: String(i + 1) };
    }
    return { fill: RAMP[RAMP.length - 1], edge: RAMP_EDGE[RAMP_EDGE.length - 1], cls: String(RAMP.length) };
  }

                                                                             
                                
  function createGate() {
    let token = 0;
    return {
      next() { token += 1; return token; },
      isCurrent(t) { return t === token; },
      get current() { return token; },
    };
  }

                                                                                  
  function createState() {
    return {
      schema: SCHEMA,
      caseKey: 'A',
      objectId: null,
      year: null,
      token: 0,
      status: 'idle',                                            
      model: null,
      lastRejected: null,                              
      retainedFrom: null,                       
      basemap: 'off',                              
      basemapNote: '',
    };
  }

     
                                         
                  
     
  function transition(state, patch) {
    const s = Object.assign({}, state, patch);
    s.token = (state.token || 0) + 1;
    if (patch && (patch.caseKey !== undefined || patch.objectId !== undefined || patch.year !== undefined)) {
                                
      s.status = patch.status || 'loading';
      s.lastRejected = patch.lastRejected || null;
    }
    return s;
  }

                                                                             
                                              
  function locateHref(model, objectId, year) {
    if (!model || !model.ledgerAvailable) return { ok: false, reason: '该案例未接入既有变化台账' };
    if (!objectById(model, objectId)) return { ok: false, reason: '未知对象' };
    const y = Number(year);
    if (model.years.indexOf(y) < 0) return { ok: false, reason: '未知年份' };
    const era = eraOf(y);
    const q = 'cell=' + encodeURIComponent(objectId) + '&era=' + era + '&year=' + y;
    return {
      ok: true,
      href: 'changes.html?' + q,
      params: { cellId: objectId, era, year: y },
      note: '只带定位信息（格 / 时段 / 年）；台账页会独立重算并核验，不复用本页结论。',
    };
  }

                                                                             
     
                      
                                          
     
                                                                                          
                                             
  const TX = Object.freeze({
    pin: Object.freeze({
      MATCHED: '与发布版本一致',
      CONTENT_ONLY: '内容摘要一致，文件字节未比对',
      CONTENT_OK_FILE_DIFFERENT: '内容摘要一致，文件字节不同',
      MISMATCHED: '与发布摘要不符',
      PIN_ABSENT: '未与发布摘要比对',
      PIN_INVALID: '发布摘要文件无效',
      PIN_FETCH_FAILED: '发布摘要未取得',
      NOT_EVALUATED: '未评估',
    }),
    internal: Object.freeze({ pass: '当前内容内部一致', fail: '当前内容不一致', none: '尚未核验' }),
    coverage: Object.freeze({ FULL_COVERAGE: '全覆盖', PARTIAL_COVERAGE: '部分有效覆盖' }),
    footprint: Object.freeze({ UNVERIFIED: '有效像元位置一致性未验证' }),
  });

  function txPin(status) {
    const s = String(status || '');
    if (!s) return TX.pin.NOT_EVALUATED;
    if (/^MATCHED/.test(s)) return TX.pin.MATCHED;
    return TX.pin[s] || ('其他状态（' + s + '）');
  }
  function txCoverage(status) {
    return TX.coverage[String(status || '')] || ('其他状态（' + String(status || '未提供') + '）');
  }

                                                                           
  function sourceDigestOf(model) {
    if (!model) return null;
    if (model.caseKey === 'A') {
      const g = model.sourceRef || {};
      return (g.productionIntegral && g.productionIntegral.sha256) || null;
    }
    return (model.sourceRef && model.sourceRef.csvSha256) || null;
  }

     
                                                
                                                  
                                               
     
  function evaluateEvidence(model, registry) {
    const out = { status: 'NO_MODEL', checks: [], rec: null, upstream: null, mismatched: [], uncomparable: [] };
    if (!model) return out;
    const reg = registry || null;
    out.upstream = (reg && reg.upstream) || null;
    const rec = (reg && reg.cases && reg.cases[model.caseKey]) || null;
    out.rec = rec;
    if (!rec) { out.status = 'NO_REGISTRY'; return out; }
    const checks = out.checks;
    const push = (key, label, ok, expected, actual) => checks.push({ key, label, ok, expected: expected || null, actual: actual || null });
    const src = sourceDigestOf(model);
    push('caseId', '案例身份', rec.caseId === model.caseId, rec.caseId, model.caseId);
    push('methodVersion', '方法版本', !!rec.methodVersion && rec.methodVersion === model.methodVersion, rec.methodVersion, model.methodVersion);
    push('sourceDigest', '源产物摘要（独立计算）', !!src && src === (rec.sourceArtifacts[0] || {}).sha256, (rec.sourceArtifacts[0] || {}).sha256, src);
    push('contentDigest', '内容摘要', !!model.contentDigest && model.contentDigest === rec.bundle.contentDigest, rec.bundle.contentDigest, model.contentDigest);
    if (model.caseKey === 'B' && rec.windowSha256) {
      push('windowSha256', '窗口哈希', !!model.windowSha256 && model.windowSha256 === rec.windowSha256.declared, rec.windowSha256.declared, model.windowSha256);
    }
                                                   
    push('fileBytes', '文件字节', model.fileSha256 ? model.fileSha256 === rec.bundle.fileSha256 : null, rec.bundle.fileSha256, model.fileSha256);
    const bad = checks.filter(c => c.ok === false);
    const unknown = checks.filter(c => c.ok === null);
    out.mismatched = bad.map(c => c.label);
    out.uncomparable = unknown.map(c => c.label);
    out.status = bad.length ? 'NOT_APPLICABLE' : (unknown.length ? 'APPLICABLE_CONTENT_ONLY' : 'APPLICABLE');
    return out;
  }

                                 
  function upstreamSampleFor(ev, selection) {
    const up = ev && ev.upstream;
    if (!up || !up.objectYears) return null;
    const inSample = !!(selection && up.objectYears.some(x => x.objectId === selection.objectId && Number(x.year) === Number(selection.year)));
    return { inSample, sampleSize: up.sampleSize, total: up.totalObjectYears, objectYears: up.objectYears };
  }

     
                      
                                                   
                                                                
     
  function sourcePanel(model, opts) {
    if (!model) return null;
    const o = opts || {};
    const v = model.verdict || emptyVerdict();
    const pin = pinIdentity(model.pin);
    const pe = v.pinEvaluation || {};
    const isB = model.caseKey === 'B';
    const ev = evaluateEvidence(model, o.registry);
    const sample = upstreamSampleFor(ev, o.selection);
    const rows = [];

                       
    rows.push({
      key: 'internal',
      title: '内部结构、算术与摘要一致性',
      state: v.ok ? 'ok' : 'bad',
      ok: !!v.ok,
      verdict: v.ok ? TX.internal.pass : TX.internal.fail,
      raw: '',
      detail: v.ok
        ? (isB
          ? '按状态字段关系、面积比例复算、方法逐项、交付年份重建与全表摘要重算（' + (v.checkedYears || 0) + ' 年），本页现场执行。'
          : '精确键集、精确类型、816 格年主键完整、单位链与面积比例关系、内容摘要重算，本页现场执行。')
        : (v.errors || []).join('；'),
      scope: '只说明当前内容自洽；不证明来源真实、不证明模型值等于实测通量。',
    });

                             
    const pinInput = model.pinInput || (pin.present ? 'OK' : 'ABSENT');
    const pinState = pinMatches(v.pinStatus) ? 'ok'
      : (v.pinStatus === 'MISMATCHED' ? 'bad' : 'warn');
    let pinDetail;
                                               
    const pinVerdict = (pinInput === 'FETCH_FAILED' && !pinMatches(v.pinStatus))
      ? TX.pin.PIN_FETCH_FAILED
      : txPin(v.pinStatus);
    if (pinInput === 'FETCH_FAILED') {
      pinDetail = '未取得发布摘要（获取失败：' + (model.pinReason || '原因未记录') + '）⇒ 未与发布摘要比对。';
    } else if (!pin.present) {
      pinDetail = '未提供发布摘要文件（' + (pinInput === 'ABSENT' ? '文件不存在' : '未载入') + '）⇒ 未与发布摘要比对。';
    } else {
      pinDetail = '内容摘要：' + (pe.contentMatch === true ? '一致' : (pe.contentMatch === false ? '不符' : '未比对')) +
        ' · 文件字节：' + (pe.fileBytesMatch === true ? '一致' : (pe.fileBytesMatch === false ? '不同' : '未比对')) +
        (pe.fileBytesCompared === false ? '（本次无盘上字节）' : '');
    }
    rows.push({
      key: 'pin',
      title: '与独立发布摘要（pin）的匹配',
      state: pinState, ok: pinMatches(v.pinStatus),
      verdict: pinVerdict,
      raw: pinInput === 'FETCH_FAILED' && !pinMatches(v.pinStatus) ? 'PIN_FETCH_FAILED' : (v.pinStatus || 'NOT_EVALUATED'),
      detail: pinDetail,
      scope: 'pin 匹配只说明与被比较版本一致；不证明上游科学正确性、不证明地面精度。',
    });

                                        
    let localState, localVerdict, localDetail, localRaw;
    const rec = ev.rec;
    if (ev.status === 'NO_REGISTRY') {
      localState = 'warn'; localVerdict = '未取得证据登记'; localRaw = 'NO_REGISTRY';
      localDetail = '当前未载入证据登记文件，无法判定历史复算结论是否适用于本产物。';
    } else if (ev.status === 'NOT_APPLICABLE') {
      localState = 'warn'; localVerdict = '历史报告存在，未确认适用于当前产物'; localRaw = 'HISTORY_NOT_BOUND';
      localDetail = '身份对照不符：' + ev.mismatched.join('、') + '。详见下方逐项对照；历史结论不继承给当前内容。';
    } else {
      localState = 'info';
      localVerdict = ev.status === 'APPLICABLE' ? '历史报告适用于当前产物' : '历史报告适用于当前内容（文件字节未比对）';
      localRaw = ev.status;
      localDetail = rec.localRecompute.claim + '（' + rec.localRecompute.scriptPath + '）。派生计数：' +
        Object.keys(rec.localRecompute.derived).map(k => k + '=' + fmtNum(rec.localRecompute.derived[k], 0)).join(' · ') +
        '。本工作台未执行该脚本。';
    }
    rows.push({
      key: 'local',
      title: '已有本地源文件复算证据（历史引用）',
      state: localState, ok: ev.status === 'APPLICABLE' || ev.status === 'APPLICABLE_CONTENT_ONLY',
      verdict: localVerdict, raw: localRaw,
      detail: localDetail,
      scope: '即使身份相符，也只是"该轮脚本在当轮产物上通过"；不证明 GEE 原始资产真实，也不证明地面精度。本页未重跑该脚本。',
    });

                                      
    let upState = 'warn', upVerdict, upDetail, upRaw = 'NOT_APPLICABLE';
    if (!ev.upstream) {
      upVerdict = '未取得上游抽样记录';
      upDetail = '证据登记缺少上游抽样信息。';
    } else if (ev.status === 'NOT_APPLICABLE' || ev.status === 'NO_REGISTRY') {
      upVerdict = '历史报告存在，未确认适用于当前产物';
      upDetail = '身份对照不符（' + (ev.mismatched.join('、') || '无登记') + '）⇒ 不继承上游抽样结论。';
    } else {
      upRaw = ev.upstream.status || 'UNKNOWN';
      const list = ev.upstream.objectYears.map(x => x.objectId + ' ' + x.year).join('、');
      if (sample && sample.inSample) {
        upState = 'info';
        upVerdict = '当前对象年属于已抽范围（' + ev.upstream.sampleSize + '/' + ev.upstream.totalObjectYears + '）';
        upDetail = '该对象年在该次声明的相对容差 ' + ev.upstream.toleranceRelative + ' 内复现一致；抽样清单：' + list + '。';
      } else {
        upState = 'warn';
        upVerdict = '当前对象年不在已抽范围（' + ev.upstream.sampleSize + '/' + ev.upstream.totalObjectYears + '）';
        upDetail = '上游只抽了 ' + ev.upstream.sampleSize + ' 个对象年（' + list + '）；其余 ' +
          (ev.upstream.totalObjectYears - ev.upstream.sampleSize) + ' 个未抽 ⇒ 本对象年不得称"已在线核验"。';
      }
    }
    rows.push({
      key: 'upstream',
      title: '已有在线上游抽样复现范围（历史引用）',
      state: upState,
                                                            
      ok: (ev.status === 'APPLICABLE' || ev.status === 'APPLICABLE_CONTENT_ONLY') ? !!(sample && sample.inSample) : false,
      verdict: upVerdict, raw: upRaw,
      detail: upDetail,
      scope: '只说所抽对象年在指定计算口径下复现一致；不得升级为全量正确、平台权重机制已查明或治理效果成立。本工作台未联网、未执行该抽查。',
    });

                
    rows.push({
      key: 'notverified',
      title: '当前尚未验证事项',
      state: 'warn', ok: false,
      verdict: '未验证', raw: 'NOT_VERIFIED',
      detail: isB
        ? '论文出版定稿未取得（仅有作者接受稿）；项目/治理小班矢量未取得；矩形与论文不规则研究区口径不同、差异保留；足迹同一性、地面精度、治理因果均未验证；真实可用性试用未执行。'
        : '其余 ' + ((ev.upstream ? ev.upstream.totalObjectYears - ev.upstream.sampleSize : '—')) + ' 个对象年未复算；足迹同一性、地面精度、治理因果均未验证；地类类别混淆与逐年变化未量化；2012 断点成因未证实；真实可用性试用未执行。',
      scope: '以上任一都不得由本页的「内部一致」或「与发布版本一致」推出。',
    });

                       
    const identity = ev.checks.map(c => ({
      key: c.key, label: c.label,
      state: c.ok === true ? 'ok' : (c.ok === false ? 'bad' : 'warn'),
      expected: shortDigest(c.expected), actual: c.actual ? shortDigest(c.actual) : '不可比',
    }));

    return {
      caseKey: model.caseKey,
      evidenceStatus: ev.status,
      identity,
      sample,
      header: {
        methodVersion: model.methodVersion,
        bundlePath: isB ? CASES.B.bundlePath : CASES.A.bundlePath,
        bundleFileSha256: model.fileSha256,
        contentDigest: model.contentDigest,
        pinGeneratedAtUTC: pin.generatedAtUTC,
        pinSchema: pin.schemaVersion,
        registryGeneratedAtUTC: o.registry ? o.registry.generatedAtUTC : null,
        localReport: rec ? rec.localRecompute.reportPath : null,
        localReportSha256: rec ? rec.localRecompute.reportSha256 : null,
        upstreamReport: ev.upstream ? ev.upstream.reportPath : null,
        upstreamReportSha256: ev.upstream ? ev.upstream.reportSha256 : null,
      },
      rows,
      disclaimer: '自摘要一致不等于来源真实；pin 匹配不等于地面精度；历史报告只在身份相符时适用于当前产物。',
    };
  }

  function shortDigest(s) {
    if (!s) return '—';
    const t = String(s).replace(/^local-sha256:/, '');
    return t.slice(0, 12) + '…';
  }

                                                                             
  const CANNOT_SAY = Object.freeze([
    '不得把 NPP 模型值读作碳汇、碳增汇、碳信用或碳减排',
    '不得跨 2012 求差值、增幅或作趋势/断点解释',
    '不得把两个案例合计、排名或解释为同一治理项目',
    '不得把框内汇总着色读作像元级碳量分布',
    '不得用「面积相等」推断像元足迹相同',
    '不得声称本页执行了在线核验、上链或地面精度验证',
  ]);

  const CAN_SAY = Object.freeze([
    '该对象在该年的 MOD17 年度 NPP 模型碳生产量（tC/yr），及其有效产品足迹比例',
    '两个案例各自的几何来自既有格框规则或窗口规格，可追溯',
    '核验分层：内部一致 / 与已发布 pin 一致 / 已有源文件复算 / 已有上游抽样范围',
  ]);

                                                   
  function shareHref(model, objectId, year) {
    if (!model) return { ok: false, reason: '无模型' };
    if (!objectById(model, objectId)) return { ok: false, reason: '未知对象' };
    const y = Number(year);
    if (model.years.indexOf(y) < 0) return { ok: false, reason: '未知年份' };
    return {
      ok: true,
      href: 'workbench.html?case=' + model.caseKey + '&object=' + encodeURIComponent(objectId) + '&year=' + y,
      note: '只承载定位信息；不接受覆盖数据、来源或核验结论的参数。',
    };
  }
                                        
                                                 
  function parseShareParams(search, model) {
    const s = String(search || '').replace(/^\?/, '');
    const out = { ok: true, caseKey: null, objectId: null, year: null, rejected: [] };
    if (!s) return out;
    const q = {};
    s.split('&').forEach(kv => {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      q[k] = v;
    });
    const allowed = { case: 1, object: 1, year: 1 };
    Object.keys(q).forEach(k => { if (!allowed[k]) out.rejected.push('不支持的参数：' + k); });
    if (q.case !== undefined) {
      if (q.case !== 'A' && q.case !== 'B') out.rejected.push('未知案例：' + q.case);
      else out.caseKey = q.case;
    }
    if (q.year !== undefined) {
      const y = Number(q.year);
      if (!Number.isInteger(y) || y < 1900 || y > 2200) out.rejected.push('年份格式非法：' + q.year);
      else if (model && model.years.indexOf(y) < 0) out.rejected.push('未知年份：' + q.year);
      else out.year = y;
    }
    if (q.object !== undefined) out.objectId = q.object;                            
    if (out.rejected.length) out.ok = false;
    return out;
  }

  return {
    MODULE_VERSION, SCHEMA, GENERATOR, ERA_BOUNDARY_YEAR, FOOTPRINT_IDENTITY,
    CASES, AOI, AOI_SOURCE, AOI_NOTE, GROUP_LABEL, UNIT, AREA_LABELS, AREA_NOTES,
    BOUNDARY, CAN_SAY, CANNOT_SAY, RAMP, RAMP_EDGE,
    isNum, fmtNum, fmtArea, fmtRatio, eraOf, eraLabel,
    mercatorY, normPoint, bboxOfCenter, bboxNorm, boundsOfBoxes, fitView, project, projectBox, unproject,
    inBox, groupOf, pinIdentity, normalizeVerdict, pinMatches,
    TX, txPin, txCoverage, sourceDigestOf, evaluateEvidence, upstreamSampleFor,
    buildModelA, buildModelB, objectById, rowOf, valueOf, seriesOf, detailOf,
    colorBreaks, colorFor, createGate, createState, transition,
    locateHref, shareHref, parseShareParams, sourcePanel, shortDigest,
    sha256Bytes,
  };
});
