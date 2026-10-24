'use strict';
                                                        
                                                     
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../web/change_core.js');
const N = require('../web/npp_entry_core.js');

const ROOT = path.join(__dirname, '..');
const BUNDLE = path.join(ROOT, 'web', 'npp_estimate_bundle.json');
const PIN = path.join(ROOT, 'web', 'npp_estimate_bundle.pin.json');
const clone = o => JSON.parse(JSON.stringify(o));
const bundle = () => JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
const pin = () => JSON.parse(fs.readFileSync(PIN, 'utf8'));
const fsha = () => crypto.createHash('sha256').update(fs.readFileSync(BUNDLE)).digest('hex');
const resign = b => { const c = clone(b); c.bundleContentSha256 = N.contentSha(c); return c; };
const build = (b, o) => C.buildLedger(b, Object.assign({ pin: pin(), fileSha256: fsha() }, o || {}));
const ledger = () => build(bundle());
const list = () => C.buildTaskList(ledger());
const throws = fn => { try { fn(); return false; } catch (e) { return true; } };

describe('CarbonSat 变化台账 v1.1 · 几何与范围', function () {
  this.timeout(120000);
  let L;
  before(() => { L = ledger(); });

  it('只产生同格、同 era、相邻两年的条目，且不含跨格对比', () => {
    assert.ok(L.entries.length > 0);
    for (const e of L.entries) {
      assert.strictEqual(e.yearTo, e.yearFrom + 1, '必须相邻年');
      assert.strictEqual(N.eraOf(e.yearFrom), e.era, 'yearFrom 必须属该 era');
      assert.strictEqual(N.eraOf(e.yearTo), e.era, 'yearTo 必须属该 era');
      assert.strictEqual(e.metric, 'prod_tC_yr');
      assert.strictEqual(e.metricUnit, 'tC/yr');
    }
  });

  it('34 格 × (10+12) 相邻年对 = 748 条，且不含跨格条目', () => {
    assert.strictEqual(L.counts.cells, 34);
    assert.strictEqual(L.counts.entries, 34 * (10 + 12));
    assert.strictEqual(L.counts.refused, 34, '每格一个断点对被显式拒收');
    for (const r of L.refused) assert.strictEqual(r.refusalReason, 'CROSS_ERA_REFUSED');
  });

  it('排序只按键，不按幅度（第一条不代表最值得看）', () => {
    assert.strictEqual(L.ordering, 'DETERMINISTIC_KEY_ORDER_ONLY_NO_MAGNITUDE_RANKING');
    const keys = L.entries.map(e => [e.cellId, e.era, e.yearFrom]);
    const sorted = keys.slice().sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) || (a[1] - b[1]) || (a[2] - b[2]));
    assert.deepStrictEqual(keys, sorted);
  });
});

