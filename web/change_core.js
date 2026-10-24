                                                                                 
  
                                                                                             
  
              
                                                            
                                                 
  
                                                                              
                                                   
  
                                   
                                                              
                                                                    
                                                                          
                                                            
                                           
   
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    const N = require('./npp_entry_core.js');
    module.exports = factory(N, bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  } else {
    root.ChangeCore = factory(root.NppEntryCore, bytes => root.ethers.sha256(bytes).slice(2));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (N, sha256Bytes) {
  'use strict';
  if (!N) throw new Error('ChangeCore 依赖 NppEntryCore（请先载入 npp_entry_core.js）');

                                                                              
  const SCHEMA = 'CarbonSat-NppChangeLedger-v1.2';
  const ENTRY_SCHEMA = 'CarbonSat-NppChangeEntry-v1.2';
  const TASKLIST_SCHEMA = 'CarbonSat-NppReviewTaskList-v1.2';
  const EXPORT_SCHEMA = 'CarbonSat-NppChangeTaskExport-v1.2';
  const GENERATOR = 'web/change_core.js';
  const GENERATOR_VERSION = 'npp-change-ledger-v1.2';

  const SOURCE_REF_DOMAIN = 'CarbonSat-MRV|npp-change-source-ref|v3\n';
  const ENTRY_DOMAIN = 'CarbonSat-MRV|npp-change-entry|v3\n';
  const BOUNDARY_DOMAIN = 'CarbonSat-MRV|npp-change-boundary-note|v3\n';
  const LEDGER_DOMAIN = 'CarbonSat-MRV|npp-change-ledger|v3\n';
  const TASK_DOMAIN = 'CarbonSat-MRV|npp-review-task|v3\n';
  const TASKLIST_DOMAIN = 'CarbonSat-MRV|npp-review-tasklist|v3\n';
  const EXPORT_STABLE_DOMAIN = 'CarbonSat-MRV|npp-change-task-export-stable|v3\n';

  const METRIC = 'prod_tC_yr';
  const METRIC_UNIT = 'tC/yr';
  const METRIC_LABEL = 'MOD17 模型年度 NPP 碳生产量（整格）';
  const ERA_BOUNDARY_YEAR = 2012;
                                                            
  const RTOL_NUMERIC = 1e-9;
  const ORDERING = 'DETERMINISTIC_KEY_ORDER_ONLY_NO_MAGNITUDE_RANKING';

  const ENTRY_TYPE = Object.freeze({ COMPARABLE: 'TEMPORAL_CHANGE_ADJACENT_YEARS', NOT_COMPARABLE: 'TEMPORAL_CHANGE_NOT_COMPARABLE' });
  const TASK_TYPE = Object.freeze({ REVIEW: 'INSUFFICIENT_EVIDENCE', DATA: 'DATA_ISSUE_PENDING', MATERIAL: 'NEED_MATERIAL' });
  const TASK_LABEL = Object.freeze({
    INSUFFICIENT_EVIDENCE: '现有证据不足，需人工复核该变化',
    DATA_ISSUE_PENDING: '原始数据/口径有疑问，需先核查',
    NEED_MATERIAL: '需补资料（足迹同一性依据）',
  });

  const BOUNDARY = Object.freeze({
    claimClass: 'DESCRIPTIVE_NPP_ONLY',
    attributionStatus: 'insufficient_evidence',
    forbiddenOutputs: Object.freeze(['REMOVAL', 'GOVERNANCE_INCREMENT', 'CARBON_CREDIT', 'tCO2e']),
    carbonQuantificationStatus: 'NOT_PERFORMED',
    registrationReady: false,
    publiclyAnchored: false,
    unassessedElements: Object.freeze(['BASELINE', 'LEAKAGE', 'NON_PERMANENCE', 'ADDITIONALITY']),
    notIncludedPools: Object.freeze(['SOC', 'BGB', 'DEADWOOD', 'LITTER', 'HWP']),
  });

  const SELF_DIGEST_NOTE = '自摘要只说明**内部一致**；要识别"相对某个已发布版本是否被改动"，必须与独立已发布摘要或外部期望值比对。自摘要一致**不等于**来源真实，**也不等于**内容从未被改动。';
  const FOOTPRINT_IDENTITY_NOTE = '本版不读取像元掩膜/影像、不重跑 GEE、不做在线重取，故两年有效像元是否逐像元一致**无法核实**；据此**不得**宣称"同一批像元"或"同一植被的纯强度变化"。';
  const TREND_FORBIDDEN_KEYS = Object.freeze(['trend', 'slope', 'growthrate', 'growth', 'exponential', 'extrapolat', 'interpolat', 'forecast', 'projection', 'significance', 'pvalue', 'confidenceinterval', 'changearea', 'deltaarea']);

                                                                          
                                                
                                    
  const DEFINITION = '同格、同 era、相邻两年的整格 prod_tC_yr（tC/yr）之差；跨 era 一律拒绝。';
  const SCOPE_NOTE = '首版不含跨格对比（SPATIAL_CONTRAST）、不含地类变化排序、不含趋势/增长率/外推。';
  const ORDERING_NOTE = '仅按 (cellId, era, yearFrom) 键排序；**不按差值幅度排序**，故"第一条"不代表"最值得看"。';
  const LIMITATIONS = Object.freeze([
    '足迹同一性恒 UNVERIFIED：不读取像元掩膜 ⇒ 不得宣称同一批像元或纯强度变化。',
    '面积容差 1e-9 仅表示数值一致性，不是足迹同一性判据。',
    '模型结构性偏差未评估；无地面真值 ⇒ 不得声称绝对精度。',
    '自摘要一致只说明内部一致，不证明来源真实、不证明内容从未被改动。',
    '不接 9 条碳主张、不接 A2 叶集；registrable 恒 false。',
  ]);
                                                 
  const GATE_CODES = Object.freeze([
    Object.freeze({ field: 'productAndMethodConsistency', code: 'PRODUCT_METHOD_INCONSISTENT' }),
    Object.freeze({ field: 'numericCompleteness', code: 'NUMERIC_INCOMPLETE' }),
    Object.freeze({ field: 'areaRelation', code: 'AREA_RELATION_OUT_OF_TOLERANCE' }),
  ]);
  const REFUSAL_REASONS = Object.freeze(['CROSS_ERA_REFUSED', 'NOT_ADJACENT_YEARS', 'CELL_YEAR_NOT_FOUND']);
                                               
  const LEDGER_KEYS = Object.freeze(['schemaVersion', 'generator', 'generatorVersion', 'ordering', 'orderingNote',
    'metric', 'metricUnit', 'metricLabel', 'eraBoundaryYear', 'rtolNumeric', 'rtolSemantics',
    'sourceRef', 'sourceRefSha256', 'definition', 'scopeNote', 'scope', 'entries', 'refused', 'counts',
    'limitations', 'boundary', 'ledgerSha256']);
  const SCOPE_KEYS = Object.freeze(['cellIds', 'eras']);
  const ENTRY_KEYS = Object.freeze(['schemaVersion', 'entryType', 'cellId', 'yearFrom', 'yearTo', 'era', 'eraLabel',
    'metric', 'metricUnit', 'metricLabel', 'deltaComputed', 'delta_tC_yr', 'fromValue_tC_yr', 'toValue_tC_yr',
    'comparable', 'failedGates', 'productAndMethodConsistency', 'numericCompleteness', 'areaRelation',
    'footprintIdentity', 'compositionComparison', 'boundaryNote', 'boundaryNoteSha256', 'sourceRefSha256',
    'readOnlyNote', 'entrySha256']);
  const ENTRY_REFUSED_KEYS = Object.freeze(['refused', 'refusalReason', 'detail', 'cellId', 'yearFrom', 'yearTo']);
  const ENTRY_REFUSED_CROSSERA_KEYS = Object.freeze(['refused', 'refusalReason', 'detail', 'cellId', 'yearFrom', 'yearTo', 'eraFrom', 'eraTo']);
  const BOUNDARY_NOTE_KEYS = Object.freeze(['claimClass', 'attributionStatus', 'forbiddenOutputs',
    'carbonQuantificationStatus', 'registrationReady', 'publiclyAnchored', 'unassessedElements', 'notIncludedPools',
    'caveats', 'canSay', 'cannotSay', 'selfDigestNote']);
  const CAVEAT_KEYS = Object.freeze(['crossEra', 'areaNumericRelDiff', 'areaToleranceMeaning', 'footprintIdentity',
    'footprintIdentityNote', 'landCoverCompositionChanged', 'modelStructuralBias', 'groundTruth', 'absoluteAccuracy']);
  const LEDGER_COUNT_KEYS = Object.freeze(['cells', 'eras', 'entries', 'comparable', 'notComparable', 'refused']);
  const TASKLIST_KEYS = Object.freeze(['schemaVersion', 'generator', 'generatorVersion', 'dedupeRule', 'taskIdRule',
    'sourceRefSha256', 'ledgerSha256', 'tasks', 'counts', 'redLineRegression', 'selfDigestNote', 'boundary',
    'taskListSha256']);
  const TASKLIST_COUNT_KEYS = Object.freeze(['tasks', 'byType', 'totalTriggers']);
  const TASK_KEYS = Object.freeze(['schemaVersion', 'taskLabel', 'taskType', 'cellId', 'era', 'metric', 'metricUnit',
    'caveats', 'requiredNext', 'materialNeeds', 'triggeredByChangeEntryShas', 'triggers', 'count',
    'sourceRefSha256', 'advisoryNote', 'taskId']);
  const TRIGGER_KEYS = Object.freeze(['entrySha256', 'cellId', 'era', 'boundaryNoteSha256', 'caveats']);
  const EXPORT_KEYS = Object.freeze(['schemaVersion', 'stable', 'stableDigest', 'event', 'fileNote']);
  const EXPORT_STABLE_KEYS = Object.freeze(['schemaVersion', 'generator', 'generatorVersion', 'boundary', 'sourceRef',
    'sourceRefSha256', 'ledger', 'taskList', 'stableNote', 'selfDigestNote', 'scopeNote']);

                                                                               
  const dig = (domain, payload) => 'local-sha256:' + N.hashText(domain + N.canonicalBits(payload));
  const clone = o => JSON.parse(JSON.stringify(o));
  const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const numText = v => (fin(v) ? String(v) : '—');

                                  
  function coreOf(obj, exclude) {
    const out = {};
    Object.keys(obj).forEach(k => { if (k !== exclude) out[k] = obj[k]; });
    return out;
  }

                                                                            
  const keysOf = o => Object.keys(o).slice().sort();
  const pairKey = (cellId, yf, yt) => cellId + '|' + yf + '|' + yt;
  const sameSet = (a, b) => a.length === b.length && a.slice().sort().join('\u0000') === b.slice().sort().join('\u0000');

                                     
  function keySetErrors(obj, allowed, at) {
    const out = [];
    if (!plain(obj)) return [at + ' 须为对象'];
    const have = keysOf(obj), want = allowed.slice().sort();
    const missing = want.filter(k => have.indexOf(k) < 0);
    const extra = have.filter(k => want.indexOf(k) < 0);
    if (missing.length) out.push(at + ' 缺字段：' + missing.join('、'));
    if (extra.length) out.push(at + ' 含未登记字段：' + extra.join('、'));
    return out;
  }

                                          
  function expectedPairKeys(cellIds, eras) {
    const out = [];
    for (const cellId of cellIds) for (const era of eras) {
      for (const p of adjacentPairs(era)) out.push(pairKey(cellId, p[0], p[1]));
    }
    return out;
  }
                                            
  const expectedCrossEraKeys = cellIds => cellIds.map(id => pairKey(id, ERA_BOUNDARY_YEAR - 1, ERA_BOUNDARY_YEAR));

                  
  function scopeErrors(scope) {
    const out = [];
    if (!plain(scope)) return ['台账缺选择范围声明（scope）'];
    out.push(...keySetErrors(scope, SCOPE_KEYS, 'scope'));
    const { cellIds, eras } = scope;
    if (!Array.isArray(cellIds) || !cellIds.length) out.push('scope.cellIds 必须为非空数组（选择范围不得为空）');
    else {
      if (!cellIds.every(x => typeof x === 'string' && x.length)) out.push('scope.cellIds 含非字符串或空串');
      if (new Set(cellIds).size !== cellIds.length) out.push('scope.cellIds 含重复项');
      if (cellIds.join('\u0000') !== cellIds.slice().sort().join('\u0000')) out.push('scope.cellIds 未按升序声明（确定性要求）');
    }
    if (!Array.isArray(eras) || !eras.length) out.push('scope.eras 必须为非空数组');
    else {
      if (!eras.every(e => e === 1 || e === 2)) out.push('scope.eras 只能取 1 或 2');
      if (new Set(eras).size !== eras.length) out.push('scope.eras 含重复项');
      if (eras.join(',') !== eras.slice().sort((a, c) => a - c).join(',')) out.push('scope.eras 未按升序声明');
    }
    return out;
  }

                                 
  function findTrendKeys(value, trail) {
    const hits = [];
    const walk = (v, path) => {
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
      if (!plain(v)) return;
      for (const k of Object.keys(v)) {
        const lk = String(k).toLowerCase();
        if (TREND_FORBIDDEN_KEYS.some(t => lk.includes(t))) hits.push(path + '.' + k);
        walk(v[k], path + '.' + k);
      }
    };
    walk(value, trail || '');
    return hits;
  }

                                                                              
                                                                                
  function adjacentPairs(era) {
    const e = Number(era);
    const ys = N.AUTH_YEARS.filter(y => N.eraOf(y) === e);
    const out = [];
    for (let i = 0; i < ys.length - 1; i++) out.push([ys[i], ys[i + 1]]);
    return out;
  }

                                                                          
  function buildSourceRef(b, opts) {
    const o = opts || {};
    const v = o.verification || N.verifyBundle(b, { pin: o.pin, fileSha256: o.fileSha256 });
    return {
      bundlePath: N.BUNDLE_PATH,
      bundleSchemaVersion: b.schemaVersion,
      bundleGeneratorVersion: b.generatorVersion,
      bundleFileSha256: typeof o.fileSha256 === 'string' ? o.fileSha256 : null,
      bundleContentSha256Declared: b.bundleContentSha256,
      bundleContentSha256Recomputed: v.content ? v.content.recomputed : null,
      publishedPin: {
        provided: !!(v.publishedPin && v.publishedPin.provided),
        status: v.publishedPin ? v.publishedPin.status : 'PIN_ABSENT',
        bundleFileSha256: o.pin ? o.pin.bundleFileSha256 : null,
        bundleContentSha256: o.pin ? o.pin.bundleContentSha256 : null,
      },
      productionIntegral: { path: b.generatedFrom.productionIntegral.path, sha256: b.generatedFrom.productionIntegral.sha256 },
      a2ValidFootprint: { path: b.generatedFrom.a2ValidFootprint.path, sha256: b.generatedFrom.a2ValidFootprint.sha256 },
      methodology: {
        method_version: b.methodology.method_version,
        lc_method_version: b.methodology.landcover_method_version,
        product: b.methodology.product, lcProduct: b.methodology.lcProduct,
        mask: b.methodology.mask, crs: b.methodology.crs, scale: b.methodology.scale,
      },
      eraBoundaryYear: b.eraBoundaryYear,
      expectedCellYears: b.expectedCellYears, observedCellYears: b.observedCellYears,
      expectedClassRows: b.expectedClassRows, observedClassRows: b.observedClassRows,
    };
  }
  const sourceRefSha = sr => dig(SOURCE_REF_DOMAIN, sr);

                                                                              
                                                
                                                    
                          
     
  const LOCATE_PARAMS = Object.freeze(['cell', 'era', 'year']);

  function parseLocateParams(search, ctx) {
    const c = ctx || {};
    const cells = Array.isArray(c.cells) ? c.cells : [];
    const years = Array.isArray(c.years) ? c.years : [];
    const s = String(search == null ? '' : search).replace(/^\?/, '');
    const out = { ok: true, cellId: null, era: null, year: null, rejected: [], applied: false, present: false };
    if (!s) return out;
    out.present = true;

    const q = {};
    s.split('&').forEach(kv => {
      if (!kv) return;
      const i = kv.indexOf('=');
      const k = decodeURIComponent(i < 0 ? kv : kv.slice(0, i));
      const v = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1));
      q[k] = v;
    });

    Object.keys(q).forEach(k => { if (LOCATE_PARAMS.indexOf(k) < 0) out.rejected.push('不支持的参数：' + k); });

    if (q.cell !== undefined) {
      if (cells.indexOf(q.cell) < 0) out.rejected.push('未知格：' + q.cell);
      else out.cellId = q.cell;
    }
    if (q.year !== undefined) {
      const y = Number(q.year);
      if (!Number.isInteger(y) || years.indexOf(y) < 0) out.rejected.push('未知年份：' + q.year);
      else out.year = y;
    }
    if (q.era !== undefined) {
      const e = Number(q.era);
      if (e !== 1 && e !== 2) out.rejected.push('未知时段：' + q.era);
      else if (out.year !== null && N.eraOf(out.year) !== e) out.rejected.push('时段与年份不一致：era ' + e + ' 与 ' + out.year);
      else out.era = e;
    }

    out.ok = out.rejected.length === 0;
    out.applied = out.ok && (out.cellId !== null || out.year !== null || out.era !== null);
    return out;
  }

     
                                              
                                            
     
  function locateRecord(b, cellId, year, opts) {
    const o = opts || {};
    const v = N.verifyBundle(b, { pin: o.pin, fileSha256: o.fileSha256 });
    if (!v.ok) throw new Error('数据包未通过核验，拒绝定位：' + v.errors.join('；'));
    const y = Number(year);
    const cy = b.cellYears[N.cyKey(cellId, y)];
    if (!cy) return { found: false, cellId, year: y, reason: '该格年不在本次集合内（可能是被删除或重复主键的年份）' };
    const cell = b.cells.find(c => c.cellId === cellId) || null;
    const u = N.cellYearUsable(cy);
    const sr = buildSourceRef(b, { pin: o.pin, fileSha256: o.fileSha256, verification: v });
    return {
      found: true, locatorVersion: ENTRY_SCHEMA, cellId, year: y, key: N.cyKey(cellId, y),
      lon: cell ? cell.lon : null, lat: cell ? cell.lat : null,
      era: N.eraOf(y), eraLabel: N.eraLabel(N.eraOf(y)),
      usable: u.usable, unusableReason: u.reason,
      metric: METRIC, metricUnit: METRIC_UNIT, metricLabel: METRIC_LABEL,
      value: u.usable ? cy.prod_tC_yr : null,
      area: { gridValidAreaM2: cy.gridValidAreaM2, gridTotalAreaM2: cy.gridTotalAreaM2, geomAreaM2: cy.geomAreaM2, validAreaRatio: cy.validAreaRatio },
      sourceRef: sr, sourceRefSha256: sourceRefSha(sr),
      note: '定位只在已核验的派生 bundle 内进行；本模块不读源 CSV、不重跑 GEE。',
    };
  }

                                                                               
  function compositionComparison(from, to) {
    const pick = rows => { const m = {}; (rows || []).forEach(r => { m[String(r.lcCode)] = { lcCode: r.lcCode, lcName: r.lcName, classValidAreaM2: r.classValidAreaM2 }; }); return m; };
    const a = pick(from.landCover), c = pick(to.landCover);
    const codes = Array.from(new Set(Object.keys(a).concat(Object.keys(c)))).sort((x, y) => Number(x) - Number(y));
    const rows = codes.map(k => {
      const x = a[k] ? a[k].classValidAreaM2 : null, y = c[k] ? c[k].classValidAreaM2 : null;
      const same = (x === null && y === null) || (fin(x) && fin(y) && N.relDiff(x, y) <= RTOL_NUMERIC);
      return {
        lcCode: Number(k), lcName: (a[k] || c[k]).lcName,
        fromClassValidAreaM2: fin(x) ? x : null, toClassValidAreaM2: fin(y) ? y : null, sameArea: same,
      };
    });
    const changed = rows.some(r => !r.sameArea);
    return {
      rows, changed,
      note: '地类构成列：**描述性并列**，不参与排序；构成差异**不得**被解释为同一植被的单位面积生产力变化、真实土地转化或治理效果。',
    };
  }

  function buildBoundaryNote(a) {
    const canSay = [], cannotSay = [];
    if (a.comparable) {
      canSay.push('所选离散足迹（' + a.cellId + '）的 ' + METRIC_LABEL + '，在 era ' + a.era + ' 内由 ' + numText(a.fromValue) + ' tC/yr 变为 ' + numText(a.toValue) + ' tC/yr（差 ' + numText(a.delta) + ' tC/yr）');
      canSay.push('两条记录同格、同分析时段（era ' + a.era + '）、相邻年（' + a.yearFrom + '→' + a.yearTo + '）、同指标同单位；两格年面积**数值**一致到 1e-9（仅数值一致性）');
    } else {
      canSay.push('本条未通过可比性门禁（' + (a.failedGates.join('、') || '未说明') + '）⇒ **不产出差值**（不用剩余项凑、不填 0）');
    }
    canSay.push('这是 MOD17 模型值，不是实测通量，也不是碳汇');
    cannotSay.push('不可以说：该差异由治理措施造成');
    cannotSay.push('不可以说：该格碳汇增加或减少');
    cannotSay.push('不可以说：该差异等于碳量、减排量或信用量');
    if (a.footprintIdentity && a.footprintIdentity.status !== 'VERIFIED') {
      cannotSay.push('不可以说：两年有效像元是同一批像元');
      cannotSay.push('不可以说：这是同一植被的纯强度变化（足迹同一性未核实）');
    }
    cannotSay.push('不可以说：本页给出了绝对精度或误差');
    if (a.composition && a.composition.changed) cannotSay.push('不可以说：地类构成差异是治理效果或植被恢复');
    if (!a.comparable) cannotSay.push('不可以说：该条差异是"变化"（未通过门禁，本条不成立）');
    return {
      claimClass: BOUNDARY.claimClass,
      attributionStatus: BOUNDARY.attributionStatus,
      forbiddenOutputs: clone(BOUNDARY.forbiddenOutputs),
      carbonQuantificationStatus: BOUNDARY.carbonQuantificationStatus,
      registrationReady: BOUNDARY.registrationReady,
      publiclyAnchored: BOUNDARY.publiclyAnchored,
      unassessedElements: clone(BOUNDARY.unassessedElements),
      notIncludedPools: clone(BOUNDARY.notIncludedPools),
      caveats: {
        crossEra: false,
        areaNumericRelDiff: a.areaRelation.relDiffGridValidAreaM2,
        areaToleranceMeaning: 'NUMERIC_CONSISTENCY_ONLY',
        footprintIdentity: 'UNVERIFIED',
        footprintIdentityNote: FOOTPRINT_IDENTITY_NOTE,
        landCoverCompositionChanged: !!(a.composition && a.composition.changed),
        modelStructuralBias: 'UNASSESSED',
        groundTruth: 'NONE',
        absoluteAccuracy: 'NOT_VERIFIED',
      },
      canSay, cannotSay,
      selfDigestNote: SELF_DIGEST_NOTE,
    };
  }

     
                                                           
     
  function computeEntry(b, cellId, yearFrom, yearTo, ctx) {
    const yf = Number(yearFrom), yt = Number(yearTo);
    const base = { cellId, yearFrom: yf, yearTo: yt };
    const from = b.cellYears[N.cyKey(cellId, yf)];
    const to = b.cellYears[N.cyKey(cellId, yt)];
    if (!from || !to) return Object.assign({ refused: true, refusalReason: 'CELL_YEAR_NOT_FOUND', detail: '格年不在已核验数据包内（缺格年或主键被改）' }, base);
    if (yt !== yf + 1) return Object.assign({ refused: true, refusalReason: 'NOT_ADJACENT_YEARS', detail: '首版只支持相邻年（y+1）' }, base);
    if (N.eraOf(yf) !== N.eraOf(yt)) {
      return Object.assign({
        refused: true, refusalReason: 'CROSS_ERA_REFUSED', eraFrom: N.eraOf(yf), eraTo: N.eraOf(yt),
        detail: '跨 2012 一律拒绝：该断点成因未证实，按分析时段分段；本条不成立、不出差值',
      }, base);
    }
    const era = N.eraOf(yf);
    const uF = N.cellYearUsable(from), uT = N.cellYearUsable(to);

    const productAndMethodConsistency = {
      ok: true,
      basis: 'bundle 级方法学声明已与权威镜像逐字核验（validateBundle）；两格年同属该包',
      perRowMethodFieldsPresentInBundle: false,
      note: 'bundle 的格年记录**不含**逐行 product/method 字段 ⇒ 逐行方法一致性由命令行 build_npp_estimate_bundle.py --verify 对源 CSV 核验，本页不重复该能力。',
    };

    const numericCompleteness = {
      ok: !!(uF.usable && uT.usable),
      fromUsable: uF.usable, toUsable: uT.usable,
      fromReason: uF.reason, toReason: uT.reason,
      bothFinite: fin(from.prod_tC_yr) && fin(to.prod_tC_yr),
      checks: [
        { name: 'from 可用（非缺测、missingReason 一致）', ok: uF.usable },
        { name: 'to 可用（非缺测、missingReason 一致）', ok: uT.usable },
        { name: '两格年 prod_tC_yr 均为有限数', ok: fin(from.prod_tC_yr) && fin(to.prod_tC_yr) },
      ],
    };

    const relV = (fin(from.gridValidAreaM2) && fin(to.gridValidAreaM2)) ? N.relDiff(from.gridValidAreaM2, to.gridValidAreaM2) : null;
    const relT = (fin(from.gridTotalAreaM2) && fin(to.gridTotalAreaM2)) ? N.relDiff(from.gridTotalAreaM2, to.gridTotalAreaM2) : null;
    const ratioOk = [from, to].every(cy => !(fin(cy.gridValidAreaM2) && fin(cy.gridTotalAreaM2) && cy.gridTotalAreaM2 > 0)
      || (fin(cy.validAreaRatio) && N.relDiff(cy.validAreaRatio, cy.gridValidAreaM2 / cy.gridTotalAreaM2) <= RTOL_NUMERIC));
    const areaRelation = {
      ok: relV !== null && relV <= RTOL_NUMERIC && relT !== null && relT <= RTOL_NUMERIC && ratioOk,
      tolerance: RTOL_NUMERIC,
      toleranceMeaning: 'NUMERIC_CONSISTENCY_ONLY',
      relDiffGridValidAreaM2: relV, relDiffGridTotalAreaM2: relT, areaRatioClosureOk: ratioOk,
      note: '面积**数值**一致 ≠ 足迹同一。反例：有效区域为同格的东半部与西半部时面积可以相等而位置不同。',
    };

    const footprintIdentity = {
      status: 'UNVERIFIED',
      basis: FOOTPRINT_IDENTITY_NOTE,
      canClaimSamePixelFootprint: false,
      canClaimSameVegetationIntensityChange: false,
      evidenceRequired: '两年有效像元掩膜或等效足迹依据（本版未读取、未重跑 GEE）',
      checked: false,
    };

    const composition = compositionComparison(from, to);

    const failedGates = [];
    if (!productAndMethodConsistency.ok) failedGates.push('PRODUCT_METHOD_INCONSISTENT');
    if (!numericCompleteness.ok) failedGates.push('NUMERIC_INCOMPLETE');
    if (!areaRelation.ok) failedGates.push('AREA_RELATION_OUT_OF_TOLERANCE');
    const comparable = failedGates.length === 0;
    const delta = comparable ? (to.prod_tC_yr - from.prod_tC_yr) : null;

    const boundaryNote = buildBoundaryNote({
      comparable, cellId, era, yearFrom: yf, yearTo: yt,
      fromValue: from.prod_tC_yr, toValue: to.prod_tC_yr, delta,
      failedGates, areaRelation, footprintIdentity, composition,
    });

    const entry = {
      schemaVersion: ENTRY_SCHEMA,
      entryType: comparable ? ENTRY_TYPE.COMPARABLE : ENTRY_TYPE.NOT_COMPARABLE,
      cellId, yearFrom: yf, yearTo: yt, era, eraLabel: N.eraLabel(era),
      metric: METRIC, metricUnit: METRIC_UNIT, metricLabel: METRIC_LABEL,
      deltaComputed: comparable,
      delta_tC_yr: delta,
      fromValue_tC_yr: fin(from.prod_tC_yr) ? from.prod_tC_yr : null,
      toValue_tC_yr: fin(to.prod_tC_yr) ? to.prod_tC_yr : null,
      comparable,
      failedGates,
      productAndMethodConsistency, numericCompleteness, areaRelation, footprintIdentity,
      compositionComparison: composition,
      boundaryNote,
      boundaryNoteSha256: dig(BOUNDARY_DOMAIN, boundaryNote),
      sourceRefSha256: ctx.sourceRefSha256,
      readOnlyNote: '本条目只描述既有产物的模型值差异；不构成碳汇、碳量、信用量或治理归因。',
    };
    entry.entrySha256 = dig(ENTRY_DOMAIN, coreOf(entry, 'entrySha256'));
    return entry;
  }

                                                                             
     
                                                    
                                                    
     
  function buildLedger(b, opts) {
    const o = opts || {};
    const v = N.verifyBundle(b, { pin: o.pin, fileSha256: o.fileSha256 });
    if (!v.ok) throw new Error('数据包未通过核验，拒绝构建台账：' + v.errors.join('；'));
    const sr = buildSourceRef(b, { pin: o.pin, fileSha256: o.fileSha256, verification: v });
    const srSha = sourceRefSha(sr);
    const allCells = b.cells.map(c => c.cellId).filter(id => typeof id === 'string').slice().sort();
    const cellIds = (o.cellIds && o.cellIds.length ? o.cellIds.slice() : allCells).slice().sort();
    const unknown = cellIds.filter(id => allCells.indexOf(id) < 0);
    if (unknown.length) throw new Error('请求的格不在既有 34 格内：' + unknown.join('、'));
    const eras = (o.eras && o.eras.length ? o.eras.slice() : [1, 2]).map(Number).sort((a, c) => a - c);
    for (const e of eras) if (e !== 1 && e !== 2) throw new Error('era 只能取 1 或 2：' + e);

    const entries = [], refused = [];
    for (const cellId of cellIds) for (const era of eras) for (const pair of adjacentPairs(era)) {
      const r = computeEntry(b, cellId, pair[0], pair[1], { sourceRefSha256: srSha });
      if (r.refused) refused.push(r); else entries.push(r);
    }
                                                        
                                  
    for (const cellId of cellIds) {
      const r = computeEntry(b, cellId, ERA_BOUNDARY_YEAR - 1, ERA_BOUNDARY_YEAR, { sourceRefSha256: srSha });
      if (r.refused) refused.push(r); else throw new Error('内部错误：跨 era 对未被拒绝：' + cellId);
    }
    const comparable = entries.filter(e => e.comparable).length;

    const ledger = {
      schemaVersion: SCHEMA,
      generator: GENERATOR, generatorVersion: GENERATOR_VERSION,
      ordering: ORDERING,
      orderingNote: ORDERING_NOTE,
      metric: METRIC, metricUnit: METRIC_UNIT, metricLabel: METRIC_LABEL,
      eraBoundaryYear: ERA_BOUNDARY_YEAR,
      rtolNumeric: RTOL_NUMERIC, rtolSemantics: 'NUMERIC_CONSISTENCY_ONLY',
      sourceRef: sr, sourceRefSha256: srSha,
      definition: DEFINITION,
      scopeNote: SCOPE_NOTE,
                                                      
      scope: { cellIds, eras },
      entries, refused,
      counts: {
        cells: cellIds.length, eras: eras.length, entries: entries.length,
        comparable, notComparable: entries.length - comparable, refused: refused.length,
      },
      limitations: LIMITATIONS.slice(),
      boundary: clone(BOUNDARY),
    };
    ledger.ledgerSha256 = dig(LEDGER_DOMAIN, coreOf(ledger, 'ledgerSha256'));
    return ledger;
  }

     
                           
    
                                             
                                                 
                                                
                                                               
    
                                                         
                                       
     
  function verifyLedger(ledger, opts) {
    const o = opts || {};
    const errors = [];
    let checkedEntries = 0;
    let sourceValuesReverified = false;
    try {
      if (!plain(ledger)) return { ok: false, errors: ['台账须为对象'], checkedEntries: 0, sourceValuesReverified: false };
      errors.push(...keySetErrors(ledger, LEDGER_KEYS, '台账'));

                                       
      if (ledger.schemaVersion !== SCHEMA) errors.push('台账版本不符（须 ' + SCHEMA + '）');
      if (ledger.generator !== GENERATOR || ledger.generatorVersion !== GENERATOR_VERSION) errors.push('台账生成器登记不符');
      if (ledger.ordering !== ORDERING) errors.push('排序口径被改写');
      if (ledger.orderingNote !== ORDERING_NOTE) errors.push('排序说明被改写');
      if (ledger.definition !== DEFINITION) errors.push('台账定义被改写');
      if (ledger.scopeNote !== SCOPE_NOTE) errors.push('范围声明被改写');
      if (ledger.metric !== METRIC || ledger.metricUnit !== METRIC_UNIT || ledger.metricLabel !== METRIC_LABEL) errors.push('指标/单位/标签被改写');
      if (ledger.eraBoundaryYear !== ERA_BOUNDARY_YEAR) errors.push('era 断点被改写');
      if (ledger.rtolNumeric !== RTOL_NUMERIC) errors.push('容差数值被改写');
      if (ledger.rtolSemantics !== 'NUMERIC_CONSISTENCY_ONLY') errors.push('容差语义被改写（必须保持数值一致性口径）');
      if (!Array.isArray(ledger.limitations) || N.canonical(ledger.limitations) !== N.canonical(LIMITATIONS)) errors.push('必备局限被删减或改写（limitations 为固定声明）');
      for (const k of Object.keys(BOUNDARY)) {
        if (N.canonical(ledger.boundary[k]) !== N.canonical(BOUNDARY[k])) errors.push('台账边界常量被改写：' + k);
      }

                          
      if (ledger.ledgerSha256 !== dig(LEDGER_DOMAIN, coreOf(ledger, 'ledgerSha256'))) errors.push('台账摘要与台账内容不符（改了内容但未重签）');
      if (ledger.sourceRefSha256 !== sourceRefSha(ledger.sourceRef)) errors.push('来源绑定摘要与来源块不符');

                                          
      const scErrs = scopeErrors(ledger.scope);
      errors.push(...scErrs);
      const scopeOk = scErrs.length === 0;
      const cellIds = scopeOk ? ledger.scope.cellIds : [];
      const eras = scopeOk ? ledger.scope.eras : [];

      const trend = findTrendKeys({ entries: ledger.entries, refused: ledger.refused, counts: ledger.counts }, '');
      if (trend.length) errors.push('台账含被禁止的趋势/外推类字段：' + trend.slice(0, 3).join('、'));
      if (!Array.isArray(ledger.entries) || !Array.isArray(ledger.refused)) errors.push('台账条目结构不符');

                          
      let comparable = 0;
      const seenEntryKeys = new Set(), seenRefusedKeys = new Set();
      (Array.isArray(ledger.entries) ? ledger.entries : []).forEach((e, i) => {
        const at = 'entry#' + i;
        errors.push(...keySetErrors(e, ENTRY_KEYS, at));
        if (e.schemaVersion !== ENTRY_SCHEMA) errors.push('条目版本不符：' + at);
        if (e.entrySha256 !== dig(ENTRY_DOMAIN, coreOf(e, 'entrySha256'))) errors.push('条目摘要与条目内容不符：' + at);
        if (e.boundaryNoteSha256 !== dig(BOUNDARY_DOMAIN, e.boundaryNote)) errors.push('条目边界声明摘要不符：' + at);
        if (e.sourceRefSha256 !== ledger.sourceRefSha256) errors.push('条目来源绑定与台账不一致：' + at);
        if (e.metric !== METRIC || e.metricUnit !== METRIC_UNIT || e.metricLabel !== METRIC_LABEL) errors.push('条目指标/单位/标签被改写：' + at);

                            
        const yf = e.yearFrom, yt = e.yearTo;
        if (!Number.isInteger(yf) || !Number.isInteger(yt)) errors.push('条目年份须为整数：' + at);
        else if (yt !== yf + 1) errors.push('首版只允许相邻年（yearTo = yearFrom + 1）：' + at + ' 实为 ' + yf + '→' + yt);
        if (N.eraOf(yf) !== e.era || N.eraOf(yt) !== e.era) errors.push('条目 era 与其年份不符（或跨 era 残留）：' + at);
        if (typeof e.cellId !== 'string' || cellIds.indexOf(e.cellId) < 0) errors.push('条目格不在声明的选择范围内：' + at);
        if (eras.indexOf(e.era) < 0) errors.push('条目 era 不在声明的选择范围内：' + at);
        if (e.eraLabel !== N.eraLabel(e.era)) errors.push('条目 era 标签不符：' + at);

                  
        if (Number.isInteger(yf) && Number.isInteger(yt)) {
          const k = pairKey(e.cellId, yf, yt);
          if (seenEntryKeys.has(k)) errors.push('条目年对重复：' + k);
          seenEntryKeys.add(k);
        }

                                                     
        const expectedFailed = [];
        for (const g of GATE_CODES) {
          const gate = e[g.field];
          if (!plain(gate) || typeof gate.ok !== 'boolean') { errors.push('门禁结构不符：' + at + '.' + g.field); continue; }
          if (gate.ok === false) expectedFailed.push(g.code);
        }
        if (!Array.isArray(e.failedGates)) errors.push('failedGates 须为数组：' + at);
        else if (!sameSet(e.failedGates, expectedFailed)) {
          errors.push('failedGates 与门禁状态互推不符：' + at + '（声明 ' + JSON.stringify(e.failedGates) + '，应为 ' + JSON.stringify(expectedFailed) + '）');
        }
        const comparableNow = Array.isArray(e.failedGates) && e.failedGates.length === 0 && expectedFailed.length === 0;
        if (typeof e.comparable !== 'boolean') errors.push('comparable 须为布尔：' + at);
        else if (e.comparable !== comparableNow) errors.push('comparable 与门禁状态矛盾：' + at);
        if (e.deltaComputed !== e.comparable) errors.push('deltaComputed 与 comparable 矛盾：' + at);
        const wantType = e.comparable ? ENTRY_TYPE.COMPARABLE : ENTRY_TYPE.NOT_COMPARABLE;
        if (e.entryType !== wantType) errors.push('条目类型与 comparable 矛盾：' + at);

        if (e.comparable) {
          comparable++;
          if (!fin(e.fromValue_tC_yr) || !fin(e.toValue_tC_yr)) errors.push('标为可比的条目却缺端点值：' + at);
          if (!fin(e.delta_tC_yr)) errors.push('标为可比的条目却无比值：' + at);
          else if (fin(e.fromValue_tC_yr) && fin(e.toValue_tC_yr) && N.relDiff(e.delta_tC_yr, e.toValue_tC_yr - e.fromValue_tC_yr) > RTOL_NUMERIC) {
            errors.push('条目差值与其两端不符：' + at);
          }
        } else if (e.delta_tC_yr !== null) errors.push('不可比条目却带出差值（不得静默相减）：' + at);

                                         
        if (!plain(e.footprintIdentity) || e.footprintIdentity.status !== 'UNVERIFIED') errors.push('本版足迹同一性必须保持 UNVERIFIED：' + at);
        else if (e.footprintIdentity.canClaimSamePixelFootprint !== false || e.footprintIdentity.canClaimSameVegetationIntensityChange !== false) errors.push('本版不得声称同一像元/纯强度变化：' + at);

                                                         
        if (!plain(e.boundaryNote)) errors.push('条目缺边界声明：' + at);
        else {
          errors.push(...keySetErrors(e.boundaryNote, BOUNDARY_NOTE_KEYS, at + '.boundaryNote'));
          if (plain(e.boundaryNote.caveats)) errors.push(...keySetErrors(e.boundaryNote.caveats, CAVEAT_KEYS, at + '.boundaryNote.caveats'));
          for (const k of Object.keys(BOUNDARY)) {
            if (N.canonical(e.boundaryNote[k]) !== N.canonical(BOUNDARY[k])) errors.push('条目边界常量被改写：' + at + '.' + k);
          }
          if (e.boundaryNote.selfDigestNote !== SELF_DIGEST_NOTE) errors.push('条目自摘要说明被改写：' + at);
          if (plain(e.areaRelation) && plain(e.footprintIdentity) && plain(e.compositionComparison)) {
            const rebuilt = buildBoundaryNote({
              comparable: e.comparable, cellId: e.cellId, era: e.era, yearFrom: yf, yearTo: yt,
              fromValue: fin(e.fromValue_tC_yr) ? e.fromValue_tC_yr : null,
              toValue: fin(e.toValue_tC_yr) ? e.toValue_tC_yr : null,
              delta: fin(e.delta_tC_yr) ? e.delta_tC_yr : null,
              failedGates: Array.isArray(e.failedGates) ? e.failedGates : [],
              areaRelation: e.areaRelation, footprintIdentity: e.footprintIdentity,
              composition: { changed: !!(e.compositionComparison && e.compositionComparison.changed) },
            });
            if (N.canonical(rebuilt) !== N.canonical(e.boundaryNote)) {
              errors.push('条目边界声明与按条目状态重算的结果不符（必备局限被删减/改写，或 canSay/cannotSay 与状态不一致）：' + at);
            }
          }
        }
        checkedEntries++;
      });

                          
      (Array.isArray(ledger.refused) ? ledger.refused : []).forEach((r, i) => {
        const at = 'refused#' + i;
        const allowed = r && r.refusalReason === 'CROSS_ERA_REFUSED' ? ENTRY_REFUSED_CROSSERA_KEYS : ENTRY_REFUSED_KEYS;
        errors.push(...keySetErrors(r, allowed, at));
        if (r.refused !== true) errors.push('拒收记录缺 refused=true：' + at);
        if (!REFUSAL_REASONS.includes(r.refusalReason)) errors.push('拒收原因未登记：' + at + ' ' + String(r.refusalReason));
        if (typeof r.cellId !== 'string' || cellIds.indexOf(r.cellId) < 0) errors.push('拒收记录格不在选择范围内：' + at);
        if (!Number.isInteger(r.yearFrom) || !Number.isInteger(r.yearTo)) errors.push('拒收记录年份须为整数：' + at);
        if (r.refusalReason === 'CROSS_ERA_REFUSED' && N.eraOf(r.yearFrom) === N.eraOf(r.yearTo)) errors.push('跨 era 拒收记录与年份不符：' + at);
        if (r.refusalReason === 'NOT_ADJACENT_YEARS' && r.yearTo === r.yearFrom + 1) errors.push('"非相邻年"拒收记录其实相邻：' + at);
        if (Number.isInteger(r.yearFrom) && Number.isInteger(r.yearTo)) {
          const k = pairKey(r.cellId, r.yearFrom, r.yearTo);
          if (seenRefusedKeys.has(k)) errors.push('拒收记录重复：' + k);
          seenRefusedKeys.add(k);
        }
      });
      const refusedKeys = Array.from(seenRefusedKeys);

                                              
      if (scopeOk && Array.isArray(ledger.entries) && Array.isArray(ledger.refused)) {
        const wantPair = expectedPairKeys(cellIds, eras);                                           
        const wantCross = expectedCrossEraKeys(cellIds);                               
        const wantAll = wantPair.concat(wantCross);
        const entryKeys = Array.from(seenEntryKeys);
        const got = entryKeys.concat(refusedKeys);
        const missing = wantAll.filter(k => got.indexOf(k) < 0);
        const extra = got.filter(k => wantAll.indexOf(k) < 0);
        if (missing.length) errors.push('条目/拒收未覆盖选择范围应有的年对（缺 ' + missing.length + ' 条，例如 ' + missing[0] + '）');
        if (extra.length) errors.push('出现选择范围之外的年对（多 ' + extra.length + ' 条，例如 ' + extra[0] + '）');
                        
        const both = entryKeys.filter(k => refusedKeys.indexOf(k) >= 0);
        if (both.length) errors.push('同一年对既出条目又被拒收：' + both[0]);
                                       
        const crossAsEntry = entryKeys.filter(k => wantCross.indexOf(k) >= 0);
        if (crossAsEntry.length) errors.push('跨 2012 断点对不得产出条目：' + crossAsEntry[0]);
        const missingCross = wantCross.filter(k => refusedKeys.indexOf(k) < 0);
        if (missingCross.length) errors.push('跨 2012 断点对未显式拒收（缺 ' + missingCross.length + ' 条，例如 ' + missingCross[0] + '）');
        if (entryKeys.length + refusedKeys.length !== wantAll.length) {
          errors.push('条目+拒收总数与选择范围推导值不符（应 ' + wantAll.length + '，实 ' + (entryKeys.length + refusedKeys.length) + '）');
        }
      }

                                   
      if (plain(ledger.counts)) {
        errors.push(...keySetErrors(ledger.counts, LEDGER_COUNT_KEYS, 'counts'));
        const actual = {
          cells: cellIds.length, eras: eras.length,
          entries: (ledger.entries || []).length, comparable,
          notComparable: (ledger.entries || []).length - comparable, refused: (ledger.refused || []).length,
        };
        for (const k of LEDGER_COUNT_KEYS) {
          if (ledger.counts[k] !== actual[k]) errors.push('计数与实测不符：' + k + ' 声明 ' + String(ledger.counts[k]) + '，实测 ' + String(actual[k]));
        }
      } else errors.push('台账缺计数块');

                                            
      if (o.bundle) {
        const rebuilt = buildLedger(o.bundle, {
          pin: o.pin, fileSha256: o.fileSha256,
          cellIds: (ledger.scope && ledger.scope.cellIds) || undefined,
          eras: (ledger.scope && ledger.scope.eras) || undefined,
        });
        sourceValuesReverified = true;
        if (N.canonical(rebuilt.entries) !== N.canonical(ledger.entries)) errors.push('条目与由可信数据包重算的结果不符（本件条目非来自该数据包）');
        if (N.canonical(rebuilt.refused) !== N.canonical(ledger.refused)) errors.push('拒收集合与由可信数据包重算的结果不符');
        if (N.canonical(rebuilt.counts) !== N.canonical(ledger.counts)) errors.push('计数与由可信数据包重算的结果不符');
                                                           
                                                         
      }

                                                 
      const hits = N.forbiddenScan(N.canonical({
        definition: ledger.definition, scopeNote: ledger.scopeNote, orderingNote: ledger.orderingNote,
        limitations: ledger.limitations,
        entries: (ledger.entries || []).map(e => ({
          canSay: e.boundaryNote && e.boundaryNote.canSay, cannotSay: e.boundaryNote && e.boundaryNote.cannotSay,
          notes: [e.readOnlyNote, e.compositionComparison && e.compositionComparison.note, e.footprintIdentity && e.footprintIdentity.basis],
          next: (e.boundaryNote && e.boundaryNote.caveats) ? [e.boundaryNote.caveats.footprintIdentityNote] : [],
        })),
      }));
      if (hits.length) errors.push('台账含禁止表述：' + hits.join('、'));
    } catch (e) { errors.push('核验过程异常：' + e.message); }
    return {
      ok: !errors.length, errors: Array.from(new Set(errors)),
      checkedEntries, sourceValuesReverified,
      provenance: [
        { level: '①', name: '内部重算（固定键集/固定声明/选择范围推导/条目与门禁互推/摘要）', status: errors.length ? '未通过' : '通过' },
        { level: '②', name: '与可信当前数据包逐条重算比对', status: sourceValuesReverified ? (errors.length ? '未通过' : '通过') : 'NOT_EVALUATED（调用方未提供可信数据包 ⇒ 只做了内部一致性核验）' },
      ],
    };
  }

                                                                             
     
                                     
                                                
     
  function taskStableContent(a) {
    return {
      schemaVersion: TASKLIST_SCHEMA,
      taskType: a.taskType, cellId: a.cellId, era: a.era,
      metric: METRIC, metricUnit: METRIC_UNIT,
      caveats: a.caveats.slice().sort(),
      triggeredByChangeEntryShas: a.triggeredByChangeEntryShas.slice().sort(),
      triggerBoundaryNoteShas: (a.triggers || []).map(t => t.entrySha256 + ':' + t.boundaryNoteSha256).sort(),
      sourceRefSha256: a.sourceRefSha256,
    };
  }
  const taskIdOf = a => dig(TASK_DOMAIN, taskStableContent(a));

                                                    
  function expectedTaskCaveats(entry, taskType) {
    if (taskType === TASK_TYPE.MATERIAL) return ['FOOTPRINT_IDENTITY_UNVERIFIED'];
    return caveatsOf(entry);
  }
                     
  const expectedTaskTypesFor = entry => (entry.comparable ? [TASK_TYPE.REVIEW, TASK_TYPE.MATERIAL] : [TASK_TYPE.DATA]);

  function caveatsOf(entry) {
    const c = [];
    if (entry.comparable) {
      c.push('FOOTPRINT_IDENTITY_UNVERIFIED');
      if (entry.compositionComparison.changed) c.push('LANDCOVER_COMPOSITION_CHANGED');
      c.push('MODEL_STRUCTURAL_BIAS_UNASSESSED');
    } else {
      entry.failedGates.forEach(g => c.push(g));
    }
    return c.sort();
  }
  const caveatSig = c => c.slice().sort().join(',');

     
                                                           
    
                                                                           
                                               
                                                                            
                                             
    
                                                       
                                              
     
  function deriveTasks(ledger) {
    const buckets = new Map();
    const add = (entry, taskType, requiredNext, materialNeeds) => {
      const caveats = expectedTaskCaveats(entry, taskType);
      const key = entry.cellId + '|' + taskType + '|' + entry.era + '|' + caveatSig(caveats);
      let b = buckets.get(key);
      if (!b) {
        b = {
          key, taskType, cellId: entry.cellId, era: entry.era, caveats,
          requiredNext, materialNeeds: materialNeeds || [],
          triggeredByChangeEntryShas: [], triggerNotes: new Map(),
          sourceRefSha256: ledger.sourceRefSha256,
        };
        buckets.set(key, b);
      }
      if (b.triggeredByChangeEntryShas.indexOf(entry.entrySha256) < 0) {
        b.triggeredByChangeEntryShas.push(entry.entrySha256);
                                                  
        b.triggerNotes.set(entry.entrySha256, { entrySha256: entry.entrySha256, cellId: entry.cellId, era: entry.era, boundaryNoteSha256: entry.boundaryNoteSha256, caveats });
      }
    };

    for (const e of (ledger.entries || [])) {
      if (e.comparable) {
        add(e, TASK_TYPE.REVIEW,
          ['人工复核该条差异', '核对同格同年是否还有未纳入的误差项', '对外引述时保留条目级 canSay/cannotSay 限定'],
          e.footprintIdentity.status === 'UNVERIFIED' ? [e.footprintIdentity.evidenceRequired] : []);
        add(e, TASK_TYPE.MATERIAL,
          ['向数据方索取两年有效像元掩膜或等效足迹依据', '取得后再单独评估能否支持"同一像元"表述'],
          [e.footprintIdentity.evidenceRequired]);
      } else {
        add(e, TASK_TYPE.DATA,
          ['先核查原始数据与口径（' + e.failedGates.join('、') + '）', '在核查完成前，本条不产出差值、不得用于任何表述'],
          []);
      }
    }

    return Array.from(buckets.values()).map(b => {
      b.triggeredByChangeEntryShas.sort();
      const triggers = b.triggeredByChangeEntryShas.map(sha => b.triggerNotes.get(sha));
      const t = {
        schemaVersion: TASKLIST_SCHEMA,
        taskLabel: TASK_LABEL[b.taskType],
        taskType: b.taskType, cellId: b.cellId, era: b.era,
        metric: METRIC, metricUnit: METRIC_UNIT,
        caveats: b.caveats, requiredNext: b.requiredNext, materialNeeds: b.materialNeeds,
        triggeredByChangeEntryShas: b.triggeredByChangeEntryShas,
        triggers,
        count: b.triggeredByChangeEntryShas.length,
        sourceRefSha256: b.sourceRefSha256,
        advisoryNote: '本任务只是把人的注意力指向该条差异；**不改变** registrable 状态、移除类主张计数与 attributionStatus，也不反写为训练真值。',
      };
      t.taskId = taskIdOf(t);
      return t;
    }).sort((x, y) => (x.cellId < y.cellId ? -1 : x.cellId > y.cellId ? 1 : 0) || (x.era - y.era) || (x.taskType < y.taskType ? -1 : x.taskType > y.taskType ? 1 : 0));
  }

                                         
  const taskGroupKeyOf = t => t.cellId + '|' + t.taskType + '|' + t.era + '|' + caveatSig(t.caveats);
                                          
  function expectedTaskPairs(ledger) {
    const set = new Set();
    for (const e of (ledger.entries || [])) {
      for (const tt of expectedTaskTypesFor(e)) set.add(e.entrySha256 + '|' + tt);
    }
    return set;
  }
  const shortSha = s => (typeof s === 'string' && s.length > 30) ? (s.slice(0, 18) + '…' + s.slice(-6)) : String(s);
  const shortenPair = p => { const i = p.lastIndexOf('|'); return shortSha(p.slice(0, i)) + ' × ' + p.slice(i + 1); };

     
                       
                                                   
     
  function buildTaskList(ledger, opts) {
    const o = opts || {};
    const vl = verifyLedger(ledger, o.ledgerOpts || {});
    if (!vl.ok) throw new Error('台账未通过核验，拒绝生成任务：' + vl.errors.join('；'));
    const tasks = deriveTasks(ledger);

    const list = {
      schemaVersion: TASKLIST_SCHEMA,
      generator: GENERATOR, generatorVersion: GENERATOR_VERSION,
      dedupeRule: 'DEDUPE_KEY = (cellId, taskType, era, sorted(caveats))；合并时累计 triggeredByChangeEntryShas 与 count，并为**每个**触发条目保留 triggers[] 中的边界声明对应',
      taskIdRule: 'taskId = sha256(TASK_DOMAIN + canonicalBits(稳定内容))；稳定内容**不含任何时间戳**，含全部触发的 triggerBoundaryNoteShas',
      sourceRefSha256: ledger.sourceRefSha256,
      ledgerSha256: ledger.ledgerSha256,
      tasks,
      counts: {
        tasks: tasks.length,
        byType: tasks.reduce((m, t) => { m[t.taskType] = (m[t.taskType] || 0) + 1; return m; }, {}),
        totalTriggers: tasks.reduce((s, t) => s + t.count, 0),
      },
      redLineRegression: {
        registrable: false, removalCount: 0,
        attributionStatus: 'insufficient_evidence', declarationCategory: 'DESCRIPTIVE_NPP_ONLY',
        claimsLinked: false, evidenceRecordsLinked: false,
        note: '生成任意数量任务后，以上取值**必须不变**。',
      },
      selfDigestNote: SELF_DIGEST_NOTE,
      boundary: clone(BOUNDARY),
    };
    list.taskListSha256 = dig(TASKLIST_DOMAIN, coreOf(list, 'taskListSha256'));
    return list;
  }

     
                             
    
                                                        
                                                        
                                                       
                    
     
  function verifyTaskList(list, opts) {
    const o = opts || {};
    const ledger = o.ledger || null;
    const errors = [];
    let coverage = null;
    try {
      if (!plain(list)) return { ok: false, errors: ['任务清单须为对象'], ledgerBound: false };
      errors.push(...keySetErrors(list, TASKLIST_KEYS, '任务清单'));
      if (list.schemaVersion !== TASKLIST_SCHEMA) errors.push('任务清单版本不符（须 ' + TASKLIST_SCHEMA + '）');
      if (list.generator !== GENERATOR || list.generatorVersion !== GENERATOR_VERSION) errors.push('任务清单生成器登记不符');
      if (list.taskListSha256 !== dig(TASKLIST_DOMAIN, coreOf(list, 'taskListSha256'))) errors.push('任务清单摘要与内容不符');
      if (list.selfDigestNote !== SELF_DIGEST_NOTE) errors.push('任务清单自摘要说明被改写');
      for (const k of Object.keys(BOUNDARY)) {
        if (N.canonical(list.boundary[k]) !== N.canonical(BOUNDARY[k])) errors.push('任务清单边界常量被改写：' + k);
      }
      const rr = list.redLineRegression || {};
      if (rr.registrable !== false || rr.removalCount !== 0 || rr.attributionStatus !== 'insufficient_evidence') errors.push('红线回归字段被改写');
      if (rr.claimsLinked !== false || rr.evidenceRecordsLinked !== false) errors.push('红线回归字段被改写（被串接到主张/记录）');

                                       
      const entryBySha = new Map();
      if (ledger) {
        if (!Array.isArray(ledger.entries)) errors.push('核验任务清单时提供的台账结构不符');
        else ledger.entries.forEach(e => entryBySha.set(e.entrySha256, e));
        if (list.ledgerSha256 !== ledger.ledgerSha256) {
          errors.push('任务清单声明的台账摘要与所附台账不符（错配台账，不是同一份）');
        }
        if (list.sourceRefSha256 !== ledger.sourceRefSha256) errors.push('任务清单与所附台账的来源绑定不一致');
      }

      const seen = new Set();
      (list.tasks || []).forEach((t, i) => {
        const at = 'task#' + i;
        errors.push(...keySetErrors(t, TASK_KEYS, at));
        if (t.schemaVersion !== TASKLIST_SCHEMA) errors.push('任务版本不符：' + at);
        if (t.taskId !== taskIdOf(t)) errors.push('taskId 与稳定内容不符：' + at);
        if (seen.has(t.taskId)) errors.push('taskId 重复（未去重）：' + at);
        seen.add(t.taskId);
        if (!Array.isArray(t.triggeredByChangeEntryShas)) errors.push('触发来源须为数组：' + at);
        else {
          if (t.count !== t.triggeredByChangeEntryShas.length) errors.push('count 与触发来源数不符：' + at);
          const dup = t.triggeredByChangeEntryShas.filter((x, k) => t.triggeredByChangeEntryShas.indexOf(x) !== k);
          if (dup.length) errors.push('触发来源内部重复：' + at + ' ' + dup[0]);
                                                      
          if (!t.triggeredByChangeEntryShas.length) errors.push('任务的触发集合不得为空（每条任务都应由实际条目触发）：' + at);
        }
        if (t.sourceRefSha256 !== list.sourceRefSha256) errors.push('任务来源绑定与清单不一致：' + at);
        if (t.metric !== METRIC || t.metricUnit !== METRIC_UNIT) errors.push('任务指标/单位被改写：' + at);
        if (!Array.isArray(t.requiredNext) || !t.requiredNext.length) errors.push('任务缺 requiredNext：' + at);
        if (!Object.values(TASK_TYPE).includes(t.taskType)) errors.push('任务类型未登记：' + at);
        if (t.taskLabel !== TASK_LABEL[t.taskType]) errors.push('任务标题与类型不符：' + at);

                                                                       
        const shas = Array.isArray(t.triggeredByChangeEntryShas) ? t.triggeredByChangeEntryShas.slice().sort() : [];
        if (!Array.isArray(t.triggers)) errors.push('任务缺 triggers[]（须为每个触发条目保留来源与局限对应）：' + at);
        else {
          t.triggers.forEach((g, k) => errors.push(...keySetErrors(g, TRIGGER_KEYS, at + '.triggers[' + k + ']')));
          const trigShas = t.triggers.map(g => g && g.entrySha256).sort();
          if (!sameSet(trigShas, shas)) errors.push('triggers[] 与 triggeredByChangeEntryShas 不是同一集合：' + at);
          if (t.triggers.length !== shas.length) errors.push('triggers[] 条数与触发来源数不符：' + at);
          if (trigShas.join('\u0000') !== t.triggers.map(g => g && g.entrySha256).join('\u0000')) errors.push('triggers[] 未按 entrySha256 升序声明：' + at);
        }

                               
        if (ledger && Array.isArray(t.triggeredByChangeEntryShas)) {
          t.triggeredByChangeEntryShas.forEach((sha, k) => {
            const e = entryBySha.get(sha);
            if (!e) { errors.push('触发引用解析不到实际条目（悬空引用）：' + at + ' 第' + (k + 1) + '项'); return; }
            if (e.cellId !== t.cellId) errors.push('触发条目与任务的格不符：' + at);
            if (e.era !== t.era) errors.push('触发条目与任务的 era 不符：' + at);
            const wantCaveats = expectedTaskCaveats(e, t.taskType);
            if (caveatSig(t.caveats || []) !== caveatSig(wantCaveats)) {
              errors.push('任务 caveats 与触发条目的局限不对应：' + at);
            }
            if (!expectedTaskTypesFor(e).includes(t.taskType)) {
              errors.push('任务类型与触发条目状态不符：' + at + '（' + t.taskType + '）');
            }
            const g = Array.isArray(t.triggers) ? t.triggers.filter(x => x && x.entrySha256 === sha)[0] : null;
            if (g) {
              if (g.boundaryNoteSha256 !== e.boundaryNoteSha256) errors.push('触发条目边界声明摘要与台账不符：' + at);
              if (g.cellId !== e.cellId || g.era !== e.era) errors.push('触发条目格/era 与台账不符：' + at);
              if (caveatSig(g.caveats || []) !== caveatSig(wantCaveats)) errors.push('触发条目 caveats 与应有局限不符：' + at);
            }
          });
        }
      });
                                                           
      if (ledger && Array.isArray(ledger.entries)) {
        try {
          const expPairs = expectedTaskPairs(ledger);                      
          const expTasks = deriveTasks(ledger);
          const expKeys = expTasks.map(taskGroupKeyOf);
          const spec = Array.isArray(list.tasks) ? list.tasks : [];
          const seenPairIdx = new Map();
          spec.forEach((t, i) => {
            for (const sha of (t && t.triggeredByChangeEntryShas) || []) {
              const k = sha + '|' + t.taskType;
              if (!seenPairIdx.has(k)) seenPairIdx.set(k, []);
              seenPairIdx.get(k).push(i);
            }
          });
          const missing = [], extra = [], duplicate = [];
          for (const k of expPairs) if (!seenPairIdx.has(k)) missing.push(k);
          for (const k of seenPairIdx.keys()) if (!expPairs.has(k)) extra.push(k);
          for (const pair of seenPairIdx) if (pair[1].length > 1) duplicate.push(pair[0]);
          if (missing.length) errors.push('任务覆盖缺失：应有 ' + missing.length + ' 项 (条目, 类型) 未被任何任务触发（例如 ' + shortenPair(missing[0]) + '）');
          if (extra.length) errors.push('出现规则派生集合之外的任务触发（多余项 ' + extra.length + ' 项，例如 ' + shortenPair(extra[0]) + '）');
          if (duplicate.length) errors.push('同一 (条目, 类型) 被多条任务重复覆盖（' + duplicate.length + ' 项，例如 ' + shortenPair(duplicate[0]) + '）');

                                  
          const actualKeys = spec.map(taskGroupKeyOf);
          const missingKey = expKeys.filter(k => actualKeys.indexOf(k) < 0);
          const extraKey = actualKeys.filter(k => expKeys.indexOf(k) < 0);
          const dupKey = actualKeys.filter((k, i) => actualKeys.indexOf(k) !== i);
          if (missingKey.length) errors.push('合并/分组结果不完整：缺少应有的任务分组键 ' + missingKey.length + ' 个（例如 ' + missingKey[0] + '）');
          if (extraKey.length) errors.push('存在规则之外的任务分组键 ' + extraKey.length + ' 个（例如 ' + extraKey[0] + '）');
          if (dupKey.length) errors.push('任务分组键重复：' + dupKey[0]);
          const expByKey = new Map(expTasks.map(t => [taskGroupKeyOf(t), t]));
          spec.forEach((t, i) => {
            const exp = expByKey.get(taskGroupKeyOf(t));
            if (!exp) return;
            const have = Array.isArray(t.triggeredByChangeEntryShas) ? t.triggeredByChangeEntryShas : [];
            if (!sameSet(have, exp.triggeredByChangeEntryShas)) {
              errors.push('任务分组的触发集合与规则派生不符：task#' + i + '（实 ' + have.length + ' 项，应 ' + exp.triggeredByChangeEntryShas.length + ' 项）');
            }
            if (N.canonical(t.triggers || []) !== N.canonical(exp.triggers)) {
              errors.push('任务分组的触发来源/局限对应关系与规则派生不符：task#' + i);
            }
          });

                                                 
          const expCounts = {
            tasks: expTasks.length,
            byType: expTasks.reduce((m, t) => { m[t.taskType] = (m[t.taskType] || 0) + 1; return m; }, {}),
            totalTriggers: expTasks.reduce((s, t) => s + t.count, 0),
          };
          if (plain(list.counts)) {
            if (list.counts.tasks !== expCounts.tasks) errors.push('任务总数与规则派生不符：声明 ' + list.counts.tasks + '，应为 ' + expCounts.tasks);
            if (N.canonical(list.counts.byType) !== N.canonical(expCounts.byType)) errors.push('任务分类计数与规则派生不符');
            if (list.counts.totalTriggers !== expCounts.totalTriggers) errors.push('触发合计与规则派生不符：声明 ' + list.counts.totalTriggers + '，应为 ' + expCounts.totalTriggers);
          }
          let actualTriggers = 0;
          for (const idxs of seenPairIdx.values()) actualTriggers += idxs.length;
          coverage = {
            expectedTasks: expCounts.tasks, actualTasks: spec.length,
            expectedTriggers: expPairs.size, actualTriggers,
            missing: missing.length, extra: extra.length, duplicate: duplicate.length,
            missingGroups: missingKey.length, extraGroups: extraKey.length,
            complete: !(missing.length || extra.length || duplicate.length || missingKey.length || extraKey.length || dupKey.length),
            basis: '由所附台账按既有任务规则推导（可比 ⇒ REVIEW + MATERIAL；不可比 ⇒ DATA），非硬编码',
          };
        } catch (e) { errors.push('任务完整性核验过程异常：' + e.message); }
      }

      const ids = (list.tasks || []).map(t => t.taskId).slice().sort();
      const dupId = ids.filter((x, i) => i > 0 && ids[i - 1] === x);
      if (dupId.length) errors.push('存在重复 taskId');
      if (plain(list.counts)) {
        errors.push(...keySetErrors(list.counts, TASKLIST_COUNT_KEYS, 'counts'));
        if (list.counts.tasks !== (list.tasks || []).length) errors.push('任务计数不符');
        const byType = (list.tasks || []).reduce((m, t) => { m[t.taskType] = (m[t.taskType] || 0) + 1; return m; }, {});
        if (N.canonical(list.counts.byType) !== N.canonical(byType)) errors.push('任务分类计数与实测不符');
        const total = (list.tasks || []).reduce((s, t) => s + (Number.isFinite(t.count) ? t.count : 0), 0);
        if (list.counts.totalTriggers !== total) errors.push('触发合计与实测不符');
      } else errors.push('任务清单缺计数块');
      const timeKeys = findTimeKeys(list);
      if (timeKeys.length) errors.push('任务清单稳定内容不得含时间戳：' + timeKeys.slice(0, 3).join('、'));
                                                
      const hits = N.forbiddenScan(N.canonical({
        dedupeRule: list.dedupeRule, taskIdRule: list.taskIdRule, selfDigestNote: list.selfDigestNote,
        tasks: (list.tasks || []).map(t => ({ taskLabel: t.taskLabel, caveats: t.caveats, requiredNext: t.requiredNext, materialNeeds: t.materialNeeds, advisoryNote: t.advisoryNote })),
      }));
      if (hits.length) errors.push('任务清单含禁止表述：' + hits.join('、'));
    } catch (e) { errors.push('核验过程异常：' + e.message); }
    return {
      ok: !errors.length, errors: Array.from(new Set(errors)),
      ledgerBound: !!(ledger && list.ledgerSha256 === ledger.ledgerSha256),
      triggersResolved: !!ledger,
      taskCoverage: coverage,
    };
  }

  const TIME_KEY_RE = /^(generatedatutc|generatedat|timestamp|createdat|runat|exportedat)$/i;
  function findTimeKeys(value, trail) {
    const hits = [];
    const walk = (v, path) => {
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
      if (!plain(v)) return;
      for (const k of Object.keys(v)) {
        if (TIME_KEY_RE.test(String(k))) hits.push(path + '.' + k);
        walk(v[k], path + '.' + k);
      }
    };
    walk(value, trail || '');
    return hits;
  }

                                                                         
  const stableDigestOf = stable => dig(EXPORT_STABLE_DOMAIN, stable);

     
                                                
                                              
                              
     
  function buildTaskExport(ledger, taskList, opts) {
    const o = opts || {};
    const vl = verifyLedger(ledger, o); if (!vl.ok) throw new Error('台账未通过核验：' + vl.errors.join('；'));
    const vt = verifyTaskList(taskList, { ledger }); if (!vt.ok) {
      const cov = vt.taskCoverage && vt.taskCoverage.complete === false
        ? '任务覆盖不完整（应为 ' + vt.taskCoverage.expectedTriggers + ' 项触发 / ' + vt.taskCoverage.expectedTasks + ' 项任务，实为 ' + vt.taskCoverage.actualTriggers + ' / ' + vt.taskCoverage.actualTasks + '）；'
        : '';
      throw new Error('任务清单未通过核验：' + cov + vt.errors.join('；'));
    }
    if (taskList.sourceRefSha256 !== ledger.sourceRefSha256) throw new Error('任务清单与台账的来源绑定不一致');
    if (taskList.ledgerSha256 !== ledger.ledgerSha256) throw new Error('任务清单声明的台账摘要与所附台账不符（错配台账）');
    const stable = {
      schemaVersion: EXPORT_SCHEMA,
      generator: GENERATOR, generatorVersion: GENERATOR_VERSION,
      boundary: clone(BOUNDARY),
                                                           
                                                    
      sourceRef: clone(ledger.sourceRef), sourceRefSha256: ledger.sourceRefSha256,
      ledger: clone(ledger), taskList: clone(taskList),
      stableNote: '稳定内容：**不含任何运行时间**；同一输入两次生成的 stable 部分应逐字节相同。跨时刻比较请比 stableDigest，不要比文件字节。',
      selfDigestNote: SELF_DIGEST_NOTE,
      scopeNote: '只读导出：不含碳量或信用量、未上链；差异是模型值之差，不是碳汇、不是治理归因。',
    };
    const pack = {
      schemaVersion: EXPORT_SCHEMA,
      stable,
      stableDigest: stableDigestOf(stable),
      event: {
        generatedAtUTC: typeof o.generatedAtUTC === 'string' ? o.generatedAtUTC : new Date().toISOString(),
        generatorVersion: GENERATOR_VERSION,
        note: '运行事件：**仅本对象**含时间戳；文件字节不承诺跨时刻一致。',
      },
      fileNote: '完整导出文件含事件时间戳 ⇒ 不承诺跨时刻字节一致；同一输入跨时刻一致的是 stable 部分与 stableDigest。',
    };
    return pack;
  }

     
                                   
    
          
                                                                              
                                                                      
                                                          
    
                                                               
                                                            
     
  function verifyTaskExport(pack, opts) {
    const o = opts || {};
    const errors = [];
    let pinEvaluation = null;
    let taskCoverage = null;
    try {
      if (!plain(pack)) throw new Error('导出件须为对象');
      errors.push(...keySetErrors(pack, EXPORT_KEYS, '导出件'));
      if (pack.schemaVersion !== EXPORT_SCHEMA) errors.push('导出口径版本不符（须 ' + EXPORT_SCHEMA + '）');
      if (!plain(pack.stable)) errors.push('导出缺 stable 部分');
      else {
        errors.push(...keySetErrors(pack.stable, EXPORT_STABLE_KEYS, '导出件.stable'));
        if (pack.stable.schemaVersion !== EXPORT_SCHEMA) errors.push('stable 版本不符');
        if (pack.stable.generator !== GENERATOR || pack.stable.generatorVersion !== GENERATOR_VERSION) errors.push('导出生成器登记不符');
        if (pack.stable.selfDigestNote !== SELF_DIGEST_NOTE) errors.push('导出自摘要说明被改写');
        for (const k of Object.keys(BOUNDARY)) {
          if (N.canonical(pack.stable.boundary[k]) !== N.canonical(BOUNDARY[k])) errors.push('导出边界常量被改写：' + k);
        }
        const t = findTimeKeys(pack.stable);
        if (t.length) errors.push('stable 部分不得含时间戳：' + t.slice(0, 3).join('、'));
        if (pack.stableDigest !== stableDigestOf(pack.stable)) errors.push('stableDigest 与 stable 内容不符（改了稳定内容但未重签）');
      }
      if (!plain(pack.event) || typeof pack.event.generatedAtUTC !== 'string' || !pack.event.generatedAtUTC) errors.push('导出缺事件时间戳（运行事件必须可追溯）');

      const st = pack.stable;
      const ledger = st && st.ledger, taskList = st && st.taskList;

                                                              
      if (st && plain(st.sourceRef)) {
        const recomputed = sourceRefSha(st.sourceRef);
        if (typeof st.sourceRefSha256 !== 'string' || st.sourceRefSha256 !== recomputed) errors.push('顶层来源绑定摘要与顶层来源块不符（未被独立重算或不一致）');
        if (plain(ledger) && plain(ledger.sourceRef) && N.canonical(st.sourceRef) !== N.canonical(ledger.sourceRef)) {
          errors.push('顶层 sourceRef 与内含台账的 sourceRef 不一致（导入件自报的来源块不得取代台账的来源块）');
        }
        if (plain(ledger) && st.sourceRefSha256 !== ledger.sourceRefSha256) errors.push('顶层来源绑定摘要与内含台账不一致');
        if (plain(taskList) && st.sourceRefSha256 !== taskList.sourceRefSha256) errors.push('顶层来源绑定摘要与内含任务清单不一致');
      } else errors.push('导出缺顶层来源块（sourceRef）');

                                            
      const vl = verifyLedger(ledger, { bundle: o.bundle, pin: o.pin, fileSha256: o.fileSha256 });
      if (!vl.ok) errors.push('导出内台账未通过核验：' + vl.errors.slice(0, 3).join('；'));
      const vt = verifyTaskList(taskList, { ledger });
      taskCoverage = vt.taskCoverage || null;
      if (!vt.ok) errors.push('导出内任务清单未通过核验：' + vt.errors.slice(0, 3).join('；'));
                                                   
      if (vt.taskCoverage && vt.taskCoverage.complete === false) {
        const c = vt.taskCoverage;
        errors.push('任务覆盖缺失：所附台账按既有规则应有 ' + c.expectedTriggers + ' 项 (条目, 类型) 触发、'
          + c.expectedTasks + ' 项任务；实际为 ' + c.actualTriggers + ' 项触发、' + c.actualTasks + ' 项任务'
          + '（缺 ' + c.missing + ' / 多 ' + c.extra + ' / 重复 ' + c.duplicate + ' / 缺分组 ' + c.missingGroups + ' / 多分组 ' + c.extraGroups + '）');
      }
      if (plain(ledger) && plain(taskList) && taskList.ledgerSha256 !== ledger.ledgerSha256) {
        errors.push('任务清单声明的台账摘要与所附台账不符（错配台账）');
      }

                                                
      const sr = (st && plain(st.sourceRef)) ? st.sourceRef : null;
      const declared = sr && plain(sr.publishedPin) ? String(sr.publishedPin.status) : 'UNKNOWN';
      const trusted = !!(o.pin && typeof o.pin === 'object');
      let evaluated = 'NOT_EVALUATED';
      let basis;
      if (trusted && sr) {
        basis = '调用方独立提供的可信 pin';
        const contentMatch = typeof o.pin.bundleContentSha256 === 'string' && o.pin.bundleContentSha256 === sr.bundleContentSha256Recomputed;
        const fileComparable = typeof o.pin.bundleFileSha256 === 'string' && typeof sr.bundleFileSha256 === 'string';
        const fileMatch = fileComparable ? (o.pin.bundleFileSha256 === sr.bundleFileSha256) : null;
        if (!contentMatch) evaluated = 'MISMATCHED';
        else if (fileMatch === true) evaluated = 'MATCHED';
        else if (fileMatch === false) evaluated = 'CONTENT_OK_FILE_DIFFERENT';
        else evaluated = 'CONTENT_ONLY';
        if (evaluated === 'MISMATCHED') errors.push('已发布摘要（pin）独立评估为不符：该件内容与调用方提供的可信 pin 不一致 ⇒ 拒绝');
      } else {
        basis = '调用方未提供独立可信 pin / 无当前已核验来源上下文 ⇒ 本次**未评估**；包内声明不得当作核验结论';
      }
      pinEvaluation = {
        declared, declaredWhere: '包内 stable.sourceRef.publishedPin.status', evaluated, trustedPinProvided: trusted, basis,
        note: trusted ? '本次结论来自调用方独立提供的 pin，而非包内自报。' : '包内自报状态只作**声明转述**；未与任何独立可信 pin 比对。',
      };

      const hits = N.forbiddenScan(N.canonical({ scopeNote: st && st.scopeNote, tasks: taskList ? taskList.tasks : null }));
      if (hits.length) errors.push('导出含禁止表述：' + hits.join('、'));

                                      
      let current = typeof o.currentSourceRefSha256 === 'string' ? o.currentSourceRefSha256 : null;
      if (!current && o.bundle) {
        current = sourceRefSha(buildSourceRef(o.bundle, { pin: o.pin, fileSha256: o.fileSha256 }));
      }
      if (current && st && st.sourceRefSha256 !== current) {
        errors.push('版本过期：该导出所依据的源产物版本已不是当前版本 ⇒ 结论不得静默套用');
      }
    } catch (e) { errors.push('核验过程异常：' + e.message); }
    return {
      ok: !errors.length, errors: Array.from(new Set(errors)),
      provenance: [
        { level: '①', name: '内部重算（条目/台账/任务清单/引用关系/稳定摘要）', status: errors.length ? '未通过' : '通过' },
        {
          level: '②', name: '已发布摘要（pin）',
          status: pinEvaluation
            ? (pinEvaluation.trustedPinProvided ? pinEvaluation.evaluated : 'NOT_EVALUATED（仅包内声明：' + pinEvaluation.declared + '）')
            : 'UNKNOWN',
        },
        { level: '③', name: '源文件逐项复算', status: 'NOT_LOADED（本页不读源 CSV；由 scripts/verify_change_ledger.js 独立复算）' },
      ],
      ledgerBound: !!(pack.stable && pack.stable.ledger && pack.stable.taskList
        && pack.stable.taskList.ledgerSha256 === pack.stable.ledger.ledgerSha256),
      taskCoverage,
      pinEvaluation,
      sourceAuthenticityVerified: false,
      scopeNote: pack && pack.stable ? pack.stable.scopeNote : '',
    };
  }

                                
  function stalenessOf(pack, currentSourceRefSha256) {
    const have = pack && pack.stable ? pack.stable.sourceRefSha256 : null;
    const same = !!have && have === currentSourceRefSha256;
    return {
      same, have, current: currentSourceRefSha256 || null,
      label: same ? '与当前源产物版本一致' : '版本过期：该件依据的源产物版本已不是当前版本，结论不得静默套用',
      note: '“与当前源产物版本一致”只说明**版本相同**；既不代表来源真实，也不代表内容从未被改动。',
    };
  }

  return {
    SCHEMA, ENTRY_SCHEMA, TASKLIST_SCHEMA, EXPORT_SCHEMA, GENERATOR, GENERATOR_VERSION,
    SOURCE_REF_DOMAIN, ENTRY_DOMAIN, BOUNDARY_DOMAIN, LEDGER_DOMAIN, TASK_DOMAIN, TASKLIST_DOMAIN, EXPORT_STABLE_DOMAIN,
    METRIC, METRIC_UNIT, METRIC_LABEL, ERA_BOUNDARY_YEAR, RTOL_NUMERIC, ORDERING,
    LOCATE_PARAMS, parseLocateParams,
    ENTRY_TYPE, TASK_TYPE, TASK_LABEL, BOUNDARY, SELF_DIGEST_NOTE, FOOTPRINT_IDENTITY_NOTE, TREND_FORBIDDEN_KEYS,
    DEFINITION, SCOPE_NOTE, ORDERING_NOTE, LIMITATIONS, GATE_CODES, REFUSAL_REASONS,
    LEDGER_KEYS, SCOPE_KEYS, ENTRY_KEYS, LEDGER_COUNT_KEYS, TASKLIST_KEYS, TASK_KEYS, TRIGGER_KEYS, EXPORT_KEYS, EXPORT_STABLE_KEYS,
    dig, coreOf, keysOf, pairKey, sameSet, keySetErrors, expectedPairKeys, expectedCrossEraKeys, scopeErrors,
    findTrendKeys, findTimeKeys, adjacentPairs,
    buildSourceRef, sourceRefSha, locateRecord, computeEntry, buildLedger, verifyLedger,
    taskStableContent, taskIdOf, caveatsOf, expectedTaskCaveats, expectedTaskTypesFor,
    deriveTasks, expectedTaskPairs, taskGroupKeyOf, buildTaskList, verifyTaskList,
    stableDigestOf, buildTaskExport, verifyTaskExport, stalenessOf,
  };
});
