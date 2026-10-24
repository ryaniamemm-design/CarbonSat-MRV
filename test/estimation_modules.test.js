'use strict';
                                                            
                                           
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const N = require('../web/npp_entry_core.js');
const A = require('../web/agb_core.js');
const DATE = '2026-10-13', STAMP = '2026-10-13T04:00:00.000Z';
const clone = o => JSON.parse(JSON.stringify(o));
const BUNDLE_PATH = path.join(__dirname, '..', 'web', 'npp_estimate_bundle.json');
const PIN_PATH = path.join(__dirname, '..', 'web', 'npp_estimate_bundle.pin.json');
const bundle = () => JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
const pin = () => JSON.parse(fs.readFileSync(PIN_PATH, 'utf8'));
const fileSha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
                                        
const resignBundle = b => { const c = clone(b); delete c.bundleContentSha256; c.bundleContentSha256 = N.contentSha(N.bundleCore(c)); return c; };
                                            
function findZeroArea() {
  const b = bundle();
  for (const k of Object.keys(b.cellYears)) {
    const i = b.cellYears[k].landCover.findIndex(r => r.classValidAreaM2 === 0);
    if (i >= 0) return { key: k, index: i, row: b.cellYears[k].landCover[i] };
  }
  return null;
}

describe('P0 已有 NPP 估算结果入口（v1.1）', function () {
  it('数据包结构通过且覆盖 34 格 / 816 格年 / 1523 地类行', function () {
    const b = bundle();
    assert(N.validateBundle(b).ok, JSON.stringify(N.validateBundle(b).errors));
    assert.equal(b.cells.length, 34);
    assert.equal(Object.keys(b.cellYears).length, 816);
    assert.equal(b.observedClassRows, 1523);
    assert.equal(b.schemaVersion, 'CarbonSat-NppEstimateBundle-v1.1');
  });
  it('已发布 pin（侧车）与数据包文件字节、内容摘要一致', function () {
    const b = bundle(), p = pin();
    assert(N.validatePin(p).ok, JSON.stringify(N.validatePin(p).errors));
    assert.equal(p.bundleFileSha256, fileSha(BUNDLE_PATH), 'pin 登记的字节摘要必须等于盘上文件');
    assert.equal(p.bundleContentSha256, b.bundleContentSha256, 'pin 登记的内容摘要必须等于包内声明');
    const v = N.verifyBundle(b, { pin: p, fileSha256: fileSha(BUNDLE_PATH) });
    assert(v.ok, JSON.stringify(v.errors));
    assert.equal(v.publishedPin.status, 'MATCHED');
  });
  it('格年视图身份与单位分列清楚', function () {
    const b = bundle();
    const d = N.describeCellYear(b, 'cell_0030', 2012);
    assert.equal(d.identity, 'cell_0030 · 2012 · ' + N.OBJECT_NAME + '（tC/yr）');
    assert.equal(d.values.prod_tC_yr.unit, 'tC/yr');
    assert.equal(d.values.prod_tC_yr.value, b.cellYears['cell_0030|2012'].prod_tC_yr);
    assert.equal(d.values.validAreaRatio.unit, '无量纲');
    assert(d.provenance.some(p => p.value === b.generatedFrom.productionIntegral.sha256));
    assert(d.provenance.some(p => p.value === b.generatedFrom.a2ValidFootprint.sha256));
  });
  it('视图摘要稳定且带固定前缀', function () {
    const d1 = N.describeCellYear(bundle(), 'cell_0030', 2012);
    const d2 = N.describeCellYear(bundle(), 'cell_0030', 2012);
    assert.equal(d1.viewSha256, d2.viewSha256);
    assert(/^local-sha256:[0-9a-f]{64}$/.test(d1.viewSha256));
  });
  it('默认不产生跨 2012 增长箭头或增长率，且成因未被断言', function () {
    const s = N.annualSeries(bundle(), 'cell_0030');
    assert.equal(s.growthArrowShown, false);
    assert.equal(s.growthRateShown, false);
    assert.equal(s.governanceEffectShown, false);
    assert(s.note.includes('成因未证实'), s.note);
    assert.equal(s.era1.length, 11);
    assert.equal(s.era2.length, 13);
  });
  it('真实数据中零有效足迹的地类行以 null 呈现"无有效产品值"', function () {
    const z = findZeroArea();
    assert(z, '真实包中应存在零有效面积地类行');
    assert.equal(z.row.prod_tC_yr, null);
    const [cellId, year] = z.key.split('|');
    const d = N.describeCellYear(bundle(), cellId, Number(year));
    const r = d.landCover.find(x => x.lcCode === z.row.lcCode && x.classValidAreaM2 === 0);
    assert(r, '视图中应能找到该零面积行');
    assert.equal(r.noValidProduct, true);
    assert.equal(r.prod_tC_yr, null);
    assert.equal(r.intensity_kg_m2_yr, null);
    assert(r.note.includes('不是真零'));
  });
  it('零有效面积行若被填上数值即被拒（不得把"无产品值"写成 0）', function () {
    const z = findZeroArea();
    const b = bundle();
    b.cellYears[z.key].landCover[z.index].prod_tC_yr = 0;
    const v = N.validateBundle(b);
    assert(!v.ok);
    assert(v.errors.some(e => e.includes('无有效面积却带生产量')));
  });
  it('地类有效面积之和与栅格有效面积不闭合即被拒', function () {
    const b = bundle();
    b.cellYears['cell_0030|2012'].landCover[0].classValidAreaM2 += 1;
    assert(!N.validateBundle(b).ok);
  });
  it('正常年份的 34 格合计完整且有限', function () {
    const t = N.yearFootprintTotal(bundle(), 2012);
    assert.equal(t.complete, true);
    assert(Number.isFinite(t.total_tC));
    assert.equal(t.cellCount, 34);
  });
  it('任一格年缺失时该年合计为空且列出缺失格（失败关闭，不求和不补零）', function () {
    const b = bundle();
    b.cellYears['cell_0030|2012'].prod_tC_yr = null;
    b.cellYears['cell_0030|2012'].integral_kgC_yr = null;
    b.cellYears['cell_0030|2012'].missing = true;
    b.cellYears['cell_0030|2012'].missingReason = '测试用缺测';
    const t = N.yearFootprintTotal(b, 2012, { skipVerify: true });
    assert.equal(t.total_tC, null);
    assert.equal(t.complete, false);
    assert(t.missingCells.some(m => m.cellId === 'cell_0030'));
  });
  it('缺测标志为真却保留数值的矛盾行不可用', function () {
    const b = bundle();
    b.cellYears['cell_0030|2012'].missing = true;
    const t = N.yearFootprintTotal(b, 2012, { skipVerify: true });
    assert.equal(t.complete, false);
    assert(t.missingCells.some(m => /矛盾/.test(m.reason)));
  });
  it('跨断点年度合计也不得拼接（分段由 eraOf 决定）', function () {
    assert.equal(N.eraOf(2011), 1);
    assert.equal(N.eraOf(2012), 2);
    const tot = N.allYearTotals(bundle());
    assert.equal(tot.length, 24);
    assert.equal(tot.filter(t => t.era === 1).length, 11);
    assert.equal(tot.filter(t => t.era === 2).length, 13);
    const y2012 = tot.find(t => t.year === 2012);
    assert.equal(y2012.total_tC, N.yearFootprintTotal(bundle(), 2012).total_tC);
  });

                                     
  it('非有限数值在结构校验失败关闭', function () {
    const b = bundle();
    b.cellYears['cell_0030|2012'].prod_tC_yr = 'x';
    assert(!N.validateBundle(b).ok);
  });
  it('改写边界或声明 REMOVAL / tCO2e 被拒', function () {
    let b = bundle(); b.attributionStatus = 'REMOVAL'; assert(!N.validateBundle(b).ok);
    b = bundle(); b.forbiddenOutputs = ['tCO2e']; assert(!N.validateBundle(b).ok);
    b = bundle(); b.carbonQuantificationStatus = 'PERFORMED'; assert(!N.validateBundle(b).ok);
  });
  it('格年数减少被拒', function () {
    const b = bundle(); delete b.cellYears['cell_0030|2012']; assert(!N.validateBundle(b).ok);
  });
  it('P1-1 反例：把某年数据放到别的年份键下（年份错位）被拒', function () {
    const b = bundle();
    b.cellYears['cell_0030|2013'] = clone(b.cellYears['cell_0030|2012']);
    const v = N.validateBundle(b);
    assert(!v.ok, '键与内容年份不一致必须被拒');
  });

                                             
  it('P1-1 反例 A：只改展示值、不重签导出 ⇒ 核验失败', function () {
    const b = bundle();
    const pack = N.buildExport(b, 'cell_0030', 2012);
    assert(N.verifyExport(pack, { bundle: b }).ok, JSON.stringify(N.verifyExport(pack, { bundle: b }).errors));
    const t = clone(pack); t.displayed.prod_tC_yr.value += 100;
    const v = N.verifyExport(t, { bundle: b });
    assert(!v.ok);
    assert(v.errors.some(e => /未重签|不符/.test(e)));
  });
  it('P1-1 反例 B：改数据包数值、保留原来源摘要与内容摘要 ⇒ 数据包校验失败', function () {
    const b = bundle();
    const before = b.cellYears['cell_0020|2001'].prod_tC_yr;
    b.cellYears['cell_0020|2001'].prod_tC_yr = before + 100;                                  
    const v = N.validateBundle(b);
    assert(!v.ok);
    assert(v.errors.some(e => e.includes('内容摘要不符')) || v.errors.some(e => e.includes('关系不符')));
    assert.throws(() => N.buildExport(b, 'cell_0020', 2001), /拒绝导出/);
  });
  it('P1-1 反例 B2：同步重签内容摘要仍被关系式拦下（协同改写也挡得住）', function () {
    const b = bundle();
    const before = b.cellYears['cell_0020|2001'].prod_tC_yr;
    b.cellYears['cell_0020|2001'].prod_tC_yr = before + 100;
    const r = resignBundle(b);                                 
    const v = N.validateBundle(r);
    assert(!v.ok, '关系式（prod_tC_yr == integral/1000）必须仍然拒绝');
    assert(v.errors.some(e => e.includes('关系不符')), JSON.stringify(v.errors));
  });
  it('P1-1 反例 B3：连地类行一起协同改写，仍与逐类乘积关系不符被拒', function () {
    const b = bundle();
    const cy = b.cellYears['cell_0020|2001'];
    const row = cy.landCover[0];
    row.prod_tC_yr = row.prod_tC_yr + 50;           
    const r = resignBundle(b);
    const v = N.validateBundle(r);
    assert(!v.ok, JSON.stringify(v.errors));
    assert(v.errors.some(e => /逐类|关系不符|地类/.test(e)), JSON.stringify(v.errors));
  });
                                                              
                                          
                                                       
  it('R39 反例：结构未通过 ⇒ 内容摘要记"未评估"，不得冒出 null ≠ null 的不符断言', function () {
    const b = bundle();
    b.cellYears['cell_0020|2001'].integral_kgC_yr = b.cellYears['cell_0020|2001'].integral_kgC_yr * 1.5;
    const v = N.verifyBundle(b, { pin: pin(), fileSha256: fileSha(BUNDLE_PATH) });
    assert(!v.ok, '篡改后必须拒绝');
    assert(!v.structure.ok, '本例应由结构校验拦下');
    assert(v.errors.every(e => !/内容摘要不符：声明 null/.test(e)), JSON.stringify(v.errors));
    assert(v.errors.some(e => /内容摘要未评估/.test(e)), JSON.stringify(v.errors));
    assert(v.content.declared === null && v.content.recomputed === null, '结构失败时摘要两项均未被取到');
                                  
    const c = bundle();
    c.bundleContentSha256 = 'local-sha256:' + '0'.repeat(64);
    const v2 = N.verifyBundle(c, { pin: pin(), fileSha256: fileSha(BUNDLE_PATH) });
    assert(v2.structure.ok, '仅改摘要字段不应破坏结构');
    assert(v2.errors.some(e => /内容摘要不符：声明 local-sha256:0/.test(e)), JSON.stringify(v2.errors));
  });
  it('P1-1 反例 C：把单位声明改成 tCO2e / 库存 ⇒ 被拒', function () {
    const b = bundle();
    const pack = N.buildExport(b, 'cell_0030', 2012);
    const t1 = clone(pack); t1.units = Object.assign({}, t1.units, { prod_tC_yr: ['tCO2e'] });
    assert(!N.verifyExport(t1, { bundle: b }).ok);
    const t2 = clone(pack); t2.displayed.prod_tC_yr.unit = 'tCO2e';
    assert(!N.verifyExport(t2, { bundle: b }).ok);
    const b2 = bundle(); b2.units = Object.assign({}, b2.units, { prod_tC_yr: ['tC'] });
    assert(!N.validateBundle(b2).ok);
  });
  it('P1-1 反例 D：删除地类行 / 改视图摘要不重签 ⇒ 被拒', function () {
    const b = bundle();
    const pack = N.buildExport(b, 'cell_0030', 2012);
    const t1 = clone(pack); t1.view.landCover.pop();
    assert(!N.verifyExport(t1, { bundle: b }).ok);
    const t2 = clone(pack); t2.viewSha256 = 'local-sha256:' + '0'.repeat(64);
    assert(!N.verifyExport(t2, { bundle: b }).ok);
    const t3 = clone(pack); t3.bundleRef.sourceIntegralSha256 = 'f'.repeat(64);
    assert(!N.verifyExport(t3, { bundle: b }).ok);
  });
  it('P1-1 反例 E：协同改写视图 + 摘要重签，仍与数据包交叉重算不符', function () {
    const b = bundle();
    const pack = N.buildExport(b, 'cell_0030', 2012);
    const t = clone(pack);
    t.view.prod_tC_yr += 100;
    t.displayed.prod_tC_yr.value += 100;
    t.viewSha256 = N.viewSha(t.view);
    const body = clone(t); delete body.exportSha256;
    t.exportSha256 = N.exportSha(body);
    const v = N.verifyExport(t, { bundle: b });
    assert(!v.ok, '重签之后仍然必须被交叉重算拦下');
    assert(v.errors.some(e => /与数据包|与数据包重算不符|生产量与数据包不符/.test(e)), JSON.stringify(v.errors));
  });
  it('P1-1 伪来源摘要：包内自写 source.sha256 不构成来源真实性', function () {
    const b = bundle();
    b.generatedFrom.productionIntegral.sha256 = 'a'.repeat(64);
    const v = N.verifyBundle(b);
    assert(!v.ok, '来源摘要被改写必须被拒');
    const pack = N.buildExport(bundle(), 'cell_0030', 2012);
    const ve = N.verifyExport(pack, { bundle: bundle() });
    assert.equal(ve.sourceAuthenticityVerified, false);
    const lvl3 = ve.provenance.find(p => p.level === '③');
    assert(lvl3 && lvl3.status.includes('NOT_LOADED'));
  });
  it('导出核验：合法导出通过，且三级来源证明互不代替', function () {
    const b = bundle();
    const pack = N.buildExport(b, 'cell_0030', 2012, { pin: pin(), fileSha256: fileSha(BUNDLE_PATH) });
    const v = N.verifyExport(pack, { bundle: b, pin: pin(), fileSha256: fileSha(BUNDLE_PATH) });
    assert(v.ok, JSON.stringify(v.errors));
    assert.equal(v.provenance.length, 3);
    assert.equal(pack.verification.sourceFiles.status, 'NOT_LOADED');
    assert(pack.verification.publishedPin.status === 'MATCHED');
    assert.equal(pack.publiclyAnchored, false);
    assert(pack.warning.includes('未上链'));
  });
  it('pin 内容摘要被改 ⇒ 拒绝（MISMATCHED）', function () {
    const b = bundle();
    const p = pin(); p.bundleContentSha256 = 'local-sha256:' + '0'.repeat(64);
    const v = N.verifyBundle(b, { pin: p, fileSha256: fileSha(BUNDLE_PATH) });
    assert(!v.ok);
    assert.equal(v.publishedPin.status, 'MISMATCHED');
  });
  it('视图导出可核验，含禁止表述或篡改被拒', function () {
    const b = bundle();
    const pack = N.buildExport(b, 'cell_0030', 2012);
    assert(N.verifyExport(pack).ok);
    const bad = clone(pack); bad.view.country = 'REMOVAL'; assert(!N.verifyExport(bad).ok);
    const bad2 = clone(pack); bad2.viewSha256 = 'local-sha256:' + '0'.repeat(64); assert(!N.verifyExport(bad2).ok);
    assert.equal(N.forbiddenScan(N.canonical({ cellId: pack.cellId, year: pack.year, view: pack.view, warning: pack.warning })).length, 0);
  });
  it('单位换算与命名辅助函数正确', function () {
    assert.equal(N.m2ToHa(10000), 1);
    assert.equal(N.kgToT(1000), 1);
    assert.equal(N.eraOf(2011), 1);
    assert.equal(N.eraOf(2012), 2);
  });
});