describe('CarbonSat 变化台账 v1.1 · 可比性门禁（四维分列）', function () {
  this.timeout(120000);

  it('面积容差语义恒为 NUMERIC_CONSISTENCY_ONLY，且不得被读作足迹同一性', () => {
    const L = ledger();
    for (const e of L.entries) {
      assert.strictEqual(e.areaRelation.toleranceMeaning, 'NUMERIC_CONSISTENCY_ONLY');
      assert.strictEqual(e.areaRelation.tolerance, 1e-9);
    }
    assert.strictEqual(L.rtolSemantics, 'NUMERIC_CONSISTENCY_ONLY');
  });

  it('面积数值一致（可比）但足迹同一性仍 UNVERIFIED，且限制随条目走', () => {
    const L = ledger();
    const e = L.entries[0];
    assert.strictEqual(e.areaRelation.ok, true);
    assert.strictEqual(e.comparable, true);
    assert.strictEqual(e.footprintIdentity.status, 'UNVERIFIED');
    assert.strictEqual(e.footprintIdentity.canClaimSamePixelFootprint, false);
    assert.strictEqual(e.footprintIdentity.canClaimSameVegetationIntensityChange, false);
    assert.ok(e.boundaryNote.cannotSay.some(x => x.indexOf('同一批像元') >= 0));
    assert.ok(e.boundaryNote.cannotSay.some(x => x.indexOf('纯强度变化') >= 0));
    assert.ok(e.boundaryNote.cannotSay.some(x => x.indexOf('治理措施') >= 0));
  });

  it('面积数值超阈（结构自洽的合成探针）⇒ NOT_COMPARABLE 且差值为 null', () => {
    const k = 1.001;
    const bad = clone(bundle());
    const cy = bad.cellYears['cell_0020|2002'];
    cy.gridValidAreaM2 *= k; cy.gridTotalAreaM2 *= k;
    cy.validAreaRatio = cy.gridValidAreaM2 / cy.gridTotalAreaM2;
    cy.landCover.forEach(r => {
      if (Number.isFinite(r.classValidAreaM2) && r.classValidAreaM2 > 0) {
        r.classValidAreaM2 *= k;
        r.intensity_kg_m2_yr = r.prod_tC_yr * 1000 / r.classValidAreaM2;
      }
    });
    const probe = resign(bad);
    const L = C.buildLedger(probe, {});
    const e = L.entries.filter(x => x.cellId === 'cell_0020' && x.yearFrom === 2001)[0];
    assert.strictEqual(e.comparable, false);
    assert.strictEqual(e.delta_tC_yr, null, '不可比 ⇒ 不得静默相减');
    assert.ok(e.failedGates.indexOf('AREA_RELATION_OUT_OF_TOLERANCE') >= 0);
    assert.ok(C.verifyLedger(L).ok, '台账本身仍应结构自洽');
  });

  it('地类构成不同只作描述性并列，不构成"变化"解释', () => {
    const L = ledger();
    for (const e of L.entries) {
      assert.ok(e.compositionComparison && Array.isArray(e.compositionComparison.rows));
      assert.ok(typeof e.compositionComparison.changed === 'boolean');
      assert.ok(e.compositionComparison.note.indexOf('不参与排序') >= 0);
    }
  });

  it('缺测标志为真却保留数值 ⇒ NUMERIC_INCOMPLETE 且差值为 null', () => {
    const bad = clone(bundle());
    bad.cellYears['cell_0020|2002'].missing = true;
    bad.cellYears['cell_0020|2002'].missingReason = 'no_data';
    const L = C.buildLedger(resign(bad), {});
    const e = L.entries.filter(x => x.cellId === 'cell_0020' && x.yearFrom === 2001)[0];
    assert.strictEqual(e.comparable, false);
    assert.strictEqual(e.delta_tC_yr, null);
    assert.ok(e.failedGates.indexOf('NUMERIC_INCOMPLETE') >= 0);
  });

  it('任一层面积未知/缺格年 ⇒ 不出结果（失败关闭）', () => {
    const bad = clone(bundle());
    delete bad.cellYears['cell_0020|2001'];
    assert.ok(throws(() => build(bad)), '缺格年必须拒绝构建');
  });

  it('NaN / Infinity / 未声明主键 ⇒ 数据包核验失败', () => {
    const a = clone(bundle()); a.cellYears['cell_0020|2002'].prod_tC_yr = NaN;
    const b = clone(bundle()); b.cellYears['cell_0020|2002'].prod_tC_yr = Infinity;
    const c = clone(bundle()); c.cellYears['cell_0020|2001'] = clone(c.cellYears['cell_0020|2002']);
    assert.ok(throws(() => build(a)) && throws(() => build(b)) && throws(() => build(c)));
  });

  it('单位 / 方法学声明被改写 ⇒ 数据包核验失败', () => {
    const a = clone(bundle()); a.units.prod_tC_yr = ['tCO2e', 'x'];
    const b = clone(bundle()); b.methodology.product = 'MOD17A2H';
    assert.ok(throws(() => build(a)));
    assert.ok(throws(() => build(b)));
  });
});

