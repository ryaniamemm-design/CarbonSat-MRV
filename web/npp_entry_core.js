                                                                       
  
                                                                                
  
                                           
                                               
                                             
                                                           
                                                               
                      
                                                             
                        
                      
                            
                                 
                                                              
                                              
                                        
   
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    module.exports = factory(bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  } else {
    root.NppEntryCore = factory(bytes => root.ethers.sha256(bytes).slice(2));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sha256Bytes) {
  'use strict';

                                                                              
  const SCHEMA = 'CarbonSat-NppEstimateBundle-v1.1';
  const EXPORT_SCHEMA = 'CarbonSat-NppEstimateExport-v1.1';
  const PIN_SCHEMA = 'CarbonSat-NppEstimateBundlePin-v1.0';
  const VIEW_DOMAIN = 'CarbonSat-MRV|npp-estimate-view|v2\n';
  const EXPORT_DOMAIN = 'CarbonSat-MRV|npp-estimate-export|v1\n';
  const CONTENT_DOMAIN = 'CarbonSat-MRV|npp-estimate-bundle-content|v1\n';
  const PIN_PATH = 'web/npp_estimate_bundle.pin.json';
  const BUNDLE_PATH = 'web/npp_estimate_bundle.json';
  const RTOL = 1e-9;

  const OBJECT_NAME = '所选离散足迹的 MOD17 模型年度 NPP 碳生产量';
  const ERA_BOUNDARY_YEAR = 2012;
  const BOUNDARY = Object.freeze({
    claimClass: 'DESCRIPTIVE_NPP_ONLY',
    attributionStatus: 'insufficient_evidence',
    forbiddenOutputs: Object.freeze(['REMOVAL', 'GOVERNANCE_INCREMENT', 'CARBON_CREDIT', 'tCO2e']),
    carbonQuantificationStatus: 'NOT_PERFORMED',
    registrationReady: false,
    publiclyAnchored: false,
  });
  const SCOPE = '本页只读取既有产物，不产生新估算、不重训模型、不重跑 GEE、不计算净碳汇或信用量。模型 NPP 是已扣自养呼吸的模型碳生产量，不是实测通量，不能据此认定净碳汇。';
  const SOURCE_FILES_NOTE = '源文件逐项复算（读源 CSV 与 A2 文件逐条比对）由本机命令行 build_npp_estimate_bundle.py --verify 产出；本页不读源文件，故来源真实性一律记为未核验。';

                                                                         
  const AUTH_GENERATOR = 'scripts/build_npp_estimate_bundle.py';
  const AUTH_GENERATOR_VERSION = 'npp-estimate-bundle-v1.1';
  const AUTH_CELL_COUNT = 34;
  const AUTH_CELL_YEARS = 816;
  const AUTH_CLASS_ROWS = 1523;
  const AUTH_YEARS = Object.freeze(Array.from({ length: 24 }, (_, i) => 2001 + i));
  const AUTH_SOURCES = Object.freeze({
    productionIntegral: 'data/npp_annual_production_integral.csv',
    a2ValidFootprint: 'evidence/a2_landcover_valid_footprint.json',
  });
  const AUTH_UNITS = Object.freeze({
    prod_tC_yr: ['tC/yr', '所选离散足迹的 MOD17 模型年度 NPP 碳生产量（模型值，非碳汇）'],
    integral_kgC_yr: ['kgC/yr', '逐像元积分原值，未换算为 t'],
    gridValidAreaM2: ['m2', '栅格有效面积（npp_valid_mask），生产量的分母'],
    gridTotalAreaM2: ['m2', '栅格总面积；不得代替有效面积作分母'],
    geomAreaM2: ['m2', '矢量测地面积；与栅格面积有像元边界效应差异'],
    validAreaRatio: ['dimensionless', '栅格有效面积比例 = gridValidAreaM2 / gridTotalAreaM2；不是逐年观测准确率'],
    intensity_kg_m2_yr: ['kgC/m2/yr', '地类流量强度，分母为该地类有效栅格面积'],
    classValidAreaM2: ['m2', '该 IGBP 类别的有效栅格面积'],
    coverageRatio: ['dimensionless', '该类别有效面积占其类别面积之比'],
  });
  const AUTH_EXCLUDED_ERRORS = Object.freeze([
    'MOD17 模型结构性偏差与输入 GPP 参数误差未评估（无本区涡度相关标定）。',
    '地类产品（MCD12Q1）类别混淆与逐年变化未量化；地类变化不得解读为植被恢复。',
    '2012 附近存在同步结构性断点，成因未证实；按分析时段分段，不得跨该断点作增减解释。',
    'sourceHash / CSV 文件哈希只证明与本地 CSV 一致，不证明 GEE 原始资产真实。',
    '空间尺度差异（463 m 像元 vs 治理地块）与配准误差未评估。',
  ]);
  const AUTH_METHODOLOGY = Object.freeze({
    method_version: 'CarbonSat-NPP-Production-Integral-v0.1',
    landcover_method_version: 'CarbonSat-NPP-LandcoverValidFootprint-v0.1',
    product: 'MOD17A3HGF.v6.1',
    lcProduct: 'MCD12Q1.v6.1',
    mask: 'npp_valid_mask',
    crs: 'SR-ORG:6974',
    scale: 500,
    nativePixelSpacingM: 463.3127165,
    formula: 'P_cell = Σ_pixels (NPP_scaled × pixelArea) / 1000  [tC/yr]; NPP_scaled = DN × 0.0001',
    excludedErrors: AUTH_EXCLUDED_ERRORS,
    crossEraPolicy: '默认不绘制跨 2012 的增长箭头/增长率/治理效果；只按分析时段（era）分段查看原始描述性序列。',
  });

  const BUNDLE_KEYS = Object.freeze(['attributionStatus', 'bundleContentSha256', 'carbonQuantificationStatus',
    'cellGeometry', 'cellYears', 'cells', 'claimClass', 'crossCheck', 'eraBoundaryYear', 'expectedCellYears',
    'expectedClassRows', 'forbiddenOutputs', 'generatedFrom', 'generator', 'generatorVersion', 'methodology',
    'observedCellYears', 'observedClassRows', 'publiclyAnchored', 'registrationReady', 'schemaVersion', 'units', 'years']);
  const CELL_KEYS = Object.freeze(['cellId', 'lon', 'lat']);
  const CY_KEYS = Object.freeze(['cellId', 'year', 'prod_tC_yr', 'integral_kgC_yr', 'geomAreaM2', 'gridTotalAreaM2',
    'gridValidAreaM2', 'validAreaRatio', 'missing', 'missingReason', 'landCover']);
  const LC_KEYS = Object.freeze(['lcCode', 'lcName', 'classValidAreaM2', 'prod_tC_yr', 'intensity_kg_m2_yr', 'coverageRatio']);
  const CROSS_KEYS = Object.freeze(['metric', 'tolerance', 'worstKey', 'worstRelDiff']);
  const GEOM_KEYS = Object.freeze(['definition', 'halfSpanDeg']);
  const EXPORT_KEYS = Object.freeze(['schemaVersion', 'exportDomain', 'boundary', 'scopeNote', 'objectName', 'cellId',
    'year', 'view', 'viewSha256', 'units', 'displayed', 'landCoverRows', 'bundleRef', 'verification',
    'publiclyAnchored', 'warning', 'exportSha256']);
  const PIN_KEYS = Object.freeze(['schemaVersion', 'bundlePath', 'bundleBytes', 'bundleFileSha256', 'bundleContentSha256',
    'bundleSchemaVersion', 'generatedFrom']);
  const DISPLAY_FIELDS = Object.freeze(['prod_tC_yr', 'integral_kgC_yr', 'gridValidAreaM2', 'gridTotalAreaM2', 'geomAreaM2', 'validAreaRatio']);

                                                                               
  const cyKey = (cellId, year) => cellId + '|' + Number(year);
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
  const enc = s => new TextEncoder().encode(s);
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const numOrNull = v => v === null || isNum(v);
  const isNonEmptyString = v => typeof v === 'string' && v.length > 0;
  const isSha256 = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
  const isDigest = v => typeof v === 'string' && /^local-sha256:[0-9a-f]{64}$/.test(v);
  const sameKeys = (o, keys) => plain(o) && Object.keys(o).length === keys.length && keys.every(k => own(o, k));
  const relDiff = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);

                                              
  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('非有限数值不可规范化');
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    throw new Error('不支持的值（缺失字段不能当 null）');
  }

     
                                                              
                                                                                  
                                                          
     
  function bitsOf(n) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, n, false);
    let s = '';
    for (let i = 0; i < 8; i++) s += dv.getUint8(i).toString(16).padStart(2, '0');
    return s;
  }
  const escAscii = s => JSON.stringify(s).replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
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
    if (plain(value)) return '{' + Object.keys(value).sort().map(k => escAscii(k) + ':' + canonicalBits(value[k])).join(',') + '}';
    throw new Error('不支持的值（缺失字段不能当 null）');
  }

  const hashText = s => sha256Bytes(enc(s));
  const hashBytes = bytes => sha256Bytes(bytes);
  const textSha256 = s => hashText(s);
  const viewSha = view => 'local-sha256:' + hashText(VIEW_DOMAIN + canonicalBits(view));
  const exportSha = payload => 'local-sha256:' + hashText(EXPORT_DOMAIN + canonicalBits(payload));
                                                       
  const bundleCore = b => { const c = {}; Object.keys(b).forEach(k => { if (k !== 'bundleContentSha256') c[k] = b[k]; }); return c; };
  const contentSha = b => 'local-sha256:' + hashText(CONTENT_DOMAIN + canonicalBits(bundleCore(b)));

  const eraOf = year => (Number(year) >= ERA_BOUNDARY_YEAR ? 2 : 1);
  const eraLabel = era => (era === 2 ? 'era 2（2012–2024，断点后）' : 'era 1（2001–2011，断点前）');
  const m2ToHa = m2 => m2 / 1e4;
  const kgToT = kg => kg / 1000;

                                                                                
     
                        
                                     
     
  function validateBundle(b) {
    const errors = [];
    const push = m => { if (errors.length < 60) errors.push(m); };
    if (!plain(b)) return { ok: false, errors: ['数据包根须为对象'] };

    if (!sameKeys(b, BUNDLE_KEYS)) push('数据包键集不符（缺字段，或含未声明字段）');
    if (b.schemaVersion !== SCHEMA) push('schemaVersion 不符（须 ' + SCHEMA + '）');
    for (const k of Object.keys(BOUNDARY)) if (canonical(b[k]) !== canonical(BOUNDARY[k])) push('边界字段被改写：' + k);
    if (b.generator !== AUTH_GENERATOR) push('生成脚本登记不符');
    if (b.generatorVersion !== AUTH_GENERATOR_VERSION) push('生成脚本版本不符');
    if (canonical(b.years) !== canonical(AUTH_YEARS)) push('年份范围须为 2001–2024');
    if (b.eraBoundaryYear !== ERA_BOUNDARY_YEAR) push('era 断点须为 2012');
    if (b.expectedCellYears !== AUTH_CELL_YEARS || b.observedCellYears !== AUTH_CELL_YEARS) push('格年数须为 816');
    if (b.expectedClassRows !== AUTH_CLASS_ROWS || b.observedClassRows !== AUTH_CLASS_ROWS) push('地类行数须为 1523');
    if (!isDigest(b.bundleContentSha256)) push('bundleContentSha256 缺失或格式非法');

                                                
    if (canonical(b.units) !== canonical(AUTH_UNITS)) push('单位声明与权威单位不符（键集或取值被改写）');
    if (canonical(b.methodology) !== canonical(AUTH_METHODOLOGY)) push('方法学声明与权威方法学不符');

    if (!sameKeys(b.generatedFrom, ['productionIntegral', 'a2ValidFootprint'])) push('来源登记键集不符');
    else for (const [k, path] of Object.entries(AUTH_SOURCES)) {
      const r = b.generatedFrom[k];
      if (!sameKeys(r, ['path', 'sha256'])) { push('来源登记结构不符：' + k); continue; }
      if (r.path !== path) push('来源路径不符：' + k);
      if (!isSha256(r.sha256)) push('来源哈希缺失或非法：' + k);
    }

    if (!sameKeys(b.crossCheck, CROSS_KEYS)) push('交叉核对登记结构不符');
    else {
      const c = b.crossCheck;
      if (!isNonEmptyString(c.metric)) push('交叉核对 metric 非法');
      if (!isNum(c.tolerance) || !(c.tolerance > 0)) push('交叉核对 tolerance 非法');
      if (!(c.worstKey === null || (Array.isArray(c.worstKey) && c.worstKey.length === 2))) push('交叉核对 worstKey 非法');
      if (!numOrNull(c.worstRelDiff)) push('交叉核对 worstRelDiff 非法');
      else if (isNum(c.worstRelDiff) && isNum(c.tolerance) && c.worstRelDiff > c.tolerance) push('交叉核对最坏偏差超过登记容差');
    }

    if (!sameKeys(b.cellGeometry, GEOM_KEYS)) push('格几何登记结构不符');
    else {
      if (!isNonEmptyString(b.cellGeometry.definition)) push('格几何定义缺失');
      if (!isNum(b.cellGeometry.halfSpanDeg) || !(b.cellGeometry.halfSpanDeg > 0) || b.cellGeometry.halfSpanDeg > 1) push('格半跨须为 (0,1] 度');
    }

          
    let cellIds = [];
    if (!Array.isArray(b.cells) || b.cells.length !== AUTH_CELL_COUNT) push('格集合须为 34');
    else {
      const seen = new Set();
      b.cells.forEach((c, i) => {
        if (!sameKeys(c, CELL_KEYS)) { push('格登记结构不符：#' + i); return; }
        if (typeof c.cellId !== 'string' || !/^cell_\d{4}$/.test(c.cellId)) push('格主键格式非法：' + String(c.cellId));
        if (seen.has(c.cellId)) push('格主键重复：' + c.cellId);
        seen.add(c.cellId);
        if (!isNum(c.lon) || c.lon < -180 || c.lon > 180) push('经度非法：' + c.cellId);
        if (!isNum(c.lat) || c.lat < -90 || c.lat > 90) push('纬度非法：' + c.cellId);
      });
      cellIds = b.cells.map(c => c.cellId).filter(id => typeof id === 'string');
    }

                                         
    let classRows = 0;
    if (!plain(b.cellYears)) push('格年表缺失');
    else {
      const expected = new Set();
      if (cellIds.length === AUTH_CELL_COUNT) for (const id of cellIds) for (const y of AUTH_YEARS) expected.add(cyKey(id, y));
      const actual = Object.keys(b.cellYears);
      if (expected.size === AUTH_CELL_YEARS) {
        const missing = Array.from(expected).filter(k => !own(b.cellYears, k));
        const extra = actual.filter(k => !expected.has(k));
        if (missing.length) push('缺少格年主键 ' + missing.length + ' 个，例如 ' + missing[0]);
        if (extra.length) push('含未声明的格年主键 ' + extra.length + ' 个，例如 ' + extra[0]);
      }
      if (actual.length !== AUTH_CELL_YEARS) push('格年数须为 816（当前 ' + actual.length + '）');
      for (const k of actual) {
        const cy = b.cellYears[k];
        if (!sameKeys(cy, CY_KEYS)) { push('格年结构不符：' + k); continue; }
        if (cyKey(cy.cellId, cy.year) !== k) { push('格年主键与内容不符：' + k); continue; }
        if (!AUTH_YEARS.includes(cy.year)) { push('格年年份越界：' + k); continue; }
        for (const f of ['prod_tC_yr', 'integral_kgC_yr', 'geomAreaM2', 'gridTotalAreaM2', 'gridValidAreaM2', 'validAreaRatio']) {
          if (!numOrNull(cy[f])) push('非有限数值 ' + f + ' @' + k);
        }
        if (typeof cy.missing !== 'boolean') push('missing 须为布尔 @' + k);
        if (typeof cy.missingReason !== 'string') push('missingReason 须为字符串 @' + k);
        if (!Array.isArray(cy.landCover)) { push('地类行缺失：' + k); continue; }

                                  
        if (isNum(cy.prod_tC_yr) && isNum(cy.integral_kgC_yr) && relDiff(cy.prod_tC_yr, cy.integral_kgC_yr / 1000) > RTOL) {
          push('关系不符 prod_tC_yr ≠ integral_kgC_yr/1000 @' + k);
        }
                       
        if (isNum(cy.gridValidAreaM2) && isNum(cy.gridTotalAreaM2) && cy.gridTotalAreaM2 > 0
          && (!isNum(cy.validAreaRatio) || relDiff(cy.validAreaRatio, cy.gridValidAreaM2 / cy.gridTotalAreaM2) > RTOL)) {
          push('关系不符 validAreaRatio ≠ gridValidAreaM2/gridTotalAreaM2 @' + k);
        }
        if (isNum(cy.gridValidAreaM2) && isNum(cy.gridTotalAreaM2) && cy.gridValidAreaM2 > cy.gridTotalAreaM2 * (1 + RTOL)) {
          push('有效面积大于总面积 @' + k);
        }

                           
        let areaSum = 0, areaRows = 0, hasUnusableArea = false;
        cy.landCover.forEach((r, idx) => {
          const label = k + '/' + idx;
          if (!sameKeys(r, LC_KEYS)) { push('地类行结构不符：' + label); return; }
          if (!Number.isInteger(r.lcCode)) push('地类编码须为整数：' + label);
          if (!isNonEmptyString(r.lcName)) push('地类名称缺失：' + label);
          for (const f of ['classValidAreaM2', 'prod_tC_yr', 'intensity_kg_m2_yr', 'coverageRatio']) {
            if (!numOrNull(r[f])) push('地类非有限数值 ' + f + ' @' + label);
          }
          if (numOrNull(r.classValidAreaM2) && isNum(r.classValidAreaM2) && r.classValidAreaM2 < 0) push('地类面积为负：' + label);
          if (isNum(r.coverageRatio) && (r.coverageRatio < 0 || r.coverageRatio > 1 + RTOL)) push('覆盖率越界：' + label);
          if (isNum(r.classValidAreaM2) && r.classValidAreaM2 > 0) {
            areaSum += r.classValidAreaM2; areaRows++;
                                                      
            if (!isNum(r.prod_tC_yr)) push('有效面积 > 0 但生产量为空：' + label);
            else if (!isNum(r.intensity_kg_m2_yr)) push('有效面积 > 0 但强度为空：' + label);
            else if (relDiff(r.prod_tC_yr, r.intensity_kg_m2_yr * r.classValidAreaM2 / 1000) > RTOL) push('地类关系不符 prod ≠ intensity×area/1000 @' + label);
          } else {
            hasUnusableArea = true;
                                                  
            if (r.prod_tC_yr !== null || r.intensity_kg_m2_yr !== null) push('无有效面积却带生产量/强度：' + label);
          }
          classRows++;
        });
        if (areaRows && isNum(cy.gridValidAreaM2) && relDiff(areaSum, cy.gridValidAreaM2) > RTOL) {
          push('地类有效面积之和 ≠ 栅格有效面积 @' + k);
        }
        if (areaRows === 0 && !hasUnusableArea && cy.landCover.length === 0) push('地类行全空：' + k);
      }
    }
    if (classRows && classRows !== AUTH_CLASS_ROWS) push('实际地类行数 ' + classRows + ' 与声明 ' + AUTH_CLASS_ROWS + ' 不符');
    return { ok: !errors.length, errors: Array.from(new Set(errors)) };
  }

                                                                                
  function validatePin(pin) {
    const errors = [];
    if (!plain(pin)) return { ok: false, errors: ['pin 文件结构不符'] };
    if (!sameKeys(pin, PIN_KEYS)) errors.push('pin 键集不符');
    if (pin.schemaVersion !== PIN_SCHEMA) errors.push('pin schemaVersion 不符');
    if (pin.bundlePath !== BUNDLE_PATH) errors.push('pin 登记的 bundlePath 不符');
    if (!Number.isInteger(pin.bundleBytes) || pin.bundleBytes <= 0) errors.push('pin bundleBytes 非法');
    if (!isSha256(pin.bundleFileSha256)) errors.push('pin bundleFileSha256 非法');
    if (!isDigest(pin.bundleContentSha256)) errors.push('pin bundleContentSha256 非法');
    if (pin.bundleSchemaVersion !== SCHEMA) errors.push('pin bundleSchemaVersion 不符');
    if (!sameKeys(pin.generatedFrom, ['productionIntegral', 'a2ValidFootprint'])) errors.push('pin 来源登记结构不符');
    return { ok: !errors.length, errors };
  }

     
                                  
                                                  
                                                            
     
  function verifyBundle(b, opts) {
    const o = opts || {};
    const structure = validateBundle(b);
    let content = { ok: false, declared: null, recomputed: null, error: '' };
    if (structure.ok) {
      try {
        content.declared = b.bundleContentSha256;
        content.recomputed = contentSha(b);
        content.ok = content.declared === content.recomputed;
      } catch (e) { content.error = e.message; }
    }
    const pin = o.pin ? validatePin(o.pin) : { ok: false, errors: ['未提供 pin'] };
    let publishedPin = { provided: !!o.pin, status: 'PIN_ABSENT', fileBytesCompared: false, fileShaMatch: null, contentShaMatch: null, note: '' };
    if (o.pin && pin.ok) {
      publishedPin.contentShaMatch = content.recomputed !== null && o.pin.bundleContentSha256 === content.recomputed;
      publishedPin.fileShaMatch = o.fileSha256 ? (o.pin.bundleFileSha256 === o.fileSha256) : null;
      publishedPin.fileBytesCompared = !!o.fileSha256;
      if (publishedPin.contentShaMatch === false) { publishedPin.status = 'MISMATCHED'; publishedPin.note = '内容摘要与已发布摘要不符 ⇒ 拒绝（可能被改动或整体替换）'; }
      else if (publishedPin.fileBytesCompared && publishedPin.fileShaMatch === false) { publishedPin.status = 'CONTENT_OK_FILE_DIFFERENT'; publishedPin.note = '内容与已发布摘要一致，但文件字节不同（重排/重格式化）；未按字节比对'; }
      else if (publishedPin.fileBytesCompared) { publishedPin.status = 'MATCHED'; publishedPin.note = '内容摘要与文件字节均与已发布摘要一致'; }
      else { publishedPin.status = 'CONTENT_ONLY'; publishedPin.note = '内容摘要与已发布摘要一致；内存载入未提供文件字节 ⇒ 未按字节比对'; }
    } else if (o.pin) {
      publishedPin.status = 'PIN_INVALID';
      publishedPin.note = 'pin 文件结构非法：' + pin.errors.join('；');
    } else {
      publishedPin.note = '未找到/未提供已发布摘要（pin）⇒ 只能证明内部自洽，不能证明未被整体替换';
    }
    const errors = [...structure.errors];
                                                
                                                   
                                                       
    if (!structure.ok) {
      errors.push('结构校验未通过 ⇒ 内容摘要未评估（不得据此断言内容被改动，也不得断言未被改动）');
    } else if (!content.ok) {
      errors.push('内容摘要不符：声明 ' + String(content.declared) + ' ≠ 重算 ' + String(content.recomputed) + (content.error ? '（' + content.error + '）' : ''));
    }
    if (publishedPin.status === 'MISMATCHED' || publishedPin.status === 'PIN_INVALID') errors.push(publishedPin.note);
    const labels = [
      '① 浏览器内部重算：' + (structure.ok && content.ok ? '通过' : '未通过'),
      '② 已发布摘要（pin）：' + publishedPin.note,
      '③ 源文件逐项复算：未核验（' + SOURCE_FILES_NOTE + '）',
    ];
    return {
      ok: !errors.length, errors: Array.from(new Set(errors)),
      structure, content, publishedPin, labels,
      sourceFiles: { status: 'NOT_LOADED', note: SOURCE_FILES_NOTE },
      trustNote: '①② 只能证明自洽或与已发布件一致；都不是来源真实性或方法学适用性的证明。',
    };
  }

                                                                              
  function cellYearUsable(cy) {
    if (!plain(cy)) return { usable: false, reason: '该格年不在本次集合内' };
    if (cy.missing === true && cy.prod_tC_yr !== null) return { usable: false, reason: '缺测标志为真却仍保留数值（矛盾行）' };
    if (cy.missing === true) return { usable: false, reason: '该格年标记缺测：' + (cy.missingReason || '原因未说明') };
    if (!Number.isFinite(cy.prod_tC_yr)) return { usable: false, reason: '生产量为空或非有限数值' };
    if (!Number.isFinite(cy.integral_kgC_yr)) return { usable: false, reason: '积分原值为空或非有限数值' };
    if (cy.missing === false && !(cy.missingReason === '' || cy.missingReason === 'ok')) return { usable: false, reason: 'missingReason 与缺测标志不一致' };
    return { usable: true, reason: '' };
  }

                                                                            
  function describeCellYear(b, cellId, year, opts) {
    const v = verifyBundle(b, opts);
    if (!v.ok) throw new Error(v.errors.join('；'));
    year = Number(year);
    const cy = b.cellYears[cyKey(cellId, year)];
    if (!cy) throw new Error('未找到格年 ' + cellId + '|' + year);
    const cell = b.cells.find(c => c.cellId === cellId) || {};
    const u = cellYearUsable(cy);
    const landCover = (cy.landCover || []).map(r => {
      const noValid = !(Number.isFinite(r.classValidAreaM2) && r.classValidAreaM2 > 0);
      return {
        lcCode: r.lcCode, lcName: r.lcName,
        classValidAreaM2: r.classValidAreaM2,
        prod_tC_yr: noValid ? null : r.prod_tC_yr,
        intensity_kg_m2_yr: noValid ? null : r.intensity_kg_m2_yr,
        noValidProduct: noValid,
        note: noValid ? '无有效产品值（该类别有效面积为 0；不是真零）' : '',
      };
    });
    const era = eraOf(year);
    const yearTotal = yearFootprintTotal(b, year, { skipVerify: true });
    const completeness = {
      complete: yearTotal.complete,
      cellCount: yearTotal.cellCount,
      missingCount: yearTotal.missingCells.length,
      total_tC: yearTotal.total_tC,
    };
    const view = {
      schemaVersion: b.schemaVersion, cellId, year,
      prod_tC_yr: cy.prod_tC_yr, integral_kgC_yr: cy.integral_kgC_yr,
      gridValidAreaM2: cy.gridValidAreaM2, gridTotalAreaM2: cy.gridTotalAreaM2,
      validAreaRatio: cy.validAreaRatio,
      usable: u.usable, usableReason: u.reason,
      units: { prod_tC_yr: AUTH_UNITS.prod_tC_yr[0], integral_kgC_yr: AUTH_UNITS.integral_kgC_yr[0], validAreaRatio: 'dimensionless' },
      yearCompleteness: completeness,
      landCover: landCover.map(r => ({ lcCode: r.lcCode, classValidAreaM2: r.classValidAreaM2, prod_tC_yr: r.prod_tC_yr, intensity_kg_m2_yr: r.intensity_kg_m2_yr })),
      landCoverValidAreaSum: landCover.reduce((s, r) => s + (Number.isFinite(r.classValidAreaM2) ? r.classValidAreaM2 : 0), 0),
      sourceIntegralSha256: b.generatedFrom.productionIntegral.sha256,
      sourceA2Sha256: b.generatedFrom.a2ValidFootprint.sha256,
      method_version: b.methodology.method_version,
    };
    return {
      objectName: OBJECT_NAME, scopeNote: SCOPE,
      cellId, year, lon: cell.lon, lat: cell.lat,
      identity: cellId + ' · ' + year + ' · ' + OBJECT_NAME + '（tC/yr）',
      era, eraLabel: eraLabel(era),
      usable: u.usable, unusableReason: u.reason,
      values: {
        prod_tC_yr: { value: u.usable ? cy.prod_tC_yr : null, unit: 'tC/yr', label: 'MOD17 模型年度 NPP 碳生产量' },
        integral_kgC_yr: { value: u.usable ? cy.integral_kgC_yr : null, unit: 'kgC/yr', label: '逐像元积分原值' },
        gridValidAreaM2: { value: cy.gridValidAreaM2, unit: 'm2', label: '栅格有效面积（生产量分母）' },
        gridTotalAreaM2: { value: cy.gridTotalAreaM2, unit: 'm2', label: '栅格总面积' },
        geomAreaM2: { value: cy.geomAreaM2, unit: 'm2', label: '矢量测地面积（不代替栅格面积）' },
        validAreaRatio: { value: cy.validAreaRatio, unit: '无量纲', label: '栅格有效面积比例（不是观测准确率）' },
      },
      yearCompleteness: completeness,
      landCover, landCoverValidAreaSum: view.landCoverValidAreaSum,
      provenance: [
        { label: '数据文件（生产量）', value: b.generatedFrom.productionIntegral.path },
        { label: '数据文件 sha256', value: b.generatedFrom.productionIntegral.sha256 },
        { label: '数据文件（地类分解）', value: b.generatedFrom.a2ValidFootprint.path },
        { label: '数据文件 sha256', value: b.generatedFrom.a2ValidFootprint.sha256 },
        { label: '格年主键', value: cyKey(cellId, year) },
        { label: '方法版本', value: b.methodology.method_version },
        { label: '产品 / 地类产品', value: b.methodology.product + ' / ' + b.methodology.lcProduct },
        { label: '掩膜', value: b.methodology.mask },
        { label: '坐标系 / 尺度', value: b.methodology.crs + ' / ' + b.methodology.scale + ' m' },
        { label: '公式', value: b.methodology.formula },
      ],
      excludedErrors: b.methodology.excludedErrors,
      flags: {
        crossEraBlocked: true, noGrowthArrow: true, notASink: true,
        notExtrapolated: true, noCredit: true, footprintIsSampleBox: true,
      },
      footprint: {
        definition: b.cellGeometry.definition, halfSpanDeg: b.cellGeometry.halfSpanDeg,
        bbox: [Number(cell.lon) - b.cellGeometry.halfSpanDeg, Number(cell.lat) - b.cellGeometry.halfSpanDeg,
          Number(cell.lon) + b.cellGeometry.halfSpanDeg, Number(cell.lat) + b.cellGeometry.halfSpanDeg],
        validAreaHa: Number.isFinite(cy.gridValidAreaM2) ? m2ToHa(cy.gridValidAreaM2) : null,
      },
      viewSha256: viewSha(view),
      viewObjectName: OBJECT_NAME,
      modelValueNote: 'MOD17 模型值；已扣植物自养呼吸，净留存还需考虑异养呼吸、扰动与收获 ⇒ 不能据此认定净碳汇。',
    };
  }

  function annualSeries(b, cellId, opts) {
    const v = verifyBundle(b, opts);
    if (!v.ok) throw new Error(v.errors.join('；'));
    const series = AUTH_YEARS.map(y => {
      const cy = b.cellYears[cyKey(cellId, y)];
      const u = cellYearUsable(cy);
      return { year: y, prod_tC_yr: u.usable ? cy.prod_tC_yr : null, usable: u.usable, reason: u.reason, era: eraOf(y) };
    });
    return {
      cellId, objectName: OBJECT_NAME, series,
      era1: series.filter(s => s.era === 1), era2: series.filter(s => s.era === 2),
      growthArrowShown: false, growthRateShown: false, governanceEffectShown: false,
      note: '按分析时段（era）分段查看原始描述性序列；2012 附近存在同步结构性断点、成因未证实 ⇒ 不绘制跨断点增长箭头、增长率或治理效果。',
    };
  }

  function yearFootprintTotal(b, year, opts) {
    if (!(opts && opts.skipVerify)) {
      const v = verifyBundle(b, opts);
      if (!v.ok) throw new Error(v.errors.join('；'));
    }
    year = Number(year);
    if (!AUTH_YEARS.includes(year)) throw new Error('年份越界：' + year);
    let total = 0; const missing = [];
    for (const c of b.cells) {
      const cy = b.cellYears[cyKey(c.cellId, year)];
      const u = cellYearUsable(cy);
      if (!u.usable) missing.push({ cellId: c.cellId, reason: u.reason }); else total += cy.prod_tC_yr;
    }
    return {
      year, cellCount: b.cells.length, total_tC: missing.length ? null : total,
      complete: missing.length === 0, missingCells: missing,
      label: '所选离散足迹（' + b.cells.length + ' 个离散采样格）该年的 MOD17 模型 NPP 生产量合计；不代表库布其全区',
    };
  }

  function allYearTotals(b, opts) {
                                  
    if (!(opts && opts.skipVerify)) {
      const v = verifyBundle(b, opts);
      if (!v.ok) throw new Error(v.errors.join('；'));
    }
    return AUTH_YEARS.map(y => {
      const t = yearFootprintTotal(b, y, { skipVerify: true });
      return { year: y, total_tC: t.total_tC, complete: t.complete, missingCount: t.missingCells.length, era: eraOf(y) };
    });
  }

                                                                               
  const FORBIDDEN = Object.freeze(['REMOVAL', 'GOVERNANCE_INCREMENT', 'CARBON_CREDIT', 'tCO2e', 'tCO₂e', '碳信用', '已签发']);
  function forbiddenScan(text) {
    const hits = [], s = String(text);
    for (const w of FORBIDDEN) if (s.includes(w)) hits.push(w);
    return hits;
  }

                                                                               
  function displayedBlock(d) {
    const out = {};
    for (const f of DISPLAY_FIELDS) out[f] = { value: d.values[f].value, unit: d.values[f].unit, label: d.values[f].label };
    return out;
  }

     
                                                 
     
  function buildExport(b, cellId, year, opts) {
    const o = opts || {};
    const v = verifyBundle(b, o);
    if (!v.ok) throw new Error('数据包未通过核验，拒绝导出：' + v.errors.join('；'));
    const d = describeCellYear(b, cellId, year, o);
    const cy = b.cellYears[cyKey(cellId, year)];
    const pack = {
      schemaVersion: EXPORT_SCHEMA,
      exportDomain: EXPORT_DOMAIN.trim(),
      boundary: JSON.parse(JSON.stringify(BOUNDARY)),
      scopeNote: SCOPE,
      objectName: OBJECT_NAME,
      cellId, year: Number(year),
      view: null,
      viewSha256: d.viewSha256,
      units: JSON.parse(JSON.stringify(AUTH_UNITS)),
      displayed: displayedBlock(d),
      landCoverRows: d.landCover.map(r => ({ lcCode: r.lcCode, lcName: r.lcName, classValidAreaM2: r.classValidAreaM2, prod_tC_yr: r.prod_tC_yr, intensity_kg_m2_yr: r.intensity_kg_m2_yr, noValidProduct: r.noValidProduct })),
      bundleRef: {
        path: BUNDLE_PATH,
        schemaVersion: b.schemaVersion,
        generatorVersion: b.generatorVersion,
        contentSha256Declared: b.bundleContentSha256,
        contentSha256Recomputed: v.content.recomputed,
        sourceIntegralSha256: b.generatedFrom.productionIntegral.sha256,
        sourceA2Sha256: b.generatedFrom.a2ValidFootprint.sha256,
        methodVersion: b.methodology.method_version,
        eraBoundaryYear: b.eraBoundaryYear,
      },
      verification: {
        internalRecompute: { ok: true, checks: internalChecks(b, cellId, year, d) },
        declaredContentDigest: { declared: v.content.declared, recomputed: v.content.recomputed, ok: v.content.ok },
        publishedPin: { status: v.publishedPin.status, note: v.publishedPin.note, pinnedFileSha256: o.pin ? o.pin.bundleFileSha256 : null, loadedFileSha256: o.fileSha256 || null, pinnedContentSha256: o.pin ? o.pin.bundleContentSha256 : null },
        sourceFiles: { status: 'NOT_LOADED', note: SOURCE_FILES_NOTE },
        trustNote: v.trustNote,
        labels: v.labels,
      },
      publiclyAnchored: false,
      warning: '本导出只是既有产物的视图快照，不新增数值、不含碳量或信用量、未上链；摘要只证明自洽，不鉴定来源真实性。',
    };
                                           
    pack.view = { schemaVersion: b.schemaVersion, cellId, year: Number(year), prod_tC_yr: cy.prod_tC_yr, integral_kgC_yr: cy.integral_kgC_yr, gridValidAreaM2: cy.gridValidAreaM2, gridTotalAreaM2: cy.gridTotalAreaM2, validAreaRatio: cy.validAreaRatio, usable: d.usable, usableReason: d.unusableReason, units: { prod_tC_yr: 'tC/yr', integral_kgC_yr: 'kgC/yr', validAreaRatio: 'dimensionless' }, yearCompleteness: d.yearCompleteness, landCover: d.landCover.map(r => ({ lcCode: r.lcCode, classValidAreaM2: r.classValidAreaM2, prod_tC_yr: r.prod_tC_yr, intensity_kg_m2_yr: r.intensity_kg_m2_yr })), landCoverValidAreaSum: d.landCoverValidAreaSum, sourceIntegralSha256: b.generatedFrom.productionIntegral.sha256, sourceA2Sha256: b.generatedFrom.a2ValidFootprint.sha256, method_version: b.methodology.method_version };
    if (viewSha(pack.view) !== d.viewSha256) throw new Error('导出视图摘要自检失败');
    const scanText = canonical({ objectName: pack.objectName, cellId: pack.cellId, year: pack.year, view: pack.view, displayed: pack.displayed, landCoverRows: pack.landCoverRows, units: pack.units, bundleRef: pack.bundleRef, verification: pack.verification, warning: pack.warning });
    const hits = forbiddenScan(scanText);
    if (hits.length) throw new Error('导出含禁止表述：' + hits.join('、'));
    const body = Object.assign({}, pack);
    delete body.exportSha256;
    pack.exportSha256 = exportSha(body);
    return pack;
  }

  function internalChecks(b, cellId, year, d) {
    const cy = b.cellYears[cyKey(cellId, year)];
    const c = [];
    const add = (name, ok) => c.push({ name, ok: !!ok });
    add('prod_tC_yr = integral_kgC_yr/1000', isNum(cy.prod_tC_yr) && isNum(cy.integral_kgC_yr) ? relDiff(cy.prod_tC_yr, cy.integral_kgC_yr / 1000) <= RTOL : true);
    add('validAreaRatio = 有效面积/总面积', isNum(cy.gridValidAreaM2) && isNum(cy.gridTotalAreaM2) && cy.gridTotalAreaM2 > 0 ? relDiff(cy.validAreaRatio, cy.gridValidAreaM2 / cy.gridTotalAreaM2) <= RTOL : true);
    add('地类有效面积之和 = 栅格有效面积', isNum(cy.gridValidAreaM2) ? relDiff(d.landCoverValidAreaSum, cy.gridValidAreaM2) <= RTOL : true);
    add('地类零面积行为 null（不是真零）', d.landCover.every(r => r.noValidProduct ? (r.prod_tC_yr === null && r.intensity_kg_m2_yr === null) : true));
    add('年度合计与完整性一致', d.yearCompleteness.complete ? isNum(d.yearCompleteness.total_tC) : d.yearCompleteness.total_tC === null);
    add('视图摘要可重算', viewSha(packView(b, cellId, year, d)) === d.viewSha256);
    return c;
  }
  const packView = (b, cellId, year, d) => ({ schemaVersion: b.schemaVersion, cellId, year: Number(year), prod_tC_yr: b.cellYears[cyKey(cellId, year)].prod_tC_yr, integral_kgC_yr: b.cellYears[cyKey(cellId, year)].integral_kgC_yr, gridValidAreaM2: b.cellYears[cyKey(cellId, year)].gridValidAreaM2, gridTotalAreaM2: b.cellYears[cyKey(cellId, year)].gridTotalAreaM2, validAreaRatio: b.cellYears[cyKey(cellId, year)].validAreaRatio, usable: d.usable, usableReason: d.unusableReason, units: { prod_tC_yr: 'tC/yr', integral_kgC_yr: 'kgC/yr', validAreaRatio: 'dimensionless' }, yearCompleteness: d.yearCompleteness, landCover: d.landCover.map(r => ({ lcCode: r.lcCode, classValidAreaM2: r.classValidAreaM2, prod_tC_yr: r.prod_tC_yr, intensity_kg_m2_yr: r.intensity_kg_m2_yr })), landCoverValidAreaSum: d.landCoverValidAreaSum, sourceIntegralSha256: b.generatedFrom.productionIntegral.sha256, sourceA2Sha256: b.generatedFrom.a2ValidFootprint.sha256, method_version: b.methodology.method_version });

     
                                 
                                                
     
  function verifyExport(pack, opts) {
    const o = opts || {};
    const errors = [];
    try {
      if (!sameKeys(pack, EXPORT_KEYS)) throw new Error('导出键集不符');
      if (pack.schemaVersion !== EXPORT_SCHEMA) errors.push('导出口径版本不符');
      if (pack.exportDomain !== EXPORT_DOMAIN.trim()) errors.push('导出域不符');
      if (canonical(pack.boundary) !== canonical(BOUNDARY)) errors.push('导出边界被改写');
      if (pack.scopeNote !== SCOPE) errors.push('导出范围说明被改写');
      if (pack.objectName !== OBJECT_NAME) errors.push('导出对象名被改写');
      if (pack.publiclyAnchored !== false) errors.push('导出不得声称已上链');
      if (canonical(pack.units) !== canonical(AUTH_UNITS)) errors.push('导出单位声明与权威单位不符（改单位或改说明都拒绝）');
      if (!plain(pack.verification)) errors.push('导出核验块缺失');
      else {
        if (!(pack.verification.sourceFiles && pack.verification.sourceFiles.status === 'NOT_LOADED')) errors.push('导出不得声称已做源文件逐项复算（本页不具备该能力）');
        if (!(pack.verification.internalRecompute && pack.verification.internalRecompute.ok === true)) errors.push('导出未通过内部重算');
        if (!Array.isArray(pack.verification.internalRecompute.checks) || pack.verification.internalRecompute.checks.some(c => !c || c.ok !== true)) errors.push('导出内部重算存在未通过项');
        if (!(pack.verification.declaredContentDigest && pack.verification.declaredContentDigest.ok === true)) errors.push('导出时数据包内容摘要未通过');
      }
                             
      if (!plain(pack.view)) errors.push('导出视图缺失');
      else {
        const recomputedView = viewSha(pack.view);
        if (pack.view.viewSha256 !== undefined && pack.view.viewSha256 !== recomputedView) errors.push('视图内摘要与视图不符');
        if (pack.viewSha256 !== recomputedView) errors.push('视图摘要与视图不符（未重签即改视图）');
      }
                    
      if (!sameKeys(pack.displayed, DISPLAY_FIELDS)) errors.push('展示值键集不符');
      else {
        const g = k => pack.displayed[k].value;
        if (isNum(g('prod_tC_yr')) && isNum(g('integral_kgC_yr')) && relDiff(g('prod_tC_yr'), g('integral_kgC_yr') / 1000) > RTOL) errors.push('展示值 prod_tC_yr 与 integral_kgC_yr/1000 不符');
        if (isNum(g('gridValidAreaM2')) && isNum(g('gridTotalAreaM2')) && g('gridTotalAreaM2') > 0 && (!isNum(g('validAreaRatio')) || relDiff(g('validAreaRatio'), g('gridValidAreaM2') / g('gridTotalAreaM2')) > RTOL)) errors.push('展示值 validAreaRatio 与面积比不符');
        if (pack.displayed.prod_tC_yr.unit !== 'tC/yr' || pack.displayed.integral_kgC_yr.unit !== 'kgC/yr') errors.push('展示值单位被改写');
        if (isNum(g('prod_tC_yr')) && isNum(pack.view.prod_tC_yr) && g('prod_tC_yr') !== pack.view.prod_tC_yr) errors.push('展示值与视图内容的流量不一致');
      }
                                             
      if (o.bundle) {
        const b = o.bundle;
        const vb = verifyBundle(b, { pin: o.pin, fileSha256: o.fileSha256 });
        if (!vb.ok) errors.push('用于交叉重算的数据包未通过核验');
        else if (pack.cellId !== undefined && b.cellYears[cyKey(pack.cellId, pack.year)]) {
          const rec = describeCellYear(b, pack.cellId, pack.year, { skipVerify: true });
          const cy = b.cellYears[cyKey(pack.cellId, pack.year)];
          if (canonical(pack.view) !== canonical(packView(b, pack.cellId, pack.year, rec))) errors.push('导出视图内容与数据包重算不符');
          if (relDiff(isNum(cy.prod_tC_yr) ? cy.prod_tC_yr : 0, isNum(pack.displayed.prod_tC_yr.value) ? pack.displayed.prod_tC_yr.value : 0) > RTOL) errors.push('导出生产量与数据包不符');
          if (pack.landCoverRows.length !== rec.landCover.length) errors.push('导出地类行数与数据包不符');
          if (pack.bundleRef.contentSha256Recomputed !== vb.content.recomputed) errors.push('导出登记的数据包内容摘要与数据包不符');
          if (pack.bundleRef.sourceIntegralSha256 !== b.generatedFrom.productionIntegral.sha256) errors.push('导出登记的源摘要与数据包不符');
        } else errors.push('导出格年不在所提供的数据包内');
      }
                                
      const body = Object.assign({}, pack);
      delete body.exportSha256;
      if (pack.exportSha256 !== exportSha(body)) errors.push('导出摘要与导出内容不符（改了内容但未重签）');
      if (!isDigest(pack.exportSha256)) errors.push('导出摘要格式非法');
      const hits = forbiddenScan(canonical({ objectName: pack.objectName, cellId: pack.cellId, year: pack.year, view: pack.view, displayed: pack.displayed, landCoverRows: pack.landCoverRows, bundleRef: pack.bundleRef, verification: pack.verification, warning: pack.warning }));
      if (hits.length) errors.push('导出含禁止表述：' + hits.join('、'));
    } catch (e) { errors.push(e.message); }
    const warnings = [];
    if (!o.bundle) warnings.push('未提供数据包 ⇒ 未做与数据包的交叉重算，只证明导出内容自洽。');
    return {
      ok: !errors.length, errors: Array.from(new Set(errors)), warnings,
      provenance: [
        { level: '①', name: '浏览器内部重算（关系式 + 视图摘要）', status: errors.length ? '未通过' : '通过' },
        { level: '②', name: '已发布摘要（pin / 文件内声明）', status: pack && pack.verification && pack.verification.publishedPin ? pack.verification.publishedPin.status : 'UNKNOWN' },
        { level: '③', name: '源文件逐项复算', status: 'NOT_LOADED（未核验）' },
      ],
      sourceAuthenticityVerified: false,
      scopeNote: SCOPE,
    };
  }

  return {
    SCHEMA, EXPORT_SCHEMA, PIN_SCHEMA, VIEW_DOMAIN, EXPORT_DOMAIN, CONTENT_DOMAIN, PIN_PATH, BUNDLE_PATH, RTOL,
    OBJECT_NAME, ERA_BOUNDARY_YEAR, BOUNDARY, SCOPE, SOURCE_FILES_NOTE,
    AUTH_GENERATOR, AUTH_GENERATOR_VERSION, AUTH_CELL_COUNT, AUTH_CELL_YEARS, AUTH_CLASS_ROWS, AUTH_YEARS,
    AUTH_SOURCES, AUTH_UNITS, AUTH_METHODOLOGY, AUTH_EXCLUDED_ERRORS, BUNDLE_KEYS, EXPORT_KEYS, PIN_KEYS,
    canonical, canonicalBits, hashText, hashBytes, textSha256, viewSha, exportSha, contentSha, bundleCore,
    eraOf, eraLabel, m2ToHa, kgToT, cyKey, relDiff,
    validateBundle, validatePin, verifyBundle, cellYearUsable, describeCellYear, annualSeries,
    yearFootprintTotal, allYearTotals, forbiddenScan, buildExport, verifyExport, internalChecks,
  };
});