describe('P1 地上生物量碳储量情景试算（v0.2）', function () {
  const dataSupported = () => {
    const r = A.syntheticRecord(DATE);
    r.mode = 'REAL'; r.parcel = { parcelId: 'TEST-AGB-1', name: 'test' };
    r.area = Object.assign({}, r.area, { sourceType: 'EXTERNAL_GIS', manual: false, fileReference: '测试用面积文件（非真实引用）' });
    r.biomass.applicabilityStatus = 'MEASURED_LOCAL'; r.biomass.sourceType = 'MEASURED';
    r.biomass.sourceReference = '本地样地报告（仅测试字符串）'; r.biomass.species = '柠条'; r.biomass.region = '测试区'; r.biomass.ageClass = '5-8 a'; r.biomass.basis = '样地干重';
    r.biomass.pageOrTable = '表 3'; r.biomass.applicableYear = '2024';
    r.carbonFraction.applicabilityStatus = 'LITERATURE_PENDING_APPLICABILITY'; r.carbonFraction.sourceType = 'LITERATURE';
    r.carbonFraction.sourceReference = '文献占位（仅测试字符串）'; r.carbonFraction.species = '柠条'; r.carbonFraction.region = '测试区'; r.carbonFraction.ageClass = '5-8 a'; r.carbonFraction.basis = '文献默认';
    r.carbonFraction.pageOrTable = 'p.12'; r.carbonFraction.applicableYear = '2020';
    return r;
  };
  const resign = p => { const b = clone(p); delete b.packageSha256; b.packageSha256 = 'local-sha256:' + A.hashText(A.PACKAGE_DOMAIN + A.canonical(b)); return b; };

  it('唯一计算式 A×B×f_C 得 28.2 tC', function () {
    const a = A.compute(A.syntheticRecord(DATE));
    assert.equal(a.C_AGB_tC, 28.2);
    assert.equal(a.objectUnit, 'tC');
    assert(a.formula.includes('tDM/ha'));
  });
  it('P2-3 只纳入 AGB；未纳入碳库与未评估信用核算要素分列', function () {
    const a = A.compute(A.syntheticRecord(DATE));
    assert.deepEqual(a.includedPools, ['AGB']);
    ['SOC', 'BGB', 'DEADWOOD', 'LITTER', 'HWP'].forEach(p => assert(a.excludedPools.includes(p), p));
    ['BASELINE', 'LEAKAGE', 'NON_PERMANENCE', 'ADDITIONALITY'].forEach(p => assert(a.unassessedElements.includes(p), p));
                                     
    ['BASELINE', 'LEAKAGE', 'NON_PERMANENCE', 'ADDITIONALITY'].forEach(p => assert(!a.excludedPools.includes(p), p));
    ['SOC', 'BGB', 'DEADWOOD', 'LITTER', 'HWP'].forEach(p => assert(!a.unassessedElements.includes(p), p));
    assert.equal(A.BOUNDARY.creditIssuance, false);
    assert.equal(A.BOUNDARY.netSequestrationClaim, false);
  });
  it('空白情景不出结果并给出具体任务', function () {
    const a = A.compute(A.blankRecord(DATE));
    assert.equal(a.mode, 'NO_RESULT');
    assert(a.tasks.length >= 5);
    assert(a.tasks.every(t => typeof t.message === 'string' && t.message.length > 4));
    assert(a.tasks.every(t => typeof t.code === 'string' && typeof t.blocking === 'boolean'));
  });
  it('缺参数时不给任何估计值', function () {
    const r = dataSupported(); r.biomass.value = null;
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(!('C_AGB_tC' in a));
  });
  it('kgDM/m2 显式按 ×10 折算，混用单位先被拦下', function () {
    const r = dataSupported(); r.biomass.unit = 'kgDM/m2'; r.biomass.value = 0.48; r.biomass.low = 0.32; r.biomass.high = 0.64;
    const a = A.compute(r);
    assert.equal(a.B_tDM_per_ha, 4.8);
    assert(a.B_conversion.includes('×10'));
    assert.equal(a.C_AGB_tC, 28.2);
    const bad = dataSupported(); bad.biomass.unit = 'tC/yr';
    assert(!A.validateRecord(bad).ok);
  });
  it('负值、NaN、非法碳分数被拒，合法 0 保留', function () {
    let r = dataSupported(); r.carbonFraction.value = 0; assert.equal(A.compute(r).mode, 'NO_RESULT');
    r = dataSupported(); r.carbonFraction.value = 1.5; assert.equal(A.compute(r).mode, 'NO_RESULT');
    r = dataSupported(); r.area.areaHa = NaN; assert(!A.validateRecord(r).ok);
    r = dataSupported(); r.area.areaHa = -1; assert(!A.validateRecord(r).ok);
    r = dataSupported(); r.biomass.value = 0; r.biomass.low = 0; assert.equal(A.compute(r).C_AGB_tC, 0);
  });

                               
  it('P1-5 面积登记完整才可进资料支持；几何核验恒为未做', function () {
    const a = A.compute(dataSupported());
    assert.equal(a.mode, 'DATA_SUPPORTED');
    assert.equal(a.areaProvenanceRegistered, true);
    assert.equal(a.geometryAreaVerified, false);
    assert(a.warnings.some(w => w.includes('未被独立几何核验')));
    assert(!('A_verified' in a) && !('areaVerified' in a), '不得再出现"几何核验通过"式命名');
    const geo = a.tasks.find(t => t.code === 'AREA_GEOMETRY_NOT_VERIFIED');
    assert(geo && geo.blocking === false, '几何未核验只能是提示任务，不能阻断参考值');
  });
  it('P1-5 面积缺文件出处 ⇒ 不出资料支持结果（登记不完整）', function () {
    const r = dataSupported(); r.area.fileReference = '';
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert.equal(a.areaProvenanceRegistered, false);
    assert(a.tasks.some(t => t.code === 'AREA_PROVENANCE_INCOMPLETE' && t.blocking));
  });
  it('P1-5 手工面积不得被当作已核验（用户勾选不等于程序核验）', function () {
    const m = dataSupported();
    m.area = { sourceType: 'MANUAL', areaHa: 12.5, geometrySha256: '', crs: '', algorithm: '', unitBasis: 'horizontal_ha', object: A.OBJECT_NAME, fileReference: '', manual: true, overlapChecked: false, layers: [] };
    const a = A.compute(m);
    assert.notEqual(a.mode, 'DATA_SUPPORTED');
    assert.equal(a.geometryAreaVerified, false);
    assert(a.tasks.some(t => t.code === 'AREA_PROVENANCE_INCOMPLETE' || t.code === 'AREA_GEOMETRY_NOT_VERIFIED'));
  });

                                
  it('P1-2 缺失分层面积不得默认 0（已知 10 ha + 未知 null 不求和）', function () {
    const r = dataSupported();
    r.area.overlapChecked = true;
    r.area.layers = [{ layerId: 'L1', areaHa: 10, classLabel: 'a' }, { layerId: 'L2', areaHa: null, classLabel: 'b' }];
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(!('C_AGB_tC' in a));
    assert.equal(a.A_ha, undefined);
    assert(a.tasks.some(t => t.code === 'AREA_LAYER_INCOMPLETE' && t.blocking));
  });
  it('P1-2 分层之和与声明总面积不闭合被拒', function () {
    const r = dataSupported(); r.area.overlapChecked = true;
    r.area.layers = [{ layerId: 'L1', areaHa: 5, classLabel: 'a' }, { layerId: 'L2', areaHa: 9, classLabel: 'b' }];
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(a.tasks.some(t => t.code === 'AREA_NOT_CLOSED' && t.blocking));
  });
  it('分层未声明重叠核查不得求和（该字段只是用户申报）', function () {
    const r = dataSupported();
    r.area.layers = [{ layerId: 'L1', areaHa: 5, classLabel: 'a' }, { layerId: 'L2', areaHa: 5, classLabel: 'b' }];
    r.area.overlapChecked = false;
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(a.tasks.some(t => t.code === 'AREA_OVERLAP_UNCHECKED'));
  });
  it('分层通过核查且闭合后求和', function () {
    const r = dataSupported(); r.area.overlapChecked = true;
    r.area.layers = [{ layerId: 'L1', areaHa: 5, classLabel: 'a' }, { layerId: 'L2', areaHa: 7.5, classLabel: 'b' }];
    assert.equal(A.compute(r).A_ha, 12.5);
  });
  it('分层主键重复被拒', function () {
    const r = dataSupported();
    r.area.layers = [{ layerId: 'L', areaHa: 5, classLabel: 'a' }, { layerId: 'L', areaHa: 5, classLabel: 'b' }];
    assert(!A.validateRecord(r).ok);
  });

                                        
  it('P1-3 必需字段清空不得进入资料支持结果', function () {
    const r = dataSupported();
    [r.biomass, r.carbonFraction].forEach(p => { p.region = ''; p.species = ''; p.ageClass = ''; p.basis = ''; p.pageOrTable = ''; p.applicableYear = ''; });
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(!('C_AGB_tC' in a));
    ['CONTEXT_B', 'BASIS_B', 'PAGE_B', 'YEAR_B', 'CONTEXT_f_C', 'BASIS_f_C', 'PAGE_f_C', 'YEAR_f_C'].forEach(code => assert(a.tasks.some(t => t.code === code && t.blocking), code));
  });
  it('P1-3 sourceType=SYNTHETIC 不得靠适用性下拉升级为真实结果', function () {
    const r = dataSupported();
    r.biomass.sourceType = 'SYNTHETIC'; r.carbonFraction.sourceType = 'SYNTHETIC';
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(!('C_AGB_tC' in a));
    assert(a.labels.includes('SYNTHETIC_LEVEL_IN_REAL_RECORD'));
  });
  it('P1-3 适用性等级为 SYNTHETIC 同样不得进入真实结果', function () {
    const r = dataSupported(); r.biomass.applicabilityStatus = 'SYNTHETIC';
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(a.labels.includes('SYNTHETIC_LEVEL_IN_REAL_RECORD'));
  });
  it('P1-3 来源类型与适用性等级不一致被拒', function () {
    const r = dataSupported();
    r.biomass.sourceType = 'MEASURED'; r.biomass.applicabilityStatus = 'LITERATURE_PENDING_APPLICABILITY';
    const a = A.compute(r);
    assert.equal(a.mode, 'NO_RESULT');
    assert(a.tasks.some(t => t.code === 'SOURCE_LEVEL_B' && t.blocking));
  });
  it('P1-3 UNKNOWN 适用性不算完成', function () {
    const r = dataSupported(); r.biomass.applicabilityStatus = 'UNKNOWN';
    assert.notEqual(A.compute(r).mode, 'DATA_SUPPORTED');
  });
  it('P1-3 用户假设降级为 USER_SCENARIO 并传递标签', function () {
    const r = dataSupported();
    r.biomass.sourceType = 'USER_ASSUMPTION'; r.biomass.applicabilityStatus = 'USER_ASSUMPTION';
    const a = A.compute(r);
    assert.equal(a.mode, 'USER_SCENARIO');
    assert(a.labels.includes('USER_ASSUMPTION'));
    assert.equal(a.conditional, true);
  });
  it('P1-3 仅有文献出处时只称"已登记、适用性待核"', function () {
    const a = A.compute(dataSupported());
    assert.equal(a.mode, 'DATA_SUPPORTED');
    assert(a.applicabilityNotes.some(n => n.includes('适用性待核')), JSON.stringify(a.applicabilityNotes));
  });
  it('P1-3 真值表与 compute 判定一致（含边界记录）', function () {
    const rs = [
      A.syntheticRecord(DATE), A.blankRecord(DATE), dataSupported(),
      (() => { const r = dataSupported(); r.biomass.sourceType = 'SYNTHETIC'; return r; })(),
      (() => { const r = dataSupported(); r.biomass.sourceType = 'USER_ASSUMPTION'; r.biomass.applicabilityStatus = 'USER_ASSUMPTION'; return r; })(),
      (() => { const r = dataSupported(); r.biomass.low = 9; r.biomass.high = 1; return r; })(),
    ];
    rs.forEach((r, i) => assert.equal(A.compute(r).mode, A.truthTableMode(r), 'record #' + i));
  });
  it('P1-3 阻断任务与提示任务分类明确', function () {
    const r = dataSupported(); r.biomass.low = 9; r.biomass.high = 1;
    const a = A.compute(r);
    const order = a.tasks.find(t => t.code === 'B_ORDER');
    const geo = a.tasks.find(t => t.code === 'AREA_GEOMETRY_NOT_VERIFIED');
    assert(order && order.blocking === false);
    assert(geo && geo.blocking === false);
    assert.deepEqual(a.blockingTasks, []);
    assert.equal(a.mode, 'DATA_SUPPORTED');
  });
  it('NO_RESULT 也必须带明确范围判定（available=false，非缺字段）', function () {
    const blocked = dataSupported(); blocked.parcel.parcelId = '';
    assert.equal(A.compute(blocked).mode, 'NO_RESULT');
    assert.strictEqual(A.compute(blocked).sensitivity.available, false);
    const blank = A.compute(A.blankRecord(DATE));
    assert.strictEqual(blank.sensitivity.available, false);
  });

                        
  it('P2-1 低/高倒置 ⇒ 范围不可用、保留参考值、不再冠名低/高', function () {
    const r = dataSupported(); r.biomass.low = 6; r.biomass.high = 3;
    const a = A.compute(r);
    assert.equal(a.mode, 'DATA_SUPPORTED');
    assert.equal(a.C_AGB_tC, 28.2, '参考值本身不受顺序问题影响');
    const s = a.sensitivity;
    assert.equal(s.available, false);
    assert.equal(s.ordered, false);
    assert(s.reason.includes('不得把倒置组合冠名为'));
    assert(s.tasks.includes('B_ORDER'));
    assert(!s.combos, '不得输出低/高组合');
    assert(!('rangeLabel' in s) || !s.rangeLabel || !s.rangeLabel.includes('低'));
  });
  it('P2-1 f_C 倒置同样不出范围', function () {
    const r = dataSupported(); r.carbonFraction.low = 0.9; r.carbonFraction.high = 0.1;
    const s = A.compute(r).sensitivity;
    assert.equal(s.available, false);
    assert(s.tasks.includes('FC_ORDER'));
  });
  it('缺低/高不出情景范围（补资料任务，不是误差估计）', function () {
    const r = dataSupported(); r.biomass.low = null; r.biomass.high = null;
    const s = A.compute(r).sensitivity;
    assert.equal(s.available, false);
    assert(s.tasks.includes('B_RANGE_MISSING'));
    assert(s.reason.includes('不是误差估计'));
  });
  it('情景范围与单参数扰动可用且措辞正确（非置信区间、无 Monte Carlo）', function () {
    const s = A.compute(dataSupported()).sensitivity;
    assert(s.available);
    assert.equal(s.combos.length, 3);
    assert.equal(s.perturbation.length, 4);
    assert(['B', 'f_C'].includes(s.dominantParameter));
    assert(s.rangeLabel.includes('非置信区间'));
    assert(s.interpretation.includes('Monte Carlo'));
  });

                        
  it('包摘要稳定，改情景值/边界/未纳入项/未评估要素/协议均被拒', function () {
    const p = A.buildPackage(A.syntheticRecord(DATE), STAMP);
    assert(A.verifyPackage(p).ok);
    assert.equal(p.schemaVersion, 'CarbonSat-AgbScenarioPackage-v0.2');
    assert.equal(p.protocolVersion, 'CarbonSat-AgbScenarioRules-v0.2');
    let t = clone(p); t.assessment.C_AGB_tC = 999; assert(!A.verifyPackage(t).ok);
    t = clone(p); t.boundary.creditIssuance = true; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.assessment.excludedPools = []; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.assessment.unassessedElements = []; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.assessment.geometryAreaVerified = true; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.assessment.blockingTasks = []; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.assessment.tasks = [{ code: 'FAKE', message: '伪造任务' }]; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.protocolVersion = 'other'; assert(!A.verifyPackage(resign(t)).ok);
    t = clone(p); t.scopeNote = '已核真'; assert(!A.verifyPackage(resign(t)).ok);
  });
  it('协同重签也不能把非法语义洗成合法包', function () {
    const r = dataSupported();
    r.biomass.sourceType = 'SYNTHETIC'; r.biomass.applicabilityStatus = 'SYNTHETIC';
    const q = A.buildPackage(r, STAMP);
    assert.equal(q.assessment.mode, 'NO_RESULT');
    const t = clone(q); t.assessment.mode = 'DATA_SUPPORTED'; t.assessment.labels = ['DATA_SUPPORTED'];
    const v = A.verifyPackage(resign(t));
    assert(!v.ok);
    assert(v.errors.some(e => /重算不符|真值表/.test(e)), JSON.stringify(v.errors));
  });
  it('外部可信摘要拒绝整体合法替换，无摘要必有替换风险警示', function () {
    const original = A.buildPackage(A.syntheticRecord(DATE), STAMP);
    const r = A.syntheticRecord(DATE); r.parcel.name += ' replacement';
    const repl = A.buildPackage(r, STAMP);
    assert(A.verifyPackage(repl).ok);
    assert(!A.verifyPackage(repl, original.scenarioSha256).ok);
    assert(A.verifyPackage(original, original.scenarioSha256).ok);
    assert(A.verifyPackage(original).warnings.some(w => w.includes('整体替换')));
  });
  it('SYNTHETIC 不能仅改模式升级为真实情景', function () {
    const p = clone(A.buildPackage(A.syntheticRecord(DATE), STAMP));
    p.record.mode = 'REAL'; assert(!A.verifyPackage(resign(p)).ok);
    const r = A.syntheticRecord(DATE); r.mode = 'REAL'; assert(!A.validateRecord(r).ok);
  });
  it('导出模板不会产生 REMOVAL / 碳信用 / tCO2e', function () {
    const p = A.buildPackage(dataSupported(), STAMP);
    assert.equal(A.forbiddenScan(A.canonical({ record: p.record, assessment: p.assessment })).length, 0);
    const r = A.syntheticRecord(DATE); r.notes = '本情景可用于碳信用 REMOVAL';
    assert.throws(() => A.buildPackage(r, STAMP));
  });
  it('改写参数来源等级会改变情景摘要（来源等级不可静默变更）', function () {
    const r1 = dataSupported();
    const r2 = clone(r1); r2.biomass.applicabilityStatus = 'LITERATURE_PENDING_APPLICABILITY';
    assert.notEqual(A.scenarioSha(r1), A.scenarioSha(r2));
  });
});