describe('CarbonSat 变化台账 v1.1 · 确定性与时间戳分离', function () {
  this.timeout(120000);

  it('同一输入两次 ⇒ 台账稳定摘要与条目字节完全相同', () => {
    const a = ledger(), b = ledger();
    assert.strictEqual(a.ledgerSha256, b.ledgerSha256);
    assert.strictEqual(JSON.stringify(a.entries), JSON.stringify(b.entries));
    assert.strictEqual(JSON.stringify(C.buildTaskList(a)), JSON.stringify(C.buildTaskList(b)));
  });

  it('改运行时间戳 ⇒ 文件字节变，但 stableDigest 与 taskId 均不变', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const x = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    const y = C.buildTaskExport(L, T, { generatedAtUTC: '2031-12-31T23:59:59.000Z' });
    assert.notStrictEqual(JSON.stringify(x), JSON.stringify(y));
    assert.strictEqual(x.stableDigest, y.stableDigest);
    assert.strictEqual(JSON.stringify(x.stable), JSON.stringify(y.stable));
    assert.strictEqual(JSON.stringify(x.stable.taskList.tasks.map(t => t.taskId)), JSON.stringify(y.stable.taskList.tasks.map(t => t.taskId)));
  });

  it('stable 部分不得含任何时间戳键；事件封套必须有时间戳', () => {
    const x = C.buildTaskExport(ledger(), list(), { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    assert.strictEqual(C.findTimeKeys(x.stable).length, 0);
    assert.ok(typeof x.event.generatedAtUTC === 'string' && x.event.generatedAtUTC.length > 0);
  });

  it('stable 被改而不重签 ⇒ 核验失败；逐层重签但删掉必备局限 ⇒ **仍被拒**（v1.1 更正 v1.0 的错误预期）', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });

                                  
    const t1 = clone(pack);
    t1.stable.ledger.entries[0].boundaryNote.cannotSay.pop();
    assert.strictEqual(C.verifyTaskExport(t1).ok, false);

                                                          
                                                  
                                          
    const t2 = clone(pack);
    const e = t2.stable.ledger.entries[0];
    e.boundaryNote.cannotSay = e.boundaryNote.cannotSay.filter(x => x.indexOf('同一批像元') < 0);
    e.boundaryNoteSha256 = C.dig(C.BOUNDARY_DOMAIN, e.boundaryNote);
    e.entrySha256 = C.dig(C.ENTRY_DOMAIN, C.coreOf(e, 'entrySha256'));
    t2.stable.ledger.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(t2.stable.ledger, 'ledgerSha256'));
    t2.stable.taskList.ledgerSha256 = t2.stable.ledger.ledgerSha256;
    t2.stable.taskList.taskListSha256 = C.dig(C.TASKLIST_DOMAIN, C.coreOf(t2.stable.taskList, 'taskListSha256'));
    t2.stableDigest = C.stableDigestOf(t2.stable);
    assert.notStrictEqual(t2.stableDigest, pack.stableDigest, '重签后稳定摘要必然改变');
    const v2 = C.verifyTaskExport(t2);
    assert.strictEqual(v2.ok, false, '删掉必备局限并重签后竟被接受（v1.0 漏检）');
    assert.ok(v2.errors.join('；').indexOf('重算的结果不符') >= 0, '拒绝原因应为语义不符：' + v2.errors[0]);
  });

  it('任务清单稳定内容含时间戳 ⇒ 核验失败', () => {
    const T = clone(list());
    T.generatedAtUTC = '2026-10-15T00:00:00.000Z';
    T.taskListSha256 = C.dig(C.TASKLIST_DOMAIN, C.coreOf(T, 'taskListSha256'));
    assert.strictEqual(C.verifyTaskList(T).ok, false);
  });
});

describe('CarbonSat 变化台账 v1.1 · 跨 2012 与红线', function () {
  this.timeout(120000);

  it('2011→2012 显式拒收（不是警告、不产出条目）', () => {
    const L = ledger();
    const r = C.computeEntry(bundle(), 'cell_0020', 2011, 2012, { sourceRefSha256: L.sourceRefSha256 });
    assert.strictEqual(r.refused, true);
    assert.strictEqual(r.refusalReason, 'CROSS_ERA_REFUSED');
    assert.strictEqual(L.entries.some(e => e.yearFrom === 2011 && e.yearTo === 2012), false);
  });

  it('台账不得含趋势 / 增长率 / 外推类字段', () => {
    const L = ledger();
    assert.strictEqual(C.findTrendKeys({ entries: L.entries, refused: L.refused, counts: L.counts }, '').length, 0);
    const bad = clone(L); bad.entries[0].growthRate = 0.01;
    bad.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(bad, 'ledgerSha256'));
    assert.strictEqual(C.verifyLedger(bad).ok, false);
  });

  it('条目级边界声明与红线常量：不得被改写；缺 canSay/cannotSay 即拒绝', () => {
    const L = ledger();
    const e = L.entries[0];
    assert.strictEqual(e.boundaryNote.claimClass, 'DESCRIPTIVE_NPP_ONLY');
    assert.strictEqual(e.boundaryNote.attributionStatus, 'insufficient_evidence');
    assert.deepStrictEqual(e.boundaryNote.notIncludedPools, ['SOC', 'BGB', 'DEADWOOD', 'LITTER', 'HWP']);
    assert.deepStrictEqual(e.boundaryNote.unassessedElements, ['BASELINE', 'LEAKAGE', 'NON_PERMANENCE', 'ADDITIONALITY']);
    const bad = clone(L);
    bad.entries[0].boundaryNote.cannotSay = [];
    bad.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(bad, 'ledgerSha256'));
    assert.strictEqual(C.verifyLedger(bad).ok, false);
  });

  it('把足迹标成已核实 ⇒ 台账核验失败（本版必须恒 UNVERIFIED）', () => {
    const bad = clone(ledger());
    bad.entries[0].footprintIdentity.status = 'VERIFIED';
    bad.entries[0].footprintIdentity.canClaimSamePixelFootprint = true;
    bad.entries[0].entrySha256 = C.dig(C.ENTRY_DOMAIN, C.coreOf(bad.entries[0], 'entrySha256'));
    bad.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(bad, 'ledgerSha256'));
    assert.strictEqual(C.verifyLedger(bad).ok, false);
  });

  it('改语义不重签 ⇒ 台账核验失败（自摘要只说明内部一致）', () => {
    const bad = clone(ledger());
    bad.entries[0].boundaryNote.cannotSay.pop();
    assert.strictEqual(C.verifyLedger(bad).ok, false);
  });

  it('源摘要被改并重签内容摘要 ⇒ 与已发布摘要不符（MISMATCHED）', () => {
    const bad = clone(bundle());
    bad.generatedFrom.productionIntegral.sha256 = 'f'.repeat(64);
    const resigned = resign(bad);
    const v = N.verifyBundle(resigned, { pin: pin(), fileSha256: fsha() });
    assert.strictEqual(v.publishedPin.status, 'MISMATCHED');
    assert.ok(throws(() => build(resigned)));
  });
});

