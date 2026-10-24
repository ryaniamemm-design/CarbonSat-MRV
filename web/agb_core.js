                                                                                               
  
                                                                                        
  
                                                               
                                                   
                                                            
                                                           
                                                                         
                                               
                                                                           
                                                 
                                                             
                                                                 
   
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const crypto = require('crypto');
    module.exports = factory(bytes => crypto.createHash('sha256').update(bytes).digest('hex'));
  } else {
    root.AgbCore = factory(bytes => root.ethers.sha256(bytes).slice(2));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (sha256Bytes) {
  'use strict';
  const SCHEMA = 'CarbonSat-AgbScenario-v0.2';
  const PROTOCOL = 'CarbonSat-AgbScenarioRules-v0.2';
  const PACKAGE = 'CarbonSat-AgbScenarioPackage-v0.2';
  const SCENARIO_DOMAIN = 'CarbonSat-MRV|agb-scenario|v2\n';
  const PACKAGE_DOMAIN = 'CarbonSat-MRV|agb-package|v2\n';
  const OBJECT_NAME = '地上活生物量碳储量情景试算';
  const OBJECT_UNIT = 'tC';
  const MODES = Object.freeze({ DATA_SUPPORTED: 'DATA_SUPPORTED', USER_SCENARIO: 'USER_SCENARIO', SYNTHETIC: 'SYNTHETIC', NO_RESULT: 'NO_RESULT' });
  const APPLICABILITY = Object.freeze(['MEASURED_LOCAL', 'LITERATURE_PENDING_APPLICABILITY', 'USER_ASSUMPTION', 'SYNTHETIC', 'UNKNOWN']);
  const SOURCE_TYPES = Object.freeze(['MEASURED', 'LITERATURE', 'LOCAL_SURVEY', 'DEFAULT_TABLE', 'USER_ASSUMPTION', 'SYNTHETIC']);
                                                             
  const SOURCE_LEVEL_COMPAT = Object.freeze({
    MEASURED: ['MEASURED_LOCAL'],
    LOCAL_SURVEY: ['MEASURED_LOCAL'],
    LITERATURE: ['LITERATURE_PENDING_APPLICABILITY'],
    DEFAULT_TABLE: ['LITERATURE_PENDING_APPLICABILITY'],
    USER_ASSUMPTION: ['USER_ASSUMPTION'],
    SYNTHETIC: ['SYNTHETIC'],
  });
                                                    
  const REQUIRED_PARAM_FIELDS = Object.freeze(['sourceReference', 'pageOrTable', 'applicableYear', 'region', 'species', 'ageClass', 'basis']);
  const AREA_SOURCE_TYPES = Object.freeze(['GEOMETRY_DERIVED', 'EXTERNAL_GIS', 'MANUAL']);
  const ALLOWED_B_UNITS = Object.freeze(['tDM/ha', 'kgDM/m2']);
  const INCLUDED_POOLS = Object.freeze(['AGB']);
                                                                          
  const EXCLUDED_POOLS = Object.freeze(['SOC', 'BGB', 'DEADWOOD', 'LITTER', 'HWP']);
                                          
  const UNASSESSED_ELEMENTS = Object.freeze(['BASELINE', 'LEAKAGE', 'NON_PERMANENCE', 'ADDITIONALITY']);
  const EXCLUDED_LABELS = Object.freeze({
    SOC: '土壤有机碳', BGB: '地下生物量', DEADWOOD: '死木', LITTER: '枯落物', HWP: '木竹产品',
  });
  const UNASSESSED_LABELS = Object.freeze({
    BASELINE: '基准线', LEAKAGE: '泄漏', NON_PERMANENCE: '非持久性', ADDITIONALITY: '额外性',
  });
  const BOUNDARY = Object.freeze({
    claimClass: 'DESCRIPTIVE_AGB_STOCK_SCENARIO',
    attributionStatus: 'not_assessed',
    forbiddenOutputs: Object.freeze(['REMOVAL', 'GOVERNANCE_INCREMENT', 'CARBON_CREDIT', 'tCO2e']),
    netSequestrationClaim: false,
    creditIssuance: false,
    baselineAssessed: false,
    publiclyAnchored: false,
  });
  const SCOPE = '只计算地上活生物量碳库的情景值；未纳入碳库（土壤有机碳、地下生物量、死木、枯落物、木竹产品）与未评估的信用核算/资格要素（基准线、泄漏、非持久性、额外性）均单列，不参与求和。情景范围不是置信区间或误差界。摘要只证明内部自洽，不鉴定参数真实性或方法学适用性。未上链，不含信用量。';
  const owner = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const plain = o => o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
  const visibleText = s => String(s).replace(/[\u200b-\u200d\u2060\ufeff]/g, '').trim();
  const filled = s => typeof s === 'string' && visibleText(s).length > 0;
  const PLACEHOLDER = /^(?:待定|待补|占位|待填写|待提供|TODO|TBD|placeholder|NA|N\/A|[-—?？]+)$/i;
  const clone = o => JSON.parse(JSON.stringify(o));
  const enc = s => new TextEncoder().encode(s);
  function canonical(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('非有限数值不可规范化'); return JSON.stringify(value); }
    if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
    if (plain(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    throw new Error('不支持的值（缺失字段不能当 null）');
  }
  const hashText = s => sha256Bytes(enc(s));
  const scenarioSha = s => 'local-sha256:' + hashText(SCENARIO_DOMAIN + canonical(s));
  const packageSha = p => 'local-sha256:' + hashText(PACKAGE_DOMAIN + canonical(p));
  const isDate = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; };
  const isTimestamp = s => { if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s) || !Number.isFinite(Date.parse(s))) return false; const n = /\.\d{3}Z$/.test(s) ? s : s.replace(/Z$/, '.000Z'); return new Date(s).toISOString() === n; };
  const isSha256 = s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

  const PARAM_KEYS = ['parameterId', 'value', 'low', 'high', 'unit', 'sourceType', 'sourceReference', 'pageOrTable', 'region', 'species', 'ageClass', 'applicableYear', 'basis', 'applicabilityStatus'];
  const AREA_KEYS = ['sourceType', 'areaHa', 'geometrySha256', 'crs', 'algorithm', 'unitBasis', 'object', 'fileReference', 'manual', 'overlapChecked', 'layers'];
  const RECORD_KEYS = ['schemaVersion', 'protocolVersion', 'mode', 'asOfDate', 'parcel', 'area', 'biomass', 'carbonFraction', 'notes'];

  function blankParam(id, unit) {
    return { parameterId: id, value: null, low: null, high: null, unit: unit, sourceType: 'USER_ASSUMPTION',
      sourceReference: '', pageOrTable: '', region: '', species: '', ageClass: '', applicableYear: '', basis: '', applicabilityStatus: 'UNKNOWN' };
  }
  function blankRecord(asOfDate) {
    if (!isDate(asOfDate)) throw new Error('asOfDate 须为有效 ISO 日期');
    return {
      schemaVersion: SCHEMA, protocolVersion: PROTOCOL, mode: 'REAL', asOfDate,
      parcel: { parcelId: '', name: '' },
      area: { sourceType: 'MANUAL', areaHa: null, geometrySha256: '', crs: '', algorithm: '', unitBasis: 'horizontal_ha', object: OBJECT_NAME, fileReference: '', manual: true, overlapChecked: false, layers: [] },
      biomass: blankParam('B', 'tDM/ha'),
      carbonFraction: blankParam('f_C', 'dimensionless'),
      notes: '',
    };
  }

  function isNumOrNull(v) { return v === null || (typeof v === 'number' && Number.isFinite(v)); }

  function validateRecord(r) {
    const errors = [];
    const keys = (o, expected, label) => {
      if (!plain(o)) { errors.push(label + ' 须为对象'); return false; }
      const actual = Object.keys(o);
      if (actual.length !== expected.length || expected.some(k => !owner(o, k))) { errors.push(label + ' 键集不符（缺字段/多字段）'); return false; }
      return true;
    };
    const strs = (o, fs, label) => fs.forEach(k => { if (typeof o[k] !== 'string' || o[k].length > 5000) errors.push(label + '.' + k + ' 须为长度不超过 5000 的字符串'); });
    if (!keys(r, RECORD_KEYS, 'scenario')) return { ok: false, errors };
    if (r.schemaVersion !== SCHEMA || r.protocolVersion !== PROTOCOL) errors.push('协议版本不符');
    if (!['REAL', 'SYNTHETIC'].includes(r.mode)) errors.push('模式非法');
    if (!isDate(r.asOfDate)) errors.push('asOfDate 非法');
    if (typeof r.notes !== 'string' || r.notes.length > 10000) errors.push('notes 非法');
    if (keys(r.parcel, ['parcelId', 'name'], 'parcel')) strs(r.parcel, ['parcelId', 'name'], 'parcel');
    if (r.mode === 'REAL' && plain(r.parcel) && typeof r.parcel.parcelId === 'string' && r.parcel.parcelId.startsWith('SYNTHETIC')) errors.push('合成演示不得仅改模式升级为真实情景');
    if (keys(r.area, AREA_KEYS, 'area')) {
      const a = r.area;
      if (!AREA_SOURCE_TYPES.includes(a.sourceType)) errors.push('面积来源类型非法');
      if (!isNumOrNull(a.areaHa)) errors.push('areaHa 非法');
      if (typeof a.areaHa === 'number' && a.areaHa < 0) errors.push('面积为负');
      strs(a, ['sourceType', 'geometrySha256', 'crs', 'algorithm', 'unitBasis', 'object', 'fileReference'], 'area');
      if (a.unitBasis !== 'horizontal_ha') errors.push('面积基准须为水平 ha');
      if (a.geometrySha256 !== '' && !isSha256(a.geometrySha256)) errors.push('几何摘要须为小写 64 位 sha256 或留空');
      if (typeof a.manual !== 'boolean' || typeof a.overlapChecked !== 'boolean') errors.push('manual/overlapChecked 须为 boolean');
      if (!Array.isArray(a.layers) || a.layers.length > 50) errors.push('layers 须为最多 50 条的数组');
      else {
        const ids = new Set(), hashes = new Set();
        a.layers.forEach(L => {
          if (!keys(L, ['layerId', 'areaHa', 'classLabel'], 'layer')) return;
          strs(L, ['layerId', 'classLabel'], 'layer');
          if (!filled(L.layerId) || ids.has(L.layerId)) errors.push('分层主键为空或重复'); ids.add(L.layerId);
          if (!isNumOrNull(L.areaHa) || (typeof L.areaHa === 'number' && L.areaHa < 0)) errors.push('分层面积非法/为负');
          if (filled(L.classLabel) && hashes.has(L.classLabel)) errors.push('分层类别标签重复');
          hashes.add(L.classLabel);
        });
      }
      if (a.sourceType === 'MANUAL' && a.manual !== true) errors.push('手工面积必须显式标记 manual=true');
      if (a.sourceType !== 'MANUAL' && a.manual === true) errors.push('非手工来源不得标记为手工面积');
    }
    [['biomass', 'B'], ['carbonFraction', 'f_C']].forEach(([k, label]) => {
      const p = r[k];
      if (!keys(p, PARAM_KEYS, k)) return;
      strs(p, ['parameterId', 'unit', 'sourceType', 'sourceReference', 'pageOrTable', 'region', 'species', 'ageClass', 'applicableYear', 'basis', 'applicabilityStatus'], k);
      if (!filled(p.parameterId)) errors.push(label + ' 参数主键为空');
      ['value', 'low', 'high'].forEach(f => { if (!isNumOrNull(p[f])) errors.push(k + '.' + f + ' 须为有限数值或 null'); });
      if (typeof p.value === 'number' && p.value < 0) errors.push(k + '.value 不得为负');
      if (!SOURCE_TYPES.includes(p.sourceType)) errors.push(k + '.sourceType 非法');
      if (!APPLICABILITY.includes(p.applicabilityStatus)) errors.push(k + '.applicabilityStatus 非法');
      if (typeof p.unit === 'string' && /\/\s*yr/i.test(p.unit)) errors.push(k + ' 单位含 /yr：生产力不得当库存密度');
      if (typeof p.unit === 'string' && /FW|fresh|鲜/i.test(p.unit)) errors.push(k + ' 单位含鲜重：不得当干重');
    });
    try { if (canonical(r).length > 200000) errors.push('情景记录过大'); } catch (e) { errors.push(e.message); }
    return { ok: !errors.length, errors: Array.from(new Set(errors)) };
  }

  function normalizeB(p) {
    const u = String(p.unit || '');
    if (!ALLOWED_B_UNITS.includes(u)) return { ok: false, reason: 'B 单位须为 tDM/ha 或 kgDM/m2（干物质库存密度）' };
    if (!Number.isFinite(p.value)) return { ok: false, reason: 'B 数值缺失或不合法' };
    if (p.value < 0) return { ok: false, reason: 'B 不得为负' };
    return { ok: true, tPerHa: u === 'kgDM/m2' ? p.value * 10 : p.value, conversion: u === 'kgDM/m2' ? '×10（kgDM/m² → tDM/ha）' : null };
  }
  function normalizeFC(p) {
    if (String(p.unit) !== 'dimensionless') return { ok: false, reason: 'f_C 单位须为无量纲分数，不是百分数或 tC/t' };
    if (!Number.isFinite(p.value)) return { ok: false, reason: 'f_C 数值缺失或不合法' };
    if (!(p.value > 0 && p.value <= 1)) return { ok: false, reason: 'f_C 须在 (0, 1] 区间（≤0 或 >1 非法）' };
    return { ok: true, value: p.value };
  }
  const sourceLevelCompatible = p => Array.isArray(SOURCE_LEVEL_COMPAT[p.sourceType]) && SOURCE_LEVEL_COMPAT[p.sourceType].includes(p.applicabilityStatus);
  const paramSourceComplete = p => filled(p.sourceReference) && p.applicabilityStatus !== 'UNKNOWN' && !PLACEHOLDER.test(visibleText(p.sourceReference));
  const paramIsSynthetic = p => p.sourceType === 'SYNTHETIC' || p.applicabilityStatus === 'SYNTHETIC';
  const paramIsAssumption = p => p.sourceType === 'USER_ASSUMPTION' || p.applicabilityStatus === 'USER_ASSUMPTION';

     
          
                                                            
                       
                                                                       
                                                     
                           
     
  function areaInfo(a) {
    const layers = Array.isArray(a.layers) ? a.layers : [];
    const declaredTotalHa = a.areaHa;
    const layered = layers.length > 0;
    const incompleteLayers = layered ? layers.filter(L => !Number.isFinite(L.areaHa)).map(L => L.layerId) : [];
    let valueHa = declaredTotalHa, layerSumHa = null;
    const base = {
      layered, declaredTotalHa, layerSumHa: null, incompleteLayers,
      provenanceRegistered: false, geometryVerified: false,
      manual: a.sourceType === 'MANUAL', reason: '', needsTask: null,
    };
    if (layered) {
      if (!a.overlapChecked) return Object.assign(base, { ok: false, reason: '存在分层面积但未声明覆盖与重叠核查（该字段只是用户申报，不证明 GIS 拓扑）', needsTask: 'AREA_OVERLAP_UNCHECKED' });
      if (incompleteLayers.length) return Object.assign(base, { ok: false, reason: '分层面积存在缺失值（' + incompleteLayers.join('、') + '）⇒ 不出全范围面积或结果：缺失分层不得默认按 0 计入', needsTask: 'AREA_LAYER_INCOMPLETE' });
      layerSumHa = layers.reduce((s, L) => s + L.areaHa, 0);
      if (Number.isFinite(declaredTotalHa) && Math.abs(layerSumHa - declaredTotalHa) > 1e-9 * Math.max(Math.abs(layerSumHa), Math.abs(declaredTotalHa), 1)) {
        return Object.assign(base, { layerSumHa, ok: false, reason: '声明总面积 ' + declaredTotalHa + ' ha 与分层之和 ' + layerSumHa + ' ha 不闭合', needsTask: 'AREA_NOT_CLOSED' });
      }
      valueHa = layerSumHa;
    }
    if (!Number.isFinite(valueHa)) return Object.assign(base, { layerSumHa, ok: false, reason: '面积缺失或不合法', needsTask: 'AREA_MISSING' });
    if (valueHa <= 0) return Object.assign(base, { layerSumHa, ok: false, reason: '面积必须大于 0（全无有效覆盖不能输出肯定结果）', needsTask: 'AREA_ZERO' });
    const provenanceRegistered = a.sourceType !== 'MANUAL' && isSha256(a.geometrySha256) && filled(a.crs) && filled(a.algorithm) && filled(a.fileReference);
    return Object.assign(base, { ok: true, valueHa, layerSumHa, provenanceRegistered, geometryVerified: false, needsTask: null });
  }

                                          
  function tasksFor(r) {
    const tasks = [];
    const add = (code, message, blocking) => tasks.push({ code, message, blocking: !!blocking });
    const a = areaInfo(r.area);
    if (!a.ok) add(a.needsTask, a.reason, true);
    else if (!a.provenanceRegistered) add('AREA_PROVENANCE_INCOMPLETE', '面积元数据登记不完整：补充几何摘要、CRS、面积算法与文件出处（改名不再称"几何核验通过"；登记不等于已核验几何）', true);
    const nb = normalizeB(r.biomass), nf = normalizeFC(r.carbonFraction);
    if (!nb.ok) add('B_INVALID', '生物量密度 ' + nb.reason, true);
    else if (Number.isFinite(r.biomass.low) && Number.isFinite(r.biomass.high) && !(r.biomass.low <= r.biomass.value && r.biomass.value <= r.biomass.high)) add('B_ORDER', 'B 的低/参考/高须满足 低 ≤ 参考 ≤ 高；当前顺序不成立 ⇒ 情景范围不再可用（参考值本身不受影响）', false);
    else if (!(Number.isFinite(r.biomass.low) && Number.isFinite(r.biomass.high))) add('B_RANGE_MISSING', '补充 B 的低/高情景取值（用于情景范围与敏感性）', false);
    if (!nf.ok) add('FC_INVALID', '碳分数 ' + nf.reason, true);
    else if (Number.isFinite(r.carbonFraction.low) && Number.isFinite(r.carbonFraction.high) && !(r.carbonFraction.low <= r.carbonFraction.value && r.carbonFraction.value <= r.carbonFraction.high)) add('FC_ORDER', 'f_C 的低/参考/高须满足 低 ≤ 参考 ≤ 高；当前顺序不成立 ⇒ 情景范围不再可用（参考值本身不受影响）', false);
    else if (!(Number.isFinite(r.carbonFraction.low) && Number.isFinite(r.carbonFraction.high))) add('FC_RANGE_MISSING', '补充 f_C 的低/高情景取值（用于情景范围与敏感性）', false);
    [['biomass', 'B', '生物量密度'], ['carbonFraction', 'f_C', '碳分数']].forEach(([k, label, cn]) => {
      const p = r[k];
      if (paramIsSynthetic(p)) { add('SOURCE_LEVEL_' + label, cn + '（' + label + '）的来源等级为 SYNTHETIC ⇒ 不得进入真实情景结果', true); return; }
      if (!sourceLevelCompatible(p)) add('SOURCE_LEVEL_' + label, cn + '（' + label + '）的来源类型与适用性等级不一致（当前 ' + p.sourceType + ' / ' + p.applicabilityStatus + '）⇒ 不得按资料支持处理', true);
      if (!paramSourceComplete(p)) add('SOURCE_' + label, '补充 ' + cn + '（' + label + '）的原始出处并明确适用性等级（UNKNOWN 不算完成）', true);
      else {
        if (!filled(p.pageOrTable)) add('PAGE_' + label, '补充 ' + cn + '（' + label + '）的页码 / 表号', true);
        if (!filled(p.applicableYear)) add('YEAR_' + label, '补充 ' + cn + '（' + label + '）的适用年份 / 时段', true);
        if (!filled(p.region) || !filled(p.species) || !filled(p.ageClass)) add('CONTEXT_' + label, '补充 ' + cn + '（' + label + '）的适用地区 / 物种 / 龄组', true);
        if (!filled(p.basis)) add('BASIS_' + label, '补充 ' + cn + '（' + label + '）的取值依据', true);
      }
    });
    if (r.parcel.parcelId === '' || PLACEHOLDER.test(visibleText(r.parcel.parcelId))) add('PARCEL_ID', '登记地块编号（不得使用占位文字）', true);
    add('AREA_GEOMETRY_NOT_VERIFIED', '面积未被独立几何核验：本模块只登记元数据，不读取几何、不重算面积；只有实际读取边界并独立重算比对才可称已核验', false);
    return tasks;
  }

     
                                             
                                                         
     
  function noRange(reason, codes) {
    return { available: false, ordered: null, reason: reason, tasks: codes || ['RANGE_NOT_APPLICABLE'] };
  }

     
                  
                                                                                            
                                                        
                                                         
                                                                            
                                                      
                                                                
     
  function compute(r) {
    const validation = validateRecord(r);
    if (!validation.ok) throw new Error(validation.errors.join('；'));
    const tasks = tasksFor(r);
    const blocking = tasks.filter(t => t.blocking);
    const a = areaInfo(r.area), nb = normalizeB(r.biomass), nf = normalizeFC(r.carbonFraction);
    const base = {
      objectName: OBJECT_NAME, objectUnit: OBJECT_UNIT, scopeNote: SCOPE,
      includedPools: clone(INCLUDED_POOLS), excludedPools: clone(EXCLUDED_POOLS), excludedLabels: clone(EXCLUDED_LABELS),
      unassessedElements: clone(UNASSESSED_ELEMENTS), unassessedLabels: clone(UNASSESSED_LABELS),
      formula: 'C_AGB [tC] = A [ha] × B [tDM/ha] × f_C',
      polygonNote: '只算 1 个碳库（AGB）；其余碳库与信用核算要素单列，未纳入/未评估。',
      conditional: false, labels: [], tasks, blockingTasks: blocking.map(t => t.code),
      areaProvenanceRegistered: !!a.provenanceRegistered, geometryAreaVerified: false,
    };
    const usable = a.ok && nb.ok && nf.ok;
    if (r.mode === 'SYNTHETIC') {
      const bad = '面积或参数不合法：' + [a.reason, nb.reason, nf.reason].filter(Boolean).join('；');
      const res = usable ? Object.assign(finish(r, a, nb, nf, 'SYNTHETIC'), { mode: MODES.SYNTHETIC }) : { mode: MODES.NO_RESULT, reason: bad, sensitivity: noRange(bad, ['RANGE_INPUT_INVALID']) };
      return Object.assign(base, res, { labels: ['SYNTHETIC'] });
    }
    const anySynthetic = paramIsSynthetic(r.biomass) || paramIsSynthetic(r.carbonFraction);
    if (anySynthetic) {
      const why = '参数含 SYNTHETIC 来源等级（来源类型或适用性等级），不能进入真实情景结果；请改选 SYNTHETIC 演示或替换为真实来源';
      return Object.assign(base, {
        mode: MODES.NO_RESULT,
        reason: why,
        sensitivity: noRange('参数含 SYNTHETIC 来源等级 ⇒ 不出真实情景，也无情景范围。', ['SYNTHETIC_LEVEL_IN_REAL_RECORD']),
        labels: ['SYNTHETIC_LEVEL_IN_REAL_RECORD'],
      });
    }
    if (!usable) {
      const why = '面积或参数缺失/不合法 ⇒ 不出结果：' + [a.reason, nb.reason, nf.reason].filter(Boolean).join('；');
      return Object.assign(base, {
        mode: MODES.NO_RESULT,
        reason: why,
        sensitivity: noRange(why, ['RANGE_INPUT_INVALID']),
        labels: [],
      });
    }
    const anyAssumption = paramIsAssumption(r.biomass) || paramIsAssumption(r.carbonFraction);
    if (anyAssumption) {
      const res = finish(r, a, nb, nf, 'USER_SCENARIO');
      return Object.assign(base, res, {
        mode: MODES.USER_SCENARIO, labels: ['USER_ASSUMPTION'], conditional: true,
        applicabilityNotes: ['本结果含用户显式假设，仅供情景讨论，不得作为真实项目估计，导出标签不得删除。'],
      });
    }
    if (blocking.length === 0 && a.provenanceRegistered) {
      const res = finish(r, a, nb, nf, 'DATA_SUPPORTED');
      const pending = [];
      if (r.biomass.applicabilityStatus === 'LITERATURE_PENDING_APPLICABILITY') pending.push('B');
      if (r.carbonFraction.applicabilityStatus === 'LITERATURE_PENDING_APPLICABILITY') pending.push('f_C');
      return Object.assign(base, res, {
        mode: MODES.DATA_SUPPORTED, conditional: true, labels: ['DATA_SUPPORTED'],
        applicabilityNotes: [].concat(
          pending.length ? ['以下参数只有文献出处、适用性待核（未核实对本区的适用性）：' + pending.join('、')] : [],
          [a.provenanceRegistered && !a.geometryVerified ? '面积为元数据登记（来源类型 / 几何摘要 / CRS / 算法 / 文件出处），未由几何独立重算核验。' : ''],
          tasks.length ? ['存在 ' + tasks.length + ' 项提示任务（不影响参考值，但影响情景范围等附加产出）：' + tasks.map(t => t.code).join('、')] : []),
      });
    }
    const why = '必要字段或来源等级未完成（阻断任务 ' + blocking.length + ' 项）⇒ 不出资料支持结果；请按任务清单补资料';
    return Object.assign(base, {
      mode: MODES.NO_RESULT,
      reason: why,
      sensitivity: noRange(why, blocking.map(t => t.code)),
      labels: [],
    });
  }

  function finish(r, a, nb, nf, tag) {
    if (!a.ok || !nb.ok || !nf.ok) {
      const why = '面积或参数不合法：' + [a.reason, nb.reason, nf.reason].filter(Boolean).join('；');
      return { mode: MODES.NO_RESULT, reason: why, sensitivity: noRange(why, ['RANGE_INPUT_INVALID']) };
    }
    const C = a.valueHa * nb.tPerHa * nf.value;
    if (!(C >= 0) || !Number.isFinite(C)) return { mode: MODES.NO_RESULT, reason: '计算结果非有限或为负', sensitivity: noRange('计算结果非有限或为负 ⇒ 不出情景范围。', ['RANGE_NONFINITE']) };
    return {
      A_ha: a.valueHa, A_layered: !!a.layered, A_sourceType: r.area.sourceType,
      A_declaredTotalHa: a.declaredTotalHa, A_layerSumHa: a.layerSumHa, A_incompleteLayers: a.incompleteLayers,
      areaProvenanceRegistered: !!a.provenanceRegistered, geometryAreaVerified: false,
      B_tDM_per_ha: nb.tPerHa, B_inputUnit: r.biomass.unit, B_conversion: nb.conversion,
      f_C: nf.value,
      C_AGB_tC: C,
      sensitivity: sensitivity(r, a, nb, nf),
      modeTag: tag,
      warnings: [].concat(
        a.provenanceRegistered ? [] : ['面积元数据登记不完整（手工或未登记摘要 / CRS / 算法 / 文件出处）'],
        ['面积未被独立几何核验（geometryAreaVerified=false）：不得声称已由几何或测地面积核验。']),
    };
  }

  function combos(r) {
    const b = r.biomass, f = r.carbonFraction;
    const haveB = Number.isFinite(b.low) && Number.isFinite(b.high);
    const haveF = Number.isFinite(f.low) && Number.isFinite(f.high);
    if (!haveB || !haveF) return null;
    const build = (bval, fval) => {
      const nb = normalizeB({ unit: b.unit, value: bval });
      const nf = normalizeFC({ unit: f.unit, value: fval });
      if (!nb.ok || !nf.ok) return null;
      return { B_tDM_per_ha: nb.tPerHa, f_C: nf.value, C_AGB_tC: nb.tPerHa * nf.value };
    };
    const area = areaInfo(r.area);
    if (!area.ok) return null;
    const mk = (label, bval, fval) => {
      const c = build(bval, fval);
      if (!c) return null;
      return { label, B_tDM_per_ha: c.B_tDM_per_ha, f_C: c.f_C, C_AGB_tC: area.valueHa * c.C_AGB_tC };
    };
    const low = mk('低', b.low, f.low), ref = mk('参考', b.value, f.value), high = mk('高', b.high, f.high);
    if (!low || !ref || !high) return null;
    const ordered = low.C_AGB_tC <= ref.C_AGB_tC && ref.C_AGB_tC <= high.C_AGB_tC;
    return { low, ref, high, ordered, label: '情景范围（低/参考/高参数组合；非置信区间、非误差界）' };
  }

                                                         
  function sensitivity(r, a, nb, nf) {
    const b = r.biomass, f = r.carbonFraction;
    const haveB = Number.isFinite(b.low) && Number.isFinite(b.high);
    const haveF = Number.isFinite(f.low) && Number.isFinite(f.high);
    if (!haveB || !haveF) return { available: false, ordered: null, reason: '缺少低/高情景参数 ⇒ 暂不出情景范围与敏感性；这是补资料任务，不是误差估计。', tasks: [haveB ? null : 'B_RANGE_MISSING', haveF ? null : 'FC_RANGE_MISSING'].filter(Boolean) };
    const bOrderOk = b.low <= b.value && b.value <= b.high;
    const fOrderOk = f.low <= f.value && f.value <= f.high;
    if (!bOrderOk || !fOrderOk) {
      return {
        available: false, ordered: false,
        reason: '低/参考/高顺序不成立（' + [bOrderOk ? null : 'B', fOrderOk ? null : 'f_C'].filter(Boolean).join('、') + '）⇒ 情景范围不可用，也不得把倒置组合冠名为"低/高"；请核对参数上下界，或用独立命名的情景 A/B/C 并给出组合依据。',
        tasks: [bOrderOk ? null : 'B_ORDER', fOrderOk ? null : 'FC_ORDER'].filter(Boolean),
        referenceNote: '参考值（' + nb.tPerHa + ' tDM/ha × ' + nf.value + '）本身不受顺序问题影响，仍按参考值单列展示。',
      };
    }
    const cs = combos(r);
    if (!cs) return { available: false, ordered: null, reason: '低/高组合中含非法单位或数值 ⇒ 不出情景范围。', tasks: ['RANGE_INVALID'] };
    const ref = cs.ref.C_AGB_tC;
    const perturb = (label, c) => ({ label, C_AGB_tC: c.C_AGB_tC, delta_tC: c.C_AGB_tC - ref, delta_frac: ref === 0 ? null : (c.C_AGB_tC - ref) / ref });
    const bu = b.unit === 'kgDM/m2' ? 10 : 1;
    const bLow = { C_AGB_tC: a.valueHa * (b.low * bu) * nf.value };
    const bHigh = { C_AGB_tC: a.valueHa * (b.high * bu) * nf.value };
    const fLow = { C_AGB_tC: a.valueHa * nb.tPerHa * f.low };
    const fHigh = { C_AGB_tC: a.valueHa * nb.tPerHa * f.high };
    const perB = Math.abs(bHigh.C_AGB_tC - bLow.C_AGB_tC);
    const perF = Math.abs(fHigh.C_AGB_tC - fLow.C_AGB_tC);
    return {
      available: true,
      rangeLabel: cs.label,
      combos: [cs.low, cs.ref, cs.high],
      ordered: true,
      orderWarning: '',
      perturbation: [
        Object.assign({ parameter: 'B' }, perturb('B 低', bLow), { note: 'B → 低（其余取参考）' }),
        Object.assign({ parameter: 'B' }, perturb('B 高', bHigh)),
        Object.assign({ parameter: 'f_C' }, perturb('f_C 低', fLow), { note: 'f_C → 低（其余取参考）' }),
        Object.assign({ parameter: 'f_C' }, perturb('f_C 高', fHigh)),
      ],
      dominantParameter: perB >= perF ? 'B' : 'f_C',
      interpretation: '称“情景范围 / 参数敏感性”，非置信区间、误差界或总不确定度；未加入随机分布或 Monte Carlo。',
    };
  }

  function placeholderWarnings(r) {
    const warnings = [];
    const ins = (value, label) => { if (typeof value === 'string' && PLACEHOLDER.test(visibleText(value))) warnings.push(label + '含明显占位文字，请用实际资料补充；本提示不鉴定内容真实性。'); };
    ins(r.parcel.parcelId, '地块编号'); ins(r.parcel.name, '地块名称');
    ['biomass', 'carbonFraction'].forEach(k => { const p = r[k]; ins(p.sourceReference, k + ' 出处'); ins(p.species, k + ' 物种'); ins(p.region, k + ' 地区'); });
    if (typeof r.area.areaHa === 'number' && r.area.areaHa > 0 && !isSha256(r.area.geometrySha256) && r.area.sourceType !== 'MANUAL') warnings.push('面积来源非手工但缺几何摘要，请补登。');
    return warnings;
  }

  function forbiddenScan(text) {
    const hits = [], s = String(text);
    for (const w of ['REMOVAL', 'GOVERNANCE_INCREMENT', 'CARBON_CREDIT', 'tCO2e', 'tCO₂e', '碳信用', '已签发', '库布其全区']) if (s.includes(w)) hits.push(w);
    return hits;
  }

  function buildPackage(record, createdAtUTC) {
    if (!isTimestamp(createdAtUTC)) throw new Error('createdAtUTC 非法');
    const assessment = compute(record);
    if (record.mode === 'SYNTHETIC' && assessment.mode !== MODES.SYNTHETIC) throw new Error('合成情景模式不符');
    const pkg = { schemaVersion: PACKAGE, protocolVersion: PROTOCOL, createdAtUTC, record: clone(record), scenarioSha256: scenarioSha(record), assessment, boundary: clone(BOUNDARY), scopeNote: SCOPE };
                                                                                                                      
    const claimText = canonical({ record: pkg.record, assessment: pkg.assessment });
    if (forbiddenScan(claimText).length) throw new Error('包含禁止表述：' + forbiddenScan(claimText).join('、'));
    pkg.packageSha256 = packageSha(pkg);
    return pkg;
  }

  function verifyPackage(pkg, expectedScenarioSha256) {
    const errors = [];
    try {
      const expected = ['schemaVersion', 'protocolVersion', 'createdAtUTC', 'record', 'scenarioSha256', 'assessment', 'boundary', 'scopeNote', 'packageSha256'];
      if (!plain(pkg) || Object.keys(pkg).length !== expected.length || expected.some(k => !owner(pkg, k))) throw new Error('包键集不符');
      if (pkg.schemaVersion !== PACKAGE || pkg.protocolVersion !== PROTOCOL) errors.push('包协议版本不符');
      const v = validateRecord(pkg.record); if (!v.ok) errors.push(...v.errors);
      if (forbiddenScan(canonical({ record: pkg.record, assessment: pkg.assessment })).length) errors.push('包含禁止表述');
      if (canonical(pkg.boundary) !== canonical(BOUNDARY) || pkg.scopeNote !== SCOPE) errors.push('包的证明范围或禁止项被改写');
      if (v.ok) {
        if (pkg.scenarioSha256 !== scenarioSha(pkg.record)) errors.push('情景内容摘要失配');
        const recomputed = compute(pkg.record);
        if (canonical(pkg.assessment) !== canonical(recomputed)) errors.push('评估结果与规则重算不符（含情景值、标签、未纳入项、未评估要素、任务与真值表判定）');
        if (pkg.record.mode === 'SYNTHETIC' && (!pkg.assessment.labels || pkg.assessment.labels.indexOf('SYNTHETIC') < 0)) errors.push('SYNTHETIC 标签被删除');
        if (pkg.record.mode === 'REAL' && (pkg.assessment.labels || []).indexOf('SYNTHETIC') >= 0) errors.push('真实记录不得带 SYNTHETIC 标签');
                                                 
        const truth = truthTableMode(pkg.record);
        if (pkg.assessment.mode !== truth) errors.push('模式判定不符合真值表：包内 ' + pkg.assessment.mode + ' ≠ 真值表 ' + truth);
        if (pkg.assessment.geometryAreaVerified !== false) errors.push('不得声称已完成几何核验');
        if (pkg.assessment.areaProvenanceRegistered && !areaInfo(pkg.record.area).provenanceRegistered) errors.push('面积登记状态与重算不符');
      }
      if (!isTimestamp(pkg.createdAtUTC)) errors.push('包时间戳非法');
      const body = {}; expected.filter(k => k !== 'packageSha256').forEach(k => body[k] = pkg[k]);
      if (pkg.packageSha256 !== packageSha(body)) errors.push('包内容摘要失配');
      if (expectedScenarioSha256 !== undefined && (!/^local-sha256:[0-9a-f]{64}$/.test(expectedScenarioSha256) || pkg.scenarioSha256 !== expectedScenarioSha256)) errors.push('与外部期望情景摘要不一致');
    } catch (e) { errors.push(e.message); }
    const warnings = [];
    if (expectedScenarioSha256 === undefined) warnings.push('未提供外部可信情景摘要；内部自洽不证明包未被整体替换。');
    if (!errors.length) warnings.push(...placeholderWarnings(pkg.record));
    return { ok: !errors.length, errors: Array.from(new Set(errors)), warnings, matchesExpected: expectedScenarioSha256 === undefined ? null : !errors.length, sourceAuthenticityVerified: false, scopeNote: SCOPE };
  }

                                                      
  function truthTableMode(r) {
    const v = validateRecord(r);
    if (!v.ok) return MODES.NO_RESULT;
    const a = areaInfo(r.area), nb = normalizeB(r.biomass), nf = normalizeFC(r.carbonFraction);
    const usable = a.ok && nb.ok && nf.ok;
    if (r.mode === 'SYNTHETIC') return usable ? MODES.SYNTHETIC : MODES.NO_RESULT;
    if (paramIsSynthetic(r.biomass) || paramIsSynthetic(r.carbonFraction)) return MODES.NO_RESULT;
    if (!usable) return MODES.NO_RESULT;
    if (paramIsAssumption(r.biomass) || paramIsAssumption(r.carbonFraction)) return MODES.USER_SCENARIO;
    const blocking = tasksFor(r).filter(t => t.blocking);
    if (blocking.length === 0 && a.provenanceRegistered) return MODES.DATA_SUPPORTED;
    return MODES.NO_RESULT;
  }

  function syntheticRecord(asOfDate) {
    const r = blankRecord(asOfDate); r.mode = 'SYNTHETIC';
    r.parcel = { parcelId: 'SYNTHETIC-AGB-001', name: '合成 AGB 情景演示（非真实地块）' };
    r.area = { sourceType: 'GEOMETRY_DERIVED', areaHa: 12.5, geometrySha256: 'a'.repeat(64), crs: 'EPSG:4326', algorithm: 'SYNTHETIC 测地面积演示', unitBasis: 'horizontal_ha', object: OBJECT_NAME, fileReference: 'SYNTHETIC', manual: false, overlapChecked: false, layers: [] };
    r.biomass = { parameterId: 'B-SYNTH-1', value: 4.8, low: 3.2, high: 6.4, unit: 'tDM/ha', sourceType: 'SYNTHETIC', sourceReference: 'SYNTHETIC（非真实出处）', pageOrTable: 'n/a', region: '合成', species: '合成示例物种', ageClass: '合成龄组', applicableYear: '2024', basis: '仅用于软件流程测试', applicabilityStatus: 'SYNTHETIC' };
    r.carbonFraction = { parameterId: 'FC-SYNTH-1', value: 0.47, low: 0.45, high: 0.5, unit: 'dimensionless', sourceType: 'SYNTHETIC', sourceReference: 'SYNTHETIC（非真实出处）', pageOrTable: 'n/a', region: '合成', species: '合成示例物种', ageClass: '合成龄组', applicableYear: '2024', basis: '仅用于软件流程测试', applicabilityStatus: 'SYNTHETIC' };
    r.notes = 'SYNTHETIC：仅验证软件计算与流程，不代表真实项目、地块资格或任何可签发碳量。';
    return r;
  }

  return {
    SCHEMA, PROTOCOL, PACKAGE, SCENARIO_DOMAIN, PACKAGE_DOMAIN, OBJECT_NAME, OBJECT_UNIT, MODES, APPLICABILITY,
    SOURCE_TYPES, SOURCE_LEVEL_COMPAT, REQUIRED_PARAM_FIELDS, AREA_SOURCE_TYPES, ALLOWED_B_UNITS,
    INCLUDED_POOLS, EXCLUDED_POOLS, EXCLUDED_LABELS, UNASSESSED_ELEMENTS, UNASSESSED_LABELS, BOUNDARY, SCOPE,
    canonical, hashText, scenarioSha, packageSha, isDate, isTimestamp, isSha256, visibleText, filled,
    blankParam, blankRecord, validateRecord, normalizeB, normalizeFC, sourceLevelCompatible, paramSourceComplete,
    paramIsSynthetic, paramIsAssumption, areaInfo, tasksFor, compute, truthTableMode,
    sensitivity, combos, placeholderWarnings, forbiddenScan, buildPackage, verifyPackage, syntheticRecord,
  };
});
