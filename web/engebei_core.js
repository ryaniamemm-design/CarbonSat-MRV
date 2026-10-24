                                                                                    
  
                                                                            
  
     
                                                      
                                                         
                                                       
                                                                                               
                                              
                                                     
                                                                             
                                                                          
                                                            
                                                     
                                                             
                                                                                      
                                                      
                                                    
                                                                
                                                                     
                                                    
                                           
                                                      
   
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    module.exports = factory(require('./npp_entry_core.js'),
      bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  } else {
    root.EngebeiCore = factory(root.NppEntryCore, bytes => root.ethers.sha256(bytes).slice(2));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (N, sha256Bytes) {
  'use strict';

                                                                              
  const SCHEMA = 'CarbonSat-EngebeiCaseBundle-v1.2';
  const EXPORT_SCHEMA = 'CarbonSat-EngebeiCaseExport-v1.2';
  const PIN_SCHEMA = 'CarbonSat-EngebeiCaseBundlePin-v1.2';
  const GENERATOR = 'web/engebei_core.js';
  const MODULE_VERSION = 'CarbonSat-EngebeiResearchCaseModule-v1.2';

  const BUNDLE_DOMAIN = 'CarbonSat-MRV|engebei-bundle|v3\n';
                                                             
  const WINDOW_DOMAIN = 'CarbonSat-MRV|engebei-window|v1\n';
  const EXPORT_STABLE_DOMAIN = 'CarbonSat-MRV|engebei-export-stable|v3\n';

  const CASE_ID = 'engebei_paper_window_v1';
  const WINDOW_VERSION = 'engebei-research-window-v1';
  const WINDOW_CRS = 'WGS84-geographic';
  const WINDOW_LABEL = '恩格贝相关论文报告范围研究窗口，非官方项目边界，非治理小班边界';
  const WINDOW_STATUTE = 'PAPER_REPORTED_RESEARCH_WINDOW_NOT_PROJECT_BOUNDARY';
  const EXPECTED_YEARS = Array.from({ length: 24 }, (_, i) => 2001 + i);
  const ERA_BOUNDARY_YEAR = 2012;
  const RTOL_NUMERIC = 1e-9;
  const RTOL_SEMANTICS = 'NUMERIC_CONSISTENCY_ONLY';
  const FULL_COVERAGE_RATIO = 0.9999;

  const COMPUTE_STATUS = Object.freeze(['OK', 'FETCH_ERROR', 'AUTH_ERROR', 'PERSISTENT_FAILURE']);
  const COVERAGE_STATUS = Object.freeze(['NO_VALID_PIXELS', 'PARTIAL_COVERAGE', 'FULL_COVERAGE']);
  const FAILED_COVERAGE_STATUS = Object.freeze(['NO_VALID_PIXELS', 'UNKNOWN']);
  const DELIVERY_STATES = Object.freeze(['COMPLETE', 'PARTIAL', 'FAILED']);
  const RECORD_FAILED_NULLS = Object.freeze([
    'prod_tC_yr', 'integral_kgC_yr', 'gridAreaM2', 'gridValidAreaM2', 'validAreaRatio',
    'validPixels', 'nppRawMean', 'nppNegPixels',
  ]);

                                                                          
  const METHOD_AUTHORITY = Object.freeze({
    product: 'MODIS/061/MOD17A3HGF',
    productVersion: 'MOD17A3HGF.v6.1',
    band: 'Npp',
    nppScale: 0.0001,
    maskName: 'engebei_npp_valid_mask',
    crs: 'SR-ORG:6974',
    pixelScaleM: 500,
    prodUnit: 'tC/yr',
    methodVersion: 'CarbonSat-NPP-Production-Integral-Engebei-v0.1',
    integration: 'integral_kgC_yr = Σ_pixels(NPP_scaled × pixelArea) over engebei_npp_valid_mask; prod_tC_yr = integral_kgC_yr/1000',
    validRawRange: [-30000, 32700],
  });

                                                                       
  const DECLARATION_VERSION = 'engebei-boundary-declaration-v1.1';
  const DECL_CAN_SAY = Object.freeze([
    '本窗口是「恩格贝相关论文报告范围研究窗口」，非官方项目边界、非治理小班边界。',
    '在该窗口的**有效产品足迹**上，MOD17 模型给出的**年度 NPP 碳生产量**为 X tC/yr（某年）。',
    '该值为**模型值**；同步给出该年的栅格有效面积与比例。',
  ]);
  const DECL_CANNOT_SAY = Object.freeze([
    '不得声称碳汇、碳增汇、净碳汇、碳储量、碳信用或碳减排。',
    '不得声称治理成效或治理归因，不得比较「谁增汇更多」。',
    '不得声称精度、误差、准确率、检出率或置信区间。',
    '不得声称本窗口等于恩格贝镇、生态示范区或某个治理项目；本窗口不是**项目边界**，也不是治理小班边界。',
    '不得声称整包已上链、已完成外部验证或已完成科学精度验证。',
    '不得对 2012 前后做差分、增长率、整体趋势或「恢复幅度」解释。',
    '不得把面积数值相等读作有效像元位置一致（足迹同一性恒 UNVERIFIED）。',
  ]);
  const DECL_LIMITATIONS = Object.freeze([
    '足迹同一性恒 UNVERIFIED：不读取像元掩膜/影像 ⇒ 不得宣称「同一批像元」或「同一植被的纯强度变化」。',
    '论文自报面积（约 200 km²）与本窗口外接矩形测地面积口径不同，差异保留、标注待核，未自行纠正。',
    '只有「论文报告范围」这一层来源：正式项目/小班矢量**未取得**，无项目权属材料。',
    '2024 年之后无数据；2001 年之前无数据，不得外推或插值。',
    '本案例不链接 9 条碳主张、不接 A2 叶集、不进旧证据包文件集合；registrable 恒 false。',
    '自摘要一致只说明内部一致，不证明来源真实、不证明内容从未被改动。',
  ]);
  const FORBIDDEN_OUTPUTS = Object.freeze([
    '碳汇', '碳增汇', '净碳汇', '碳储量', '碳信用', '碳减排', 'tCO2e', 'tCO₂e',
    '准确率', '精度', '误差', '检出率', '置信区间', 'REMOVAL', '增汇', '上链',
  ]);

                                                                     
                                                                        
                                                                                         
                                                             
                                               
                                                              
  const PROVENANCE_DECLARATION_VERSION = 'engebei-provenance-declaration-v1.2';
  const DECL_CASE_TITLE = '恩格贝研究案例（论文报告范围研究窗口）';
  const DECL_GENERATED_BY = 'scripts/build_engebei_bundle.py';
  const PROVENANCE_KEYS = Object.freeze(['level', 'name', 'status']);
  const DECL_PROVENANCE = Object.freeze([
    Object.freeze({ level: '①', name: '内部重算（记录关系 + 年度合计 + 全表摘要）', status: '由页面/CLI 重算' }),
    Object.freeze({ level: '②', name: '已发布摘要（pin）', status: '见 web/engebei_bundle.pin.json' }),
    Object.freeze({ level: '③', name: '源文件逐项复算（直接读 CSV）', status: '由 scripts/verify_engebei_case.js 独立复算' }),
    Object.freeze({ level: '④', name: '原始来源真实性与科学精度', status: 'NOT_VERIFIED' }),
  ]);

  const ROOT_KEYS = Object.freeze([
    'schemaVersion', 'caseId', 'caseKind', 'caseTitle', 'windowVersion', 'windowSha256', 'window',
    'methodology', 'delivery', 'years', 'records', 'counts', 'boundary', 'sourceRef', 'provenance',
    'selfDigestNote', 'scopeNote', 'generatedBy', 'stableDigest',
  ]);
  const WINDOW_KEYS = Object.freeze([
    'label', 'statute', 'statuteNote', 'boundsWGS84', 'dmsSource', 'dmsConversions', 'areaNote',
    'noOverlapWith34Cells', 'noOverlapEvidence',
  ]);
  const BOUNDS_KEYS = Object.freeze(['W', 'S', 'E', 'N']);
  const AREA_NOTE_KEYS = Object.freeze(['paperReportedKm2', 'windowApproxKm2', 'sameBasis', 'note']);
  const METHOD_KEYS = Object.freeze([
    'product', 'productVersion', 'band', 'nppScale', 'maskName', 'validRawRange', 'crs', 'pixelScaleM',
    'integration', 'prodUnit', 'methodVersion', 'eraBoundaryYear', 'eraNote', 'rtolNumeric', 'rtolSemantics',
  ]);
  const DELIVERY_KEYS = Object.freeze(['state', 'yearsOk', 'yearsFailed', 'totalYears', 'note']);
  const RECORD_KEYS = Object.freeze([
    'year', 'prod_tC_yr', 'integral_kgC_yr', 'geomAreaM2', 'gridAreaM2', 'gridValidAreaM2',
    'validAreaRatio', 'validPixels', 'nppRawMean', 'nppNegPixels', 'computeStatus',
    'validCoverageStatus', 'missing', 'missingReason', 'windowSha256', 'product', 'mask', 'crs',
    'scale', 'method_version',
  ]);
  const COUNT_KEYS = Object.freeze(['years', 'ok', 'coverageFull', 'coveragePartial', 'coverageNone']);
  const BOUNDARY_KEYS = Object.freeze([
    'declarationVersion', 'claimClass', 'attributionStatus', 'registrable', 'removalCount', 'claimsLinked',
    'evidenceRecordsLinked', 'footprintIdentity', 'canSay', 'cannotSay', 'limitations',
    'forbiddenOutputs', 'redLineNote',
  ]);
  const SOURCE_REF_KEYS = Object.freeze([
    'csvPath', 'csvSha256', 'windowSpecPath', 'windowSpecSha256', 'fetchLogPath', 'paperDoi',
    'paperKind', 'paperAccessLevel', 'paperAuthorVersionUrl', 'paperVersionNote',
  ]);
  const EXPORT_STABLE_KEYS = Object.freeze([
    'schemaVersion', 'generator', 'caseId', 'windowSha256', 'bundle', 'stableNote', 'selfDigestNote', 'scopeNote',
  ]);
  const PIN_KEYS = Object.freeze([
    'schemaVersion', 'caseId', 'bundlePath', 'bundleFileSha256', 'stableDigest', 'windowSha256',
    'csvSha256', 'deliveryState', 'generatedAtUTC', 'generator', 'note', 'pinSha256',
  ]);

  const SELF_DIGEST_NOTE = '自摘要一致只说明**内部一致**；要识别"相对某个已发布版本是否被改动"，必须与独立已发布摘要或外部期望值比对。自摘要一致**不等于**来源真实，**也不等于**内容从未被改动。';
  const SCOPE_NOTE = '只读：不含碳量或信用量、未上链；数值是**模型值**，不是碳汇、不是治理归因。';

                                                                             
  const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const fin = v => typeof v === 'number' && Number.isFinite(v);
  const intOf = v => typeof v === 'number' && Number.isInteger(v);
  const strOf = v => typeof v === 'string' && v.length > 0;
  const enc = s => new TextEncoder().encode(s);
  const hashText = s => sha256Bytes(enc(s));

  function bitsOf(n) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, n, false);
    let s = '';
    for (let i = 0; i < 8; i++) s += dv.getUint8(i).toString(16).padStart(2, '0');
    return s;
  }
  const escAscii = s => JSON.stringify(s).replace(/[\u0080-\uffff]/g,
    c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

  function canonicalBits(value) {
    if (value === null) return 'n';
    if (value === true) return 't';
    if (value === false) return 'f';
    if (typeof value === 'string') return escAscii(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('非有限数值不可规范化');
      return '#' + bitsOf(value);
    }
    if (Array.isArray(value)) return '[' + Array.from(value, canonicalBits).join(',') + ']';
    if (plain(value)) {
      return '{' + Object.keys(value).sort().map(k => escAscii(k) + ':' + canonicalBits(value[k])).join(',') + '}';
    }
    throw new Error('不支持的值（缺失字段不能当 null）');
  }

  const dig = (domain, payload) => 'local-sha256:' + hashText(domain + canonicalBits(payload));
  const isDigest = v => typeof v === 'string' && /^local-sha256:[0-9a-f]{64}$/.test(v);
  const isSha256Hex = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

  function keySetErrors(obj, keys, at) {
    const errs = [];
    if (!plain(obj)) { errs.push(at + ' 须为对象'); return errs; }
    const have = Object.keys(obj);
    const missing = keys.filter(k => have.indexOf(k) < 0);
    const extra = have.filter(k => keys.indexOf(k) < 0);
    if (missing.length) errs.push(at + ' 缺字段：' + missing.join('、'));
    if (extra.length) errs.push(at + ' 未知字段：' + extra.join('、'));
    return errs;
  }

                                           
  function windowSha256Of(w) {
    return dig(WINDOW_DOMAIN, {
      caseId: CASE_ID,
      windowVersion: WINDOW_VERSION,
      bounds: [w.boundsWGS84.W, w.boundsWGS84.S, w.boundsWGS84.E, w.boundsWGS84.N],
      crs: WINDOW_CRS,
      label: w.label,
      statute: w.statute,
    });
  }

  const stableDigestOf = bundle => dig(BUNDLE_DOMAIN, (() => {
    const c = {};
    Object.keys(bundle).forEach(k => { if (k !== 'stableDigest') c[k] = bundle[k]; });
    return c;
  })());

  const relDiff = (a, b) => {
    if (!fin(a) || !fin(b)) return Infinity;
    const d = Math.max(Math.abs(a), Math.abs(b));
    return d === 0 ? 0 : Math.abs(a - b) / d;
  };

                                                                        
                                                                  
  function collectStrings(value, out) {
    const acc = out || [];
    if (typeof value === 'string') acc.push(value);
    else if (Array.isArray(value)) value.forEach(v => collectStrings(v, acc));
    else if (plain(value)) Object.keys(value).forEach(k => collectStrings(value[k], acc));
    return acc;
  }

                       
  function forbiddenScan(text) {
    const hits = [];
    FORBIDDEN_OUTPUTS.forEach(w => { if (String(text).indexOf(w) >= 0) hits.push(w); });
    return Array.from(new Set(hits));
  }

  const NEGATION = ['不得', '不能', '不要', '禁止', '不是', '不属于', '非', '无', '未', '没有', '不'];

                                               
  function scanForbiddenText(text) {
    const s = String(text);
    const hits = [];
    FORBIDDEN_OUTPUTS.forEach(w => {
      let from = 0, i;
      while ((i = s.indexOf(w, from)) >= 0) {
        const pre = s.slice(Math.max(0, i - 12), i);
        if (!NEGATION.some(p => pre.indexOf(p) >= 0)) { hits.push(w); break; }
        from = i + w.length;
      }
    });
    return Array.from(new Set(hits));
  }

                                             
  const sentenceNegated = s => NEGATION.some(m => String(s).indexOf(m) >= 0);

                                                    
  function scanDeclarations(sentences) {
    const hits = [];
    (sentences || []).forEach(s => {
      if (sentenceNegated(s)) return;
      forbiddenScan(s).forEach(w => hits.push(w + '@' + String(s).slice(0, 18)));
    });
    return Array.from(new Set(hits));
  }

                                                                              
  function coverageStatusOf(validPixels, ratio) {
    if (validPixels === null || validPixels === undefined || validPixels <= 0) return 'NO_VALID_PIXELS';
    if (!fin(ratio)) return 'PARTIAL_COVERAGE';
    return ratio >= FULL_COVERAGE_RATIO ? 'FULL_COVERAGE' : 'PARTIAL_COVERAGE';
  }

                                                         
  function annualTotals(bundle) {
    const recs = (bundle && bundle.records) || {};
    const years = (bundle && bundle.years) || [];
    const out = {};
    let allOk = years.length > 0;
    years.forEach(y => {
      const r = recs[String(y)];
      if (!r || r.computeStatus !== 'OK' || !fin(r.prod_tC_yr)) allOk = false;
    });
    years.forEach(y => {
      const r = recs[String(y)];
      out[y] = (allOk && r && fin(r.prod_tC_yr)) ? r.prod_tC_yr : null;
    });
    return { ok: allOk, totals: out };
  }

                                                                               
  const eraOf = year => (Number(year) < ERA_BOUNDARY_YEAR ? 1 : 2);

     
                                                
                                     
     
  function deltaRequest(bundle, fromYear, toYear) {
    const from = Number(fromYear), to = Number(toYear);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return { refused: true, reason: 'BAD_YEAR' };
    }
    if (eraOf(from) !== eraOf(to)) {
      return { refused: true, reason: 'CROSS_ERA_REFUSED', note: '跨 2012 不做差分、增长率或趋势（断点成因未证实）。' };
    }
    const recs = (bundle && bundle.records) || {};
    const a = recs[String(from)], b = recs[String(to)];
    if (!a || !b) return { refused: true, reason: 'YEAR_NOT_IN_CASE' };
    if (a.computeStatus !== 'OK' || b.computeStatus !== 'OK') return { refused: true, reason: 'COMPUTE_NOT_OK' };
    if (!fin(a.prod_tC_yr) || !fin(b.prod_tC_yr)) return { refused: true, reason: 'MISSING_VALUE' };
    return { refused: false, from, to, era: eraOf(from), delta_tC_yr: b.prod_tC_yr - a.prod_tC_yr, unit: 'tC/yr' };
  }

                                                                              
  function verifyRecord(r, ys, bundle, errors) {
    const at = 'records[' + ys + ']';
    errors.push.apply(errors, keySetErrors(r, RECORD_KEYS, at));
    if (!plain(r)) return;
    const m = bundle.methodology || {};
    if (Number(r.year) !== Number(ys)) errors.push(at + ' year 与键不符');
    if (COMPUTE_STATUS.indexOf(r.computeStatus) < 0) errors.push(at + ' computeStatus 未登记：' + r.computeStatus);
    if (typeof r.missing !== 'boolean') errors.push(at + ' missing 须为布尔值');
    if (!strOf(r.missingReason)) errors.push(at + ' missingReason 须为非空字符串');
    if (!isDigest(r.windowSha256)) errors.push(at + ' windowSha256 格式非法');
    else if (r.windowSha256 !== bundle.windowSha256) errors.push(at + ' 窗口绑定与数据包不一致');
                                         
    if (typeof r.product !== 'string' || r.product !== m.productVersion) errors.push(at + ' 产品版本与数据包不一致');
    if (typeof r.mask !== 'string' || r.mask !== m.maskName) errors.push(at + ' 掩膜名与数据包不一致');
    if (typeof r.crs !== 'string' || r.crs !== m.crs) errors.push(at + ' 行内投影与数据包方法不符');
    if (r.scale !== m.pixelScaleM) errors.push(at + ' 行内像元尺度与数据包方法不符');
    if (typeof r.method_version !== 'string' || r.method_version !== m.methodVersion) errors.push(at + ' 方法版本与数据包不一致');

    const failed = r.computeStatus !== 'OK';
    if (failed) {
                                          
      RECORD_FAILED_NULLS.forEach(k => {
        if (r[k] !== null) errors.push(at + ' 取数失败却带 ' + k + '（疑补造）');
      });
      if (r.missing !== true) errors.push(at + ' 取数失败须 missing=true');
      if (r.geomAreaM2 !== null && !(fin(r.geomAreaM2) && r.geomAreaM2 > 0)) {
        errors.push(at + ' geomAreaM2 须为 null 或有限正数');
      }
      if (FAILED_COVERAGE_STATUS.indexOf(r.validCoverageStatus) < 0) {
        errors.push(at + ' 取数失败不得声称覆盖状态为 ' + r.validCoverageStatus);
      }
      return;
    }

              
    if (COVERAGE_STATUS.indexOf(r.validCoverageStatus) < 0) {
      errors.push(at + ' validCoverageStatus 未登记：' + r.validCoverageStatus);
    }
    if (r.missing === true) {
                         
      if (r.prod_tC_yr !== null || r.integral_kgC_yr !== null) errors.push(at + ' missing=true 却保留数值');
      if (!(r.validPixels === null || r.validPixels === 0)) errors.push(at + ' missing=true 须 validPixels 为 null 或 0');
      if (r.validCoverageStatus !== 'NO_VALID_PIXELS') errors.push(at + ' missing=true 须为 NO_VALID_PIXELS');
      if (r.gridValidAreaM2 !== null && !(fin(r.gridValidAreaM2) && r.gridValidAreaM2 === 0)) {
        errors.push(at + ' missing=true 时有效面积须为 null 或 0');
      }
      if (r.validAreaRatio !== null && !(fin(r.validAreaRatio) && r.validAreaRatio === 0)) {
        errors.push(at + ' missing=true 时有效面积比例须为 null 或 0');
      }
      return;
    }

                                                     
    if (!fin(r.prod_tC_yr)) errors.push(at + ' prod_tC_yr 须为有限数值');
    if (!fin(r.integral_kgC_yr)) errors.push(at + ' integral_kgC_yr 须为有限数值');
    if (fin(r.prod_tC_yr) && fin(r.integral_kgC_yr)
      && relDiff(r.prod_tC_yr, r.integral_kgC_yr / 1000) > RTOL_NUMERIC) {
      errors.push(at + ' 单位链不一致（prod_tC_yr ≠ integral_kgC_yr/1000）');
    }
    if (!(fin(r.geomAreaM2) && r.geomAreaM2 > 0)) errors.push(at + ' geomAreaM2 须为有限正数');
    if (!(fin(r.gridAreaM2) && r.gridAreaM2 > 0)) errors.push(at + ' gridAreaM2 须为有限正数');
    if (!(fin(r.gridValidAreaM2) && r.gridValidAreaM2 > 0)) errors.push(at + ' gridValidAreaM2 须为有限正数');
    if (fin(r.gridValidAreaM2) && fin(r.gridAreaM2) && r.gridValidAreaM2 > r.gridAreaM2 * (1 + RTOL_NUMERIC)) {
      errors.push(at + ' gridValidAreaM2 > gridAreaM2');
    }
    if (!(intOf(r.validPixels) && r.validPixels > 0)) errors.push(at + ' validPixels 须为正整数');
    if (!(fin(r.nppRawMean))) errors.push(at + ' nppRawMean 须为有限数值');
    if (!(intOf(r.nppNegPixels) && r.nppNegPixels >= 0)) errors.push(at + ' nppNegPixels 须为非负整数');
    if (intOf(r.nppNegPixels) && intOf(r.validPixels) && r.nppNegPixels > r.validPixels) {
      errors.push(at + ' nppNegPixels > validPixels（统计口径错误）');
    }
    if (!(fin(r.validAreaRatio) && r.validAreaRatio > 0 && r.validAreaRatio <= 1)) {
      errors.push(at + ' validAreaRatio 须为有限且 (0, 1] 内');
    }
                                   
    if (fin(r.gridValidAreaM2) && fin(r.gridAreaM2) && r.gridAreaM2 > 0 && fin(r.validAreaRatio)) {
      const ratioRec = r.gridValidAreaM2 / r.gridAreaM2;
      if (relDiff(r.validAreaRatio, ratioRec) > RTOL_NUMERIC) {
        errors.push(at + ' 有效面积比例与面积不符（重算 ' + ratioRec + ' ≠ 声明 ' + r.validAreaRatio + '）');
      }
    }
                              
    if (fin(r.gridValidAreaM2) && r.gridValidAreaM2 <= 0 && fin(r.prod_tC_yr)) {
      errors.push(at + ' 有效面积为 0 却输出生产量');
    }
    const cov = coverageStatusOf(r.validPixels, r.validAreaRatio);
    if (cov !== r.validCoverageStatus) {
      errors.push(at + ' 覆盖状态与有效像元/比例不符（应 ' + cov + '，实 ' + r.validCoverageStatus + '）');
    }
  }

                                                                             
  function verifyBoundary(bd, errors) {
    errors.push.apply(errors, keySetErrors(bd, BOUNDARY_KEYS, 'boundary'));
    if (!plain(bd)) return;
    if (bd.declarationVersion !== DECLARATION_VERSION) {
      errors.push('边界固定声明版本不符（须 ' + DECLARATION_VERSION + '）');
    }
    if (bd.claimClass !== 'DESCRIPTIVE_NPP_ONLY') errors.push('claimClass 被改写');
    if (bd.attributionStatus !== 'insufficient_evidence') errors.push('attributionStatus 被改写');
    if (bd.registrable !== false) errors.push('registrable 必须恒 false');
    if (bd.removalCount !== 0) errors.push('removalCount 必须恒 0');
    if (bd.claimsLinked !== false || bd.evidenceRecordsLinked !== false) errors.push('不得链接 9 条主张或证据记录');
    if (bd.footprintIdentity !== 'UNVERIFIED') errors.push('footprintIdentity 必须恒 UNVERIFIED');
    if (!strOf(bd.redLineNote)) errors.push('redLineNote 须为非空字符串');

                                
    const exact = (name, actual, expected) => {
      if (!Array.isArray(actual)) { errors.push(name + ' 须为数组'); return false; }
      if (canonicalBits(actual) !== canonicalBits(expected)) {
        errors.push(name + ' 与固定声明不符（版本化固定声明必须逐条逐字相等，不得删减/替换）');
        return false;
      }
      return true;
    };
    exact('canSay', bd.canSay, DECL_CAN_SAY);
    exact('cannotSay', bd.cannotSay, DECL_CANNOT_SAY);
    exact('limitations', bd.limitations, DECL_LIMITATIONS);
    exact('forbiddenOutputs', bd.forbiddenOutputs, FORBIDDEN_OUTPUTS);

                                           
    const hits = scanDeclarations([].concat(
      Array.isArray(bd.canSay) ? bd.canSay : [],
      Array.isArray(bd.cannotSay) ? bd.cannotSay : [],
      Array.isArray(bd.limitations) ? bd.limitations : [],
    ));
    if (hits.length) errors.push('边界声明含正向禁述表述（非限述句）：' + hits.slice(0, 4).join('、'));
  }

                                                                           
  function verifySelfDescription(bundle, errors) {
    if (bundle.caseTitle !== DECL_CASE_TITLE) {
      errors.push('caseTitle 与固定声明不符（案例标题不得改写）');
    }
    if (bundle.generatedBy !== DECL_GENERATED_BY) {
      errors.push('generatedBy 与固定声明不符（须为 ' + DECL_GENERATED_BY + '）');
    }
    if (bundle.selfDigestNote !== SELF_DIGEST_NOTE) {
      errors.push('selfDigestNote 与固定声明不符（自述不得改写为「已外部核验 / 来源已核验」）');
    }
    if (bundle.scopeNote !== SCOPE_NOTE) {
      errors.push('scopeNote 与固定声明不符（自述不得改写为「已上链 / 已复核 / 含信用量」）');
    }
    if (!Array.isArray(bundle.provenance)) {
      errors.push('provenance 须为数组');
      return;
    }
    if (bundle.provenance.length !== DECL_PROVENANCE.length) {
      errors.push('provenance 层数不符（须 ' + DECL_PROVENANCE.length + ' 层四层来源证明）');
      return;
    }
    bundle.provenance.forEach(function (p, i) {
      errors.push.apply(errors, keySetErrors(p, PROVENANCE_KEYS, 'provenance[' + i + ']'));
      if (canonicalBits(p) !== canonicalBits(DECL_PROVENANCE[i])) {
        errors.push('provenance[' + i + '] 与固定声明不符（自述层状态不得改写；④ 原始来源真实性恒 NOT_VERIFIED）');
      }
    });
  }

                                                                               
  function evaluatePin(bundle, pin, fileSha256, errors) {
    const out = {
      evaluated: 'NOT_EVALUATED', declared: pin ? 'CALLER_SUPPLIED_PIN' : 'NO_INDEPENDENT_PIN',
      contentMatch: null, fileBytesMatch: null, reason: 'NO_INDEPENDENT_PIN',
    };
    if (!plain(pin)) { out.reason = 'NO_INDEPENDENT_PIN'; return out; }

                   
    const keyErrs = keySetErrors(pin, PIN_KEYS, 'pin');
    if (keyErrs.length) {
      errors.push.apply(errors, keyErrs);
      out.reason = 'PIN_MALFORMED';
      return out;
    }
    if (pin.schemaVersion !== PIN_SCHEMA) {
      errors.push('独立 pin 版本不符（期望 ' + PIN_SCHEMA + '）');
      out.reason = 'PIN_MALFORMED';
      return out;
    }
                
    const fmtErrs = [];
    if (!isDigest(pin.stableDigest)) fmtErrs.push('独立 pin 缺 stableDigest 或格式非法');
    if (!isDigest(pin.windowSha256)) fmtErrs.push('独立 pin 的 windowSha256 格式非法');
    if (!isDigest(pin.pinSha256)) fmtErrs.push('独立 pin 的 pinSha256 格式非法');
    if (!isSha256Hex(pin.bundleFileSha256)) fmtErrs.push('独立 pin 的 bundleFileSha256 格式非法');
    if (!isSha256Hex(pin.csvSha256)) fmtErrs.push('独立 pin 的 csvSha256 格式非法');
    if (fmtErrs.length) {
      errors.push.apply(errors, fmtErrs);
      out.reason = 'PIN_INCOMPLETE_DIGESTS';
      return out;
    }
              
    const mismatch = [];
    if (pin.caseId !== bundle.caseId || pin.caseId !== CASE_ID) mismatch.push('独立 pin 的 caseId 与本次案例不符');
    if (pin.windowSha256 !== bundle.windowSha256) mismatch.push('独立 pin 的 windowSha256 与本次窗口不符');
    if (pin.csvSha256 !== (bundle.sourceRef || {}).csvSha256) mismatch.push('独立 pin 的 csvSha256 与本次源 CSV 摘要不符');
    if (pin.deliveryState !== (bundle.delivery || {}).state) mismatch.push('独立 pin 的 deliveryState 与本次交付状态不符');
    if (pin.stableDigest !== bundle.stableDigest) mismatch.push('独立 pin 的 stableDigest 与本次重算不符');

                                                      
    out.contentMatch = mismatch.length === 0;
    out.fileBytesMatch = (isSha256Hex(pin.bundleFileSha256) && typeof fileSha256 === 'string' && fileSha256)
      ? (pin.bundleFileSha256 === fileSha256) : null;
    if (mismatch.length) {
      errors.push.apply(errors, mismatch);
      out.evaluated = 'MISMATCHED';
      out.reason = 'MISMATCHED_TRUSTED_PIN_IDENTITY';
      return out;
    }
    if (out.fileBytesMatch === false) {
      errors.push('独立 pin 的 bundleFileSha256 与本次文件字节不符');
      out.evaluated = 'MISMATCHED';
      out.reason = 'MISMATCHED_BUNDLE_FILE_BYTES';
      return out;
    }
    out.evaluated = 'MATCHED';
    out.reason = 'MATCHED_WITH_INDEPENDENT_PIN';
    return out;
  }

  const pinStatusText = pe => {
    if (!pe) return 'NOT_EVALUATED';
    if (pe.evaluated === 'MATCHED') {
      return pe.fileBytesMatch === true
        ? 'MATCHED（内容 + 文件字节）'
        : 'MATCHED（内容；文件字节未比对）';
    }
    if (pe.evaluated === 'MISMATCHED') return 'MISMATCHED（' + pe.reason + '）';
    return 'NOT_EVALUATED（未评估：' + pe.reason + '）';
  };

                                                                             
  function verifyBundle(bundle, opts) {
    const o = opts || {};
    const errors = [];
    let checkedYears = 0;
    let pinEvaluation = { evaluated: 'NOT_EVALUATED', declared: 'NO_INDEPENDENT_PIN', contentMatch: null, fileBytesMatch: null, reason: 'NO_INDEPENDENT_PIN' };

    try {
      if (!plain(bundle)) return { ok: false, errors: ['数据包须为对象'] };
      errors.push.apply(errors, keySetErrors(bundle, ROOT_KEYS, 'bundle'));

      if (bundle.schemaVersion !== SCHEMA) errors.push('数据包版本不符（期望 ' + SCHEMA + '）');
      if (bundle.caseId !== CASE_ID) errors.push('案例 ID 不符');
      if (bundle.caseKind !== 'PUBLIC_LITERATURE_RESEARCH_CASE') errors.push('案例类型不符');
      if (bundle.windowVersion !== WINDOW_VERSION) errors.push('窗口版本不符');

                                               
      errors.push.apply(errors, keySetErrors(bundle.window, WINDOW_KEYS, 'window'));
      if (plain(bundle.window)) {
        const w = bundle.window;
        errors.push.apply(errors, keySetErrors(w.boundsWGS84, BOUNDS_KEYS, 'window.boundsWGS84'));
        errors.push.apply(errors, keySetErrors(w.areaNote, AREA_NOTE_KEYS, 'window.areaNote'));
        if (w.label !== WINDOW_LABEL) errors.push('窗口标注被改写（必须逐字为契约标注）');
        if (w.statute !== WINDOW_STATUTE) errors.push('窗口性质声明被改写');
        if (!/非官方项目边界/.test(String(w.label)) || !/非治理小班边界/.test(String(w.label))) {
          errors.push('窗口标注必须同时写明「非官方项目边界」与「非治理小班边界」');
        }
        const b = w.boundsWGS84;
        if (plain(b)) {
          const W = b.W, S = b.S, E = b.E, Nn = b.N;
          if (!(fin(W) && fin(S) && fin(E) && fin(Nn))) errors.push('窗口边界须为有限数值');
          else {
            if (!(W < E)) errors.push('窗口经度未闭合或顺序颠倒（须 W < E）');
            if (!(S < Nn)) errors.push('窗口纬度未闭合或顺序颠倒（须 S < N）');
            if (W < -180 || E > 180) errors.push('窗口经度越界');
            if (S < -90 || Nn > 90) errors.push('窗口纬度越界');
          }
          const recomputed = windowSha256Of(w);
          if (recomputed !== bundle.windowSha256) {
            errors.push('窗口哈希与窗口定义不符（改了范围却保留旧来源绑定）');
          }
        }
      }
      if (!isDigest(bundle.windowSha256)) errors.push('windowSha256 格式非法');

                                        
      errors.push.apply(errors, keySetErrors(bundle.methodology, METHOD_KEYS, 'methodology'));
      if (plain(bundle.methodology)) {
        const m = bundle.methodology;
        const authErr = (k, label) => {
          if (canonicalBits(m[k]) !== canonicalBits(METHOD_AUTHORITY[k])) {
            errors.push('方法学 ' + (label || k) + ' 与权威常量不符');
          }
        };
        authErr('product', 'product');
        authErr('productVersion', 'productVersion');
        authErr('band', 'band');
        authErr('nppScale', 'nppScale');
        authErr('maskName', 'maskName');
        authErr('validRawRange', 'validRawRange');
        authErr('crs', 'crs');
        authErr('pixelScaleM', 'pixelScaleM');
        authErr('integration', 'integration');
        authErr('prodUnit', 'prodUnit');
        authErr('methodVersion', 'methodVersion');
        if (m.eraBoundaryYear !== ERA_BOUNDARY_YEAR) errors.push('era 断点被改写');
        if (m.rtolSemantics !== RTOL_SEMANTICS) errors.push('容差语义被改写（须 NUMERIC_CONSISTENCY_ONLY）');
        if (!strOf(m.eraNote)) errors.push('eraNote 须为非空字符串');
      }

                         
      if (!Array.isArray(bundle.years)) errors.push('years 须为数组');
      else {
        const ys = bundle.years;
        const dup = ys.filter((y, i) => ys.indexOf(y) !== i);
        if (dup.length) errors.push('年份重复：' + dup[0]);
        if (ys.some(y => !intOf(y))) errors.push('years 须为整数数组');
        const exp = EXPECTED_YEARS.join(',');
        if (ys.slice().sort((a, b) => a - b).join(',') !== exp) {
          errors.push('年份集合不等于 2001–2024（24 年，须逐年记录，缺年不得省略）');
        }
      }
      if (!plain(bundle.records)) errors.push('records 须为对象');
      else {
        const keys = Object.keys(bundle.records);
        const years = (bundle.years || []).map(String);
        const missRec = years.filter(y => keys.indexOf(y) < 0);
        const extraRec = keys.filter(k => years.indexOf(k) < 0);
        if (missRec.length) errors.push('记录缺年：' + missRec.join('、'));
        if (extraRec.length) errors.push('记录含 years 之外的年份：' + extraRec.join('、'));
        years.forEach(ys => {
          checkedYears++;
          verifyRecord(bundle.records[ys], ys, bundle, errors);
        });
      }

                            
      if (plain(bundle.counts)) {
        errors.push.apply(errors, keySetErrors(bundle.counts, COUNT_KEYS, 'counts'));
        const rs = Object.values(bundle.records || {});
        const actual = {
          years: (bundle.years || []).length,
          ok: rs.filter(r => r.computeStatus === 'OK').length,
          coverageFull: rs.filter(r => r.validCoverageStatus === 'FULL_COVERAGE').length,
          coveragePartial: rs.filter(r => r.validCoverageStatus === 'PARTIAL_COVERAGE').length,
          coverageNone: rs.filter(r => r.validCoverageStatus === 'NO_VALID_PIXELS').length,
        };
        Object.keys(actual).forEach(k => {
          if (bundle.counts[k] !== actual[k]) errors.push('counts.' + k + ' 与实测不符（应 ' + actual[k] + '，实 ' + bundle.counts[k] + '）');
        });
      }

                                        
      errors.push.apply(errors, keySetErrors(bundle.delivery, DELIVERY_KEYS, 'delivery'));
      if (plain(bundle.delivery) && plain(bundle.records)) {
        const rs = Object.values(bundle.records);
        const okN = rs.filter(r => r.computeStatus === 'OK').length;
        const expected = okN === rs.length && rs.length > 0 ? 'COMPLETE' : (okN > 0 ? 'PARTIAL' : 'FAILED');
        if (DELIVERY_STATES.indexOf(bundle.delivery.state) < 0) errors.push('delivery.state 未登记');
        else if (bundle.delivery.state !== expected) {
          errors.push('delivery.state 与记录不符（应 ' + expected + '，实 ' + bundle.delivery.state + '）');
        }
        const rebuildYears = flag => Object.keys(bundle.records)
          .map(Number).sort((a, b) => a - b)
          .filter(y => (bundle.records[String(y)].computeStatus === 'OK') === flag);
        const okYears = rebuildYears(true), failedYears = rebuildYears(false);
        const dOk = bundle.delivery.yearsOk, dFail = bundle.delivery.yearsFailed;
        if (!Array.isArray(dOk) || dOk.some(y => !intOf(y))) errors.push('delivery.yearsOk 须为整数数组');
        else if (canonicalBits(dOk) !== canonicalBits(okYears)) {
          errors.push('delivery.yearsOk 与记录重建不符（应 [' + okYears.join(',') + ']）');
        }
        if (!Array.isArray(dFail) || dFail.some(y => !intOf(y))) errors.push('delivery.yearsFailed 须为整数数组');
        else if (canonicalBits(dFail) !== canonicalBits(failedYears)) {
          errors.push('delivery.yearsFailed 与记录重建不符（应 [' + failedYears.join(',') + ']）');
        }
        if (bundle.delivery.totalYears !== rs.length) {
          errors.push('delivery.totalYears 与记录数不符（应 ' + rs.length + '）');
        }
        if (!strOf(bundle.delivery.note)) errors.push('delivery.note 须为非空字符串');
      }

                                                 
      verifyBoundary(bundle.boundary, errors);

                                               
      verifySelfDescription(bundle, errors);

                        
      errors.push.apply(errors, keySetErrors(bundle.sourceRef, SOURCE_REF_KEYS, 'sourceRef'));
      if (plain(bundle.sourceRef)) {
        const s = bundle.sourceRef;
        if (!isSha256Hex(s.csvSha256)) errors.push('sourceRef.csvSha256 格式非法');
        if (!isSha256Hex(s.windowSpecSha256)) errors.push('sourceRef.windowSpecSha256 格式非法');
        if (!strOf(s.paperDoi)) errors.push('sourceRef.paperDoi 须为非空字符串');
        if (!strOf(s.paperKind)) errors.push('sourceRef.paperKind 须为非空字符串');
        if (!strOf(s.paperAccessLevel)) errors.push('sourceRef.paperAccessLevel 须为非空字符串');
        if (!strOf(s.paperAuthorVersionUrl)) errors.push('sourceRef.paperAuthorVersionUrl 须为非空字符串（作者接受稿来源）');
        if (!strOf(s.paperVersionNote)) errors.push('sourceRef.paperVersionNote 须为非空字符串（区分作者接受稿与出版定稿）');
        if (o.expectedCsvSha256 && s.csvSha256 !== o.expectedCsvSha256) {
          errors.push('源 CSV 摘要与独立期望值不符（数据已变）');
        }
        if (o.expectedWindowSpecSha256 && s.windowSpecSha256 !== o.expectedWindowSpecSha256) {
          errors.push('窗口规格摘要与独立期望值不符（范围来源已变）');
        }
      }

                       
      if (bundle.stableDigest !== stableDigestOf(bundle)) {
        errors.push('数据包摘要与内容不符（改了内容但未重签）');
      }

                                                       
      const dynStrings = []
        .concat(collectStrings({
          caseTitle: bundle.caseTitle,
          selfDigestNote: bundle.selfDigestNote,
          scopeNote: bundle.scopeNote,
          windowLabel: (bundle.window || {}).label,
          statuteNote: (bundle.window || {}).statuteNote,
          areaNote: (bundle.window || {}).areaNote,
          eraNote: (bundle.methodology || {}).eraNote,
          integration: (bundle.methodology || {}).integration,
        }));
      const dynHits = Array.from(new Set(dynStrings.reduce((acc, s) => acc.concat(scanForbiddenText(s)), [])));
      if (dynHits.length) errors.push('数据包动态文本含禁止表述（非限述语境）：' + dynHits.join('、'));

                           
      pinEvaluation = evaluatePin(bundle, o.pin, o.fileSha256, errors);
    } catch (e) {
      errors.push(e.message);
    }

    const uniqErrors = Array.from(new Set(errors));
    return {
      ok: !uniqErrors.length,
      errors: uniqErrors,
      checkedYears,
      windowSha256Recomputed: (() => {
        try { return windowSha256Of(bundle.window); } catch (e) { return null; }
      })(),
      stableDigestRecomputed: (() => {
        try { return stableDigestOf(bundle); } catch (e) { return null; }
      })(),
      pinEvaluation,
      pinStatus: pinStatusText(pinEvaluation),
      provenance: [
        { level: '①', name: '内部重算（按状态字段关系 + 面积比例复算 + 方法逐项 + 交付年份重建 + 全表摘要）', status: uniqErrors.length ? '未通过' : '通过' },
        { level: '②', name: '已发布摘要（pin）', status: pinStatusText(pinEvaluation) },
        { level: '③', name: '源文件逐项复算（直接读 CSV）', status: 'NOT_LOADED（本页不读源 CSV；由 scripts/verify_engebei_case.js 独立复算）' },
        { level: '④', name: '原始来源真实性与科学精度', status: 'NOT_VERIFIED' },
      ],
      sourceAuthenticityVerified: false,
    };
  }

                                                                                      
  const stableDigestOf2 = stable => dig(EXPORT_STABLE_DOMAIN, (() => {
    const c = {};
    Object.keys(stable).forEach(k => { c[k] = stable[k]; });
    return c;
  })());

  function buildExport(bundle, opts) {
    const o = opts || {};
    const v = verifyBundle(bundle);
    if (!v.ok) throw new Error('数据包未通过核验，拒绝导出：' + v.errors.join('；'));
    const stable = {
      schemaVersion: EXPORT_SCHEMA,
      generator: GENERATOR,
      caseId: bundle.caseId,
      windowSha256: bundle.windowSha256,
      bundle: JSON.parse(JSON.stringify(bundle)),
      stableNote: '稳定内容：**不含任何运行时间**；同一输入两次生成的 stable 部分应逐字节相同。跨时刻比较请比 stableDigest，不要比文件字节。',
      selfDigestNote: SELF_DIGEST_NOTE,
      scopeNote: SCOPE_NOTE,
    };
    return {
      schemaVersion: EXPORT_SCHEMA,
      stable,
      stableDigest: stableDigestOf2(stable),
      event: {
        generatedAtUTC: typeof o.generatedAtUTC === 'string' ? o.generatedAtUTC : new Date().toISOString(),
        generatorVersion: MODULE_VERSION,
        note: '运行事件：**仅本对象**含时间戳；文件字节不承诺跨时刻一致。',
      },
      fileNote: '完整导出文件含事件时间戳 ⇒ 不承诺跨时刻字节一致；跨时刻一致的是 stable 部分与 stableDigest。',
    };
  }

  function findTimeKeys(value, trail) {
    const out = [];
    const at = trail || '';
    if (Array.isArray(value)) {
      value.forEach((v, i) => out.push.apply(out, findTimeKeys(v, at + '[' + i + ']')));
    } else if (plain(value)) {
      Object.keys(value).forEach(k => {
        const t = at + '.' + k;
        if (/time|date|timestamp|generatedat/i.test(k)) out.push(t);
        out.push.apply(out, findTimeKeys(value[k], t));
      });
    }
    return out;
  }

                                                                       
  const normContext = current => (typeof current === 'string')
    ? { windowSha256: current } : (plain(current) ? current : {});

  function verifyExport(pack, opts) {
    const o = opts || {};
    const errors = [];
    try {
      if (!plain(pack)) throw new Error('导出件须为对象');
      if (pack.schemaVersion !== EXPORT_SCHEMA) errors.push('导出口径版本不符');
      if (!plain(pack.stable)) errors.push('导出缺 stable 部分');
      else {
        errors.push.apply(errors, keySetErrors(pack.stable, EXPORT_STABLE_KEYS, 'stable'));
        const t = findTimeKeys(pack.stable, 'stable');
        if (t.length) errors.push('stable 部分不得含时间戳：' + t.slice(0, 3).join('、'));
        if (pack.stableDigest !== stableDigestOf2(pack.stable)) {
          errors.push('stableDigest 与 stable 内容不符（改了稳定内容但未重签）');
        }
                                          
        const inner = pack.stable.bundle;
        if (pack.stable.schemaVersion !== EXPORT_SCHEMA) errors.push('stable.schemaVersion 与导出口径版本不符');
        if (!plain(inner)) errors.push('导出缺内含 bundle');
        else {
          if (pack.stable.caseId !== inner.caseId) errors.push('导出外层 caseId 与内含数据包不符');
          if (pack.stable.windowSha256 !== inner.windowSha256) errors.push('导出外层 windowSha256 与内含数据包不符');
        }
        const v = verifyBundle(inner, o.bundleOpts || {});
        if (!v.ok) errors.push('导出内数据包未通过核验：' + v.errors.slice(0, 2).join('；'));
      }
      if (!plain(pack.event) || typeof pack.event.generatedAtUTC !== 'string' || !pack.event.generatedAtUTC) {
        errors.push('导出缺事件时间戳（运行事件必须可追溯）');
      }
                                                     
      const cur = normContext(o.currentBinding || o.currentWindowSha256);
      const inner = pack.stable && pack.stable.bundle;
      if (cur.windowSha256 && plain(inner)) {
        if (inner.windowSha256 !== cur.windowSha256) {
          errors.push('版本过期：该导出内含窗口不是当前窗口 ⇒ 结论不得静默套用');
        }
      }
      if (cur.csvSha256 && plain(inner)) {
        const innerCsv = inner.sourceRef && inner.sourceRef.csvSha256;
        if (innerCsv !== cur.csvSha256) {
          errors.push('版本过期：该导出所依据的源 CSV 已不是当前版本 ⇒ 结论不得静默套用');
        }
      }
      if (cur.stableDigest && plain(inner) && inner.stableDigest !== cur.stableDigest) {
        errors.push('版本过期：该导出内含内容摘要已不是当前版本');
      }
    } catch (e) { errors.push(e.message); }
    return { ok: !errors.length, errors: Array.from(new Set(errors)) };
  }

                                                  
  function stalenessOf(pack, current) {
    const cur = normContext(current);
    const inner = pack && pack.stable ? pack.stable.bundle : null;
    const outer = pack && pack.stable ? pack.stable.windowSha256 : null;
    if (!plain(inner)) {
      return { same: false, windowSame: null, sourceSame: null, outerMatchesInner: null, label: outer, note: '导出缺内含数据包，无法判定。' };
    }
    const outerMatchesInner = (outer === inner.windowSha256);
    const windowSame = cur.windowSha256 ? (inner.windowSha256 === cur.windowSha256) : null;
    const sourceSame = cur.csvSha256 ? ((inner.sourceRef || {}).csvSha256 === cur.csvSha256) : null;
    const contentSame = cur.stableDigest ? (inner.stableDigest === cur.stableDigest) : null;
    const same = outerMatchesInner
      && (windowSame === null || windowSame === true)
      && (sourceSame === null || sourceSame === true)
      && (contentSame === null || contentSame === true);
    const notes = [];
    notes.push(windowSame === null ? '未提供当前窗口摘要。' : (windowSame ? '窗口与本机当前一致。' : '窗口与本机当前不一致 ⇒ 已过期。'));
    if (sourceSame === false) notes.push('**同一窗口但源产物版本不同**（源 CSV 摘要不一致）——不得称为「同一来源产物版本」。');
    else if (sourceSame === true) notes.push('源 CSV 摘要与当前一致。');
    return {
      same, windowSame, sourceSame, contentSame, outerMatchesInner,
      label: inner.windowSha256,
      note: notes.join(' '),
    };
  }

  return {
    SCHEMA, EXPORT_SCHEMA, PIN_SCHEMA, MODULE_VERSION, GENERATOR, DECLARATION_VERSION,
    PROVENANCE_DECLARATION_VERSION, DECL_CASE_TITLE, DECL_GENERATED_BY, PROVENANCE_KEYS, DECL_PROVENANCE,
    BUNDLE_DOMAIN, WINDOW_DOMAIN, EXPORT_STABLE_DOMAIN,
    CASE_ID, WINDOW_VERSION, WINDOW_LABEL, WINDOW_STATUTE, WINDOW_CRS,
    EXPECTED_YEARS, ERA_BOUNDARY_YEAR, RTOL_NUMERIC, RTOL_SEMANTICS, FULL_COVERAGE_RATIO,
    COMPUTE_STATUS, COVERAGE_STATUS, FAILED_COVERAGE_STATUS, DELIVERY_STATES, RECORD_FAILED_NULLS,
    METHOD_AUTHORITY, DECL_CAN_SAY, DECL_CANNOT_SAY, DECL_LIMITATIONS,
    FORBIDDEN_OUTPUTS, ROOT_KEYS, BOUNDARY_KEYS, SOURCE_REF_KEYS, EXPORT_STABLE_KEYS, PIN_KEYS,
    SELF_DIGEST_NOTE, SCOPE_NOTE,
    canonicalBits, dig, isDigest, isSha256Hex, keySetErrors, stableDigestOf, stableDigestOf2,
    windowSha256Of, forbiddenScan, scanForbiddenText, scanDeclarations, collectStrings, sentenceNegated,
    relDiff, coverageStatusOf, annualTotals, eraOf, deltaRequest,
    verifyBundle, buildExport, verifyExport, stalenessOf, findTimeKeys, pinStatusText, normContext,
  };
});