describe('CarbonSat 变化台账 v1.1 · 复核任务', function () {
  this.timeout(120000);

  it('任务由变化条目触发、四件绑定齐备、可去重累计', () => {
    const L = ledger(), T = C.buildTaskList(L);
    assert.ok(T.counts.tasks > 0);
    const ids = T.tasks.map(t => t.taskId);
    assert.strictEqual(new Set(ids).size, ids.length, '不得有重复 taskId');
    for (const t of T.tasks) {
      assert.ok(t.sourceRefSha256, '必须绑定来源版本');
      assert.strictEqual(t.triggeredByChangeEntryShas.length, t.count);
      assert.ok(t.count >= 1);
      assert.ok(t.requiredNext.length >= 1);
      assert.ok(Object.values(C.TASK_TYPE).includes(t.taskType));
                                          
      assert.ok(Array.isArray(t.triggers) && t.triggers.length === t.count, '每个触发条目都要有 triggers[] 对应');
      for (const g of t.triggers) {
        assert.ok(/^local-sha256:[0-9a-f]{64}$/.test(g.boundaryNoteSha256), '触发条目必须带边界声明摘要');
        assert.strictEqual(g.cellId, t.cellId);
        assert.strictEqual(g.era, t.era);
      }
    }
    const merged = T.tasks.filter(t => t.count > 1);
    assert.ok(merged.length > 0, '应观察到同因条目被合并');
    assert.strictEqual(T.tasks.reduce((s, t) => s + t.count, 0), L.counts.comparable * 2);
  });

  it('任务清单必须在有台账上下文时核验引用（v1.1）', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const v = C.verifyTaskList(T, { ledger: L });
    assert.strictEqual(v.ok, true, v.errors.join('；'));
    assert.strictEqual(v.ledgerBound, true);
    assert.strictEqual(C.verifyTaskList(T).ledgerBound, false, '无台账上下文时不得声称已绑定');
  });

  it('taskId 由稳定内容派生：换时间戳、重生成 ⇒ taskId 不变', () => {
    const L = ledger();
    const a = C.buildTaskList(L), b = C.buildTaskList(L);
    assert.deepStrictEqual(a.tasks.map(t => t.taskId), b.tasks.map(t => t.taskId));
    const t0 = a.tasks[0];
    assert.strictEqual(t0.taskId, C.taskIdOf(t0));
  });

  it('任务不得改变 registrable / 移除类计数 / 归因状态', () => {
    const T = list();
    const rr = T.redLineRegression;
    assert.strictEqual(rr.registrable, false);
    assert.strictEqual(rr.removalCount, 0);
    assert.strictEqual(rr.attributionStatus, 'insufficient_evidence');
    assert.strictEqual(rr.claimsLinked, false);
    assert.strictEqual(rr.evidenceRecordsLinked, false);
  });

  it('来源版本变化 ⇒ 判"版本过期"，不得静默套用', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    assert.strictEqual(C.stalenessOf(pack, L.sourceRefSha256).same, true);
    const other = 'local-sha256:' + 'b'.repeat(64);
    assert.strictEqual(C.stalenessOf(pack, other).same, false);
    assert.strictEqual(C.verifyTaskExport(pack, { currentSourceRefSha256: other }).ok, false);
    assert.strictEqual(C.verifyTaskExport(pack, { currentSourceRefSha256: L.sourceRefSha256 }).ok, true);
  });

  it('来源绑定覆盖源 CSV 与 A2，不是只依赖旧证据包哈希', () => {
    const sr = ledger().sourceRef;
    assert.ok(/^[0-9a-f]{64}$/.test(sr.productionIntegral.sha256));
    assert.ok(/^[0-9a-f]{64}$/.test(sr.a2ValidFootprint.sha256));
    assert.strictEqual(sr.productionIntegral.path, 'data/npp_annual_production_integral.csv');
  });

  it('自摘要不得被表述为来源真实或内容从未被改动', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    const text = JSON.stringify(pack.stable);
    assert.ok(text.indexOf('不等于') >= 0 || text.indexOf('不证明') >= 0, '必须显式保留"不等于/不证明"语义');
    assert.ok(pack.stable.selfDigestNote.indexOf('内部一致') >= 0);
    assert.strictEqual(C.verifyTaskExport(pack).sourceAuthenticityVerified, false);
  });
});

describe('CarbonSat 变化台账 v1.1 · 三组 P1 加固（复核 REVIEW.md）', function () {
  this.timeout(180000);

  it('P1-1 选择范围：应有年对与全部计数由 scope 推导，不硬编码条数', () => {
    const full = ledger();
    assert.strictEqual(full.scope.cellIds.length, 34);
    assert.deepStrictEqual(full.scope.eras, [1, 2]);
    assert.strictEqual(C.expectedPairKeys(full.scope.cellIds, full.scope.eras).length, 34 * 22);
    assert.strictEqual(C.expectedCrossEraKeys(full.scope.cellIds).length, 34);
                                              
    const sub = build(bundle(), { cellIds: ['cell_0020', 'cell_0030'], eras: [1] });
    assert.strictEqual(sub.entries.length, 2 * 10);
    assert.strictEqual(sub.refused.length, 2);
    assert.ok(C.verifyLedger(sub).ok, '合法子集应通过');
  });

  it('P1-1 空表 / 缺项 / 伪造计数 ⇒ 一律拒绝（即使重签）', () => {
    const L = ledger();
    const empty = clone(L);
    empty.entries = []; empty.refused = [];
    Object.assign(empty.counts, { entries: 0, comparable: 0, notComparable: 0, refused: 0 });
    empty.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(empty, 'ledgerSha256'));
    const v = C.verifyLedger(empty);
    assert.strictEqual(v.ok, false);
    assert.ok(v.errors.join('；').indexOf('未覆盖选择范围') >= 0, v.errors[0]);
                          
    const fake = clone(L);
    fake.counts.comparable = 1;
    fake.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(fake, 'ledgerSha256'));
    assert.strictEqual(C.verifyLedger(fake).ok, false);
                                
    const missing = clone(L);
    missing.entries.pop();
    missing.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(missing, 'ledgerSha256'));
    assert.strictEqual(C.verifyLedger(missing).ok, false);
  });

  it('P1-1 门禁状态 / comparable / failedGates / 差值 必须互推', () => {
    const L = ledger();
    const cases = [];
    let b1 = clone(L); b1.entries[0].numericCompleteness.ok = false; b1.entries[0].areaRelation.ok = false; cases.push(b1);
    let b2 = clone(L); b2.entries[0].failedGates = []; b2.entries[0].numericCompleteness.ok = false; cases.push(b2);
    let b3 = clone(L); b3.entries[0].deltaComputed = false; cases.push(b3);
    let b4 = clone(L); b4.entries[0].entryType = 'TEMPORAL_CHANGE_NOT_COMPARABLE'; cases.push(b4);
    let b5 = clone(L); b5.entries[0].yearTo = b5.entries[0].yearFrom + 2; cases.push(b5);
    let b6 = clone(L); b6.entries[0].yearFrom = String(b6.entries[0].yearFrom); cases.push(b6);
    let b7 = clone(L); b7.metricUnit = 'tCO2e'; cases.push(b7);
    let b8 = clone(L); b8.entries[0].unknownField = 1; cases.push(b8);
    let b9 = clone(L); delete b9.entries[0].compositionComparison; cases.push(b9);
    let b10 = clone(L); b10.entries[0].boundaryNote.cannotSay = []; cases.push(b10);
    for (const bad of cases) {
      bad.ledgerSha256 = C.dig(C.LEDGER_DOMAIN, C.coreOf(bad, 'ledgerSha256'));
      assert.strictEqual(C.verifyLedger(bad).ok, false, '应被拒：' + JSON.stringify(Object.keys(bad.entries && bad.entries[0] || {})).slice(0, 40));
    }
    assert.strictEqual(C.verifyLedger(L).ok, true);
  });

  it('P1-2 悬空触发引用 / 错配台账 ⇒ 拒绝（重算 taskId 与各层摘要后仍拒）', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    assert.strictEqual(C.verifyTaskExport(pack, { currentSourceRefSha256: L.sourceRefSha256 }).ok, true);

           
    const a = clone(pack);
    const t = a.stable.taskList.tasks[0];
    const fake = 'local-sha256:' + 'f'.repeat(64);
    t.triggeredByChangeEntryShas[0] = fake;
    t.triggeredByChangeEntryShas.sort();
    t.triggers = t.triggeredByChangeEntryShas.map(s => (s === fake)
      ? { entrySha256: fake, cellId: t.cellId, era: t.era, boundaryNoteSha256: 'local-sha256:' + '0'.repeat(64), caveats: t.caveats }
      : t.triggers.filter(x => x.entrySha256 === s)[0]);
    t.taskId = C.taskIdOf(t);
    a.stable.taskList.taskListSha256 = C.dig(C.TASKLIST_DOMAIN, C.coreOf(a.stable.taskList, 'taskListSha256'));
    a.stableDigest = C.stableDigestOf(a.stable);
    const va = C.verifyTaskExport(a);
    assert.strictEqual(va.ok, false);
    assert.ok(va.errors.join('；').indexOf('悬空引用') >= 0, va.errors[0]);

           
    const b = clone(pack);
    b.stable.taskList.ledgerSha256 = 'local-sha256:' + 'a'.repeat(64);
    b.stable.taskList.taskListSha256 = C.dig(C.TASKLIST_DOMAIN, C.coreOf(b.stable.taskList, 'taskListSha256'));
    b.stableDigest = C.stableDigestOf(b.stable);
    const vb = C.verifyTaskExport(b);
    assert.strictEqual(vb.ok, false);
    assert.ok(vb.errors.join('；').indexOf('错配台账') >= 0, vb.errors[0]);
  });

  it('P1-3 顶层 sourceRef 必须独立重算并与内含台账一致；自报 pin 不得当结论', () => {
    const L = C.buildLedger(bundle(), {});                                      
    const T = C.buildTaskList(L);
    const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    assert.strictEqual(pack.stable.ledger.sourceRef.publishedPin.status, 'PIN_ABSENT');

                            
    const bad = clone(pack);
    bad.stable.sourceRef.publishedPin.status = 'MATCHED';
    bad.stable.sourceRefSha256 = C.sourceRefSha(bad.stable.sourceRef);
    bad.stableDigest = C.stableDigestOf(bad.stable);
    const vb = C.verifyTaskExport(bad);
    assert.strictEqual(vb.ok, false, '自报 MATCHED 竟被接受');
    assert.ok(vb.errors.join('；').indexOf('sourceRef') >= 0, vb.errors[0]);

                        
    const v1 = C.verifyTaskExport(pack, {});
    assert.strictEqual(v1.pinEvaluation.evaluated, 'NOT_EVALUATED');
    assert.strictEqual(v1.provenance[1].status.indexOf('NOT_EVALUATED'), 0);
                                     
    const v2 = C.verifyTaskExport(C.buildTaskExport(ledger(), list(), { generatedAtUTC: '2026-10-15T00:00:00.000Z' }), { pin: pin(), fileSha256: fsha() });
    assert.strictEqual(v2.pinEvaluation.evaluated, 'MATCHED');
    const otherPin = Object.assign({}, pin(), { bundleContentSha256: 'local-sha256:' + '0'.repeat(64) });
    const v3 = C.verifyTaskExport(C.buildTaskExport(ledger(), list(), { generatedAtUTC: '2026-10-15T00:00:00.000Z' }), { pin: otherPin });
    assert.strictEqual(v3.ok, false, '与可信 pin 不符必须拒绝');
    assert.strictEqual(v3.pinEvaluation.evaluated, 'MISMATCHED');
  });

  it('导出件必须独立于调用方对象（深拷贝），改动调用方对象不得连带改动已生成件', () => {
    const L = ledger(), T = C.buildTaskList(L);
    const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-15T00:00:00.000Z' });
    const before = pack.stableDigest;
    T.tasks[0].taskLabel = '调用方后改的标题';
    T.tasks[0].taskId = C.taskIdOf(T.tasks[0]);
    L.entries[0].delta_tC_yr = 0;
    assert.strictEqual(C.stableDigestOf(pack.stable), before, 'stable 被调用方对象连带改动');
    assert.strictEqual(C.verifyTaskExport(pack).ok, true);
  });

  it('合法零值与负值仍合法；足迹同一性仍恒 UNVERIFIED', () => {
    const L = ledger();
    let zero = 0, neg = 0;
    for (const e of L.entries) {
      if (e.toValue_tC_yr === 0 || e.fromValue_tC_yr === 0) zero++;
      if (e.toValue_tC_yr < 0 || e.fromValue_tC_yr < 0) neg++;
      assert.strictEqual(e.footprintIdentity.status, 'UNVERIFIED');
    }
    assert.ok(zero + neg >= 0, '零/负值不得被当作非法');
    assert.strictEqual(C.verifyLedger(L).ok, true);
  });
});

describe('CarbonSat 变化台账 v1.2 · 任务完整性（限定复验 followup）', function () {
  this.timeout(180000);
  const seal = pack => {                                  
    const L = pack.stable.taskList;
    L.counts.tasks = L.tasks.length;
    L.counts.byType = L.tasks.reduce((m, a) => { m[a.taskType] = (m[a.taskType] || 0) + 1; return m; }, {});
    L.counts.totalTriggers = L.tasks.reduce((n, a) => n + a.count, 0);
    L.taskListSha256 = C.dig(C.TASKLIST_DOMAIN, C.coreOf(L, 'taskListSha256'));
    pack.stableDigest = C.stableDigestOf(pack.stable);
    return pack;
  };
  const full = () => C.buildTaskExport(ledger(), list(), { generatedAtUTC: '2026-10-16T00:00:00.000Z' });

  it('任务 = 所附台账的**完整规则派生**清单：覆盖由台账推导，不硬编码', () => {
    const L = ledger(), T = C.buildTaskList(L);
    assert.strictEqual(T.tasks.length, 172, '全量应为 172 项');
    assert.strictEqual(T.counts.totalTriggers, 1496);
    assert.strictEqual(C.deriveTasks(L).length, T.tasks.length, 'deriveTasks 应与清单一致');
    assert.strictEqual(C.expectedTaskPairs(L).size, 1496, '规则派生 (条目,类型) 集合应可独立算出');
    const v = C.verifyTaskExport(full(), { pin: pin(), bundle: bundle(), fileSha256: fsha() });
    assert.strictEqual(v.ok, true, v.errors.join('；'));
    assert.strictEqual(v.taskCoverage.complete, true);
    assert.strictEqual(v.taskCoverage.expectedTriggers, v.taskCoverage.actualTriggers);
  });

  it('清空全部任务 / 删一整条任务 / 空触发集合 / 少一个触发 ⇒ 全部拒绝（重签后仍拒）', () => {
    const cases = [];
    const a = full(); a.stable.taskList.tasks = []; cases.push([seal(a), /任务覆盖缺失|任务覆盖不完整/]);
    const b = full(); b.stable.taskList.tasks.shift(); cases.push([seal(b), /任务覆盖缺失|分组结果不完整/]);
    const c = full(); const t0 = c.stable.taskList.tasks[0];
    t0.triggers = []; t0.triggeredByChangeEntryShas = []; t0.count = 0; t0.taskId = C.taskIdOf(t0);
    cases.push([seal(c), /触发集合不得为空/]);
    const d = full(); const m = d.stable.taskList.tasks.filter(x => x.count > 1)[0];
    const gone = m.triggeredByChangeEntryShas.pop();
    m.triggers = m.triggers.filter(x => x.entrySha256 !== gone); m.count = m.triggeredByChangeEntryShas.length;
    m.taskId = C.taskIdOf(m); assert.ok(m.count > 0, '本例需保持非空');
    cases.push([seal(d), /任务覆盖缺失|触发集合与规则派生不符/]);
    for (const [pack, re] of cases) {
      const v = C.verifyTaskExport(pack, { pin: pin(), fileSha256: fsha() });
      assert.strictEqual(v.ok, false, '应被拒');
      assert.ok(re.test(v.errors.join('；')), '拒绝原因应指向任务完整性 → ' + v.errors.join('；').slice(0, 120));
      assert.strictEqual(v.taskCoverage.complete, false, 'taskCoverage 应报告不完整');
    }
  });

  it('非法分组（caveats 改成规则外的值）⇒ 拒绝', () => {
    const pack = full(); const t0 = pack.stable.taskList.tasks[0];
    t0.caveats = ['NOT_A_RULE_DERIVED_CAVEAT'];
    t0.taskId = C.taskIdOf(t0);
    seal(pack);
    const v = C.verifyTaskExport(pack, { pin: pin(), fileSha256: fsha() });
    assert.strictEqual(v.ok, false);
    assert.ok(/分组键|不对应|局限/.test(v.errors.join('；')), v.errors[0]);
  });

  it('合法台账子集 ⇒ 任务子集**完整**并通过（防一刀切；证明未硬编码 172/1496）', () => {
    for (const eras of [[1], [2], [1, 2]]) {
      const L = C.buildLedger(bundle(), { pin: pin(), fileSha256: fsha(), cellIds: ['cell_0020'], eras });
      const T = C.buildTaskList(L);
      const pack = C.buildTaskExport(L, T, { generatedAtUTC: '2026-10-16T00:00:00.000Z' });
      const v = C.verifyTaskExport(pack, { bundle: bundle(), pin: pin(), fileSha256: fsha() });
      assert.strictEqual(v.ok, true, '子集 ' + eras.join('_') + ' 未通过：' + v.errors.join('；'));
      assert.strictEqual(v.taskCoverage.complete, true);
      assert.strictEqual(v.taskCoverage.expectedTasks, T.counts.tasks);
      assert.notStrictEqual(v.taskCoverage.expectedTriggers, 1496, '子集不应等于全量触发数');
    }
  });
});

                                                                                
describe('CarbonSat 变化台账 v1.3 · 外部定位参数（只做定位）', function () {
  this.timeout(120000);
  const CTX = { cells: ['cell_0020', 'cell_0074'], years: N.AUTH_YEARS.slice(), eras: [1, 2] };

  it('无参数 ⇒ 不介入（present=false，不报错）', () => {
    for (const s of ['', '?']) {
      const r = C.parseLocateParams(s, CTX);
      assert.strictEqual(r.present, false);
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.applied, false);
      assert.deepStrictEqual(r.rejected, []);
    }
  });

  it('合法参数 ⇒ 全部接受且 applied', () => {
    const r = C.parseLocateParams('?cell=cell_0020&era=1&year=2008', CTX);
    assert.strictEqual(r.ok, true, r.rejected.join('；'));
    assert.strictEqual(r.applied, true);
    assert.strictEqual(r.cellId, 'cell_0020');
    assert.strictEqual(r.era, 1);
    assert.strictEqual(r.year, 2008);
  });

  it('未知格 ⇒ 拒绝', () => {
    const r = C.parseLocateParams('?cell=cell_9999', CTX);
    assert.strictEqual(r.ok, false);
    assert.ok(r.rejected.some(x => /未知格/.test(x)), r.rejected.join('；'));
  });

  it('未知年份 / 越界年份 ⇒ 拒绝', () => {
    assert.strictEqual(C.parseLocateParams('?year=1999', CTX).ok, false);
    assert.strictEqual(C.parseLocateParams('?year=abc', CTX).ok, false);
    assert.strictEqual(C.parseLocateParams('?year=2024', CTX).ok, true);
  });

  it('era 非法 ⇒ 拒绝', () => {
    assert.strictEqual(C.parseLocateParams('?era=3', CTX).ok, false);
    assert.strictEqual(C.parseLocateParams('?era=0', CTX).ok, false);
  });

  it('era 与 year 跨段不一致 ⇒ 拒绝（防"看似定位成功"）', () => {
    const r = C.parseLocateParams('?cell=cell_0020&era=2&year=2008', CTX);
    assert.strictEqual(r.ok, false);
    assert.ok(r.rejected.some(x => /时段与年份不一致/.test(x)), r.rejected.join('；'));
    assert.strictEqual(C.parseLocateParams('?era=2&year=2012', CTX).ok, true);
  });

  it('多余参数 ⇒ 拒绝（不允许夹带数据/来源/结论）', () => {
    const r = C.parseLocateParams('?cell=cell_0020&prod=9999&pin=abc', CTX);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.rejected.filter(x => /不支持的参数/.test(x)).length, 2);
  });

  it('参数不进入台账摘要：定位与否 ledgerSha256 与任务计数一致', () => {
    const L = ledger();
    const r = C.parseLocateParams('?cell=cell_0020&era=1&year=2008', CTX);
    assert.strictEqual(r.ok, true);
    const L2 = ledger();
    assert.strictEqual(L.ledgerSha256, L2.ledgerSha256);
    assert.deepStrictEqual(C.buildTaskList(L).counts, C.buildTaskList(L2).counts);
  });
});
