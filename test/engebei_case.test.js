                                                           
  
                                                                  
                                                           
                                                             
                                                                                          
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'web/engebei_core.js'));

const bundle = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/engebei_bundle.json'), 'utf8'));
const pin = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/engebei_bundle.pin.json'), 'utf8'));
const fileSha = require('crypto').createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, 'web/engebei_bundle.json'))).digest('hex');

const clone = o => JSON.parse(JSON.stringify(o));
const reseal = b => { const c = clone(b); c.stableDigest = C.stableDigestOf(c); return c; };
const recount = b => {
  const rs = Object.values(b.records);
  const years = Object.keys(b.records).map(Number).sort((a, c) => a - c);
  b.counts.years = b.years.length;
  b.counts.ok = rs.filter(r => r.computeStatus === 'OK').length;
  b.counts.coverageFull = rs.filter(r => r.validCoverageStatus === 'FULL_COVERAGE').length;
  b.counts.coveragePartial = rs.filter(r => r.validCoverageStatus === 'PARTIAL_COVERAGE').length;
  b.counts.coverageNone = rs.filter(r => r.validCoverageStatus === 'NO_VALID_PIXELS').length;
  b.delivery.yearsOk = years.filter(y => b.records[String(y)].computeStatus === 'OK');
  b.delivery.yearsFailed = years.filter(y => b.records[String(y)].computeStatus !== 'OK');
  b.delivery.totalYears = years.length;
  b.delivery.state = b.delivery.yearsFailed.length === 0 ? 'COMPLETE'
    : (b.delivery.yearsOk.length > 0 ? 'PARTIAL' : 'FAILED');
  return b;
};
                                                 
const failYear = (b, y, status, reason) => {
  const r = b.records[String(y)];
  r.computeStatus = status; r.missing = true; r.missingReason = reason;
  r.validCoverageStatus = 'NO_VALID_PIXELS';
  ['prod_tC_yr', 'integral_kgC_yr', 'gridValidAreaM2', 'gridAreaM2', 'validAreaRatio',
    'validPixels', 'nppRawMean', 'nppNegPixels', 'geomAreaM2'].forEach(k => { r[k] = null; });
  return recount(b);
};

describe('CarbonSat 恩格贝研究案例 v1.1 · 范围与来源', function () {
  it('窗口标注逐字为契约标注（非官方项目边界、非治理小班边界）', function () {
    assert.strictEqual(bundle.window.label, C.WINDOW_LABEL);
    assert.ok(/非官方项目边界/.test(bundle.window.label));
    assert.ok(/非治理小班边界/.test(bundle.window.label));
  });

  it('窗口哈希可由窗口定义重算（禁手打）', function () {
    assert.strictEqual(C.windowSha256Of(bundle.window), bundle.windowSha256);
    assert.ok(C.isDigest(bundle.windowSha256));
  });

  it('窗口与既有 34 格包围盒不相交（独立建流依据）', function () {
    const env = [107.72, 40.07, 109.18, 40.53];
    const b = bundle.window.boundsWGS84;
    const overlap = !(b.E <= env[0] || b.W >= env[2] || b.N <= env[1] || b.S >= env[3]);
    assert.strictEqual(overlap, false);
    assert.strictEqual(bundle.window.noOverlapWith34Cells, true);
  });

  it('论文自报面积与窗口外接矩形面积差异保留、标记待核（不自行纠正）', function () {
    assert.strictEqual(bundle.window.areaNote.sameBasis, false);
    assert.ok(bundle.window.areaNote.paperReportedKm2 > 0);
    assert.ok(bundle.window.areaNote.windowApproxKm2 > bundle.window.areaNote.paperReportedKm2);
    assert.ok(/待核|不自行纠正/.test(bundle.window.areaNote.note));
  });
});

describe('CarbonSat 恩格贝研究案例 v1.1 · 数据与单位', function () {
  it('年份恰为 2001–2024（24 年，逐年记录，缺年不省略）', function () {
    assert.deepStrictEqual(bundle.years, Array.from({ length: 24 }, (_, i) => 2001 + i));
    assert.strictEqual(Object.keys(bundle.records).length, 24);
  });

  it('单位链 prod_tC_yr == integral_kgC_yr/1000（逐行）', function () {
    bundle.years.forEach(y => {
      const r = bundle.records[String(y)];
      assert.ok(Math.abs(r.prod_tC_yr - r.integral_kgC_yr / 1000) <= 1e-9 * Math.abs(r.prod_tC_yr));
    });
  });

  it('面积边界 gridValidAreaM2 ≤ gridAreaM2，且比例 = gridValid/gridArea', function () {
    bundle.years.forEach(y => {
      const r = bundle.records[String(y)];
      assert.ok(r.gridValidAreaM2 <= r.gridAreaM2 * (1 + 1e-9));
      assert.ok(Math.abs(r.validAreaRatio - r.gridValidAreaM2 / r.gridAreaM2) < 1e-12);
    });
  });

  it('覆盖语义：比例 <1 ⇒ PARTIAL_COVERAGE（不得标成整窗总量）', function () {
    bundle.years.forEach(y => {
      const r = bundle.records[String(y)];
      assert.strictEqual(C.coverageStatusOf(r.validPixels, r.validAreaRatio), r.validCoverageStatus);
      if (r.validAreaRatio < 0.9999) assert.strictEqual(r.validCoverageStatus, 'PARTIAL_COVERAGE');
    });
  });

  it('合法零值与负值不被判缺测（不设正数下限）', function () {
    const b = clone(bundle);
    b.records['2007'].prod_tC_yr = 0; b.records['2007'].integral_kgC_yr = 0;
    b.records['2008'].prod_tC_yr = -3.5; b.records['2008'].integral_kgC_yr = -3500;
    const v = C.verifyBundle(reseal(b));
    assert.strictEqual(v.ok, true, v.errors.join('；'));
  });

  it('nan/inf 不被当作合法数值', function () {
    [NaN, Infinity, -Infinity].forEach(v => {
      const b = clone(bundle);
      b.records['2005'].prod_tC_yr = v;
      assert.strictEqual(C.verifyBundle(reseal(b)).ok, false);
    });
  });
});

describe('CarbonSat 恩格贝研究案例 v1.1 · 三件事分开与 fail-closed', function () {
  it('交付状态由记录实测导出（COMPLETE 需 24/24 OK）', function () {
    assert.strictEqual(bundle.delivery.state, 'COMPLETE');
    assert.strictEqual(bundle.delivery.yearsOk.length, 24);
    assert.strictEqual(bundle.counts.ok, 24);
  });

  it('年度合计：任一年非 OK ⇒ 全部置空（不输出部分和）', function () {
    const b = failYear(clone(bundle), 2013, 'FETCH_ERROR', 'network timeout');
    const tot = C.annualTotals(b);
    assert.strictEqual(tot.ok, false);
    Object.keys(tot.totals).forEach(y => assert.strictEqual(tot.totals[y], null));
  });

  it('取数失败不得写成产品缺测，也不得带数值（疑补造）', function () {
    const good = failYear(clone(bundle), 2015, 'AUTH_ERROR', 'auth failed');
    assert.strictEqual(C.verifyBundle(reseal(good)).ok, true);

    const fake = clone(good);
    fake.records['2015'].prod_tC_yr = 12345.6;                 
    assert.strictEqual(C.verifyBundle(reseal(fake)).ok, false);
  });

  it('有效面积为 0 却输出生产量 ⇒ 拒绝', function () {
    const b = clone(bundle);
    b.records['2006'].gridValidAreaM2 = 0;
    const v = C.verifyBundle(reseal(b));
    assert.strictEqual(v.ok, false);
    assert.ok(/有效面积为 0/.test(v.errors.join('；')));
  });
});

describe('CarbonSat 恩格贝研究案例 v1.1 · era 分段与声明', function () {
  it('跨 2012 的差分请求一律拒绝；同段只给差值、不给增长率', function () {
    assert.strictEqual(C.deltaRequest(bundle, 2011, 2012).refused, true);
    assert.strictEqual(C.deltaRequest(bundle, 2001, 2024).refused, true);
    const same = C.deltaRequest(bundle, 2013, 2014);
    assert.strictEqual(same.refused, false);
    assert.strictEqual(same.era, 2);
    assert.ok(typeof same.delta_tC_yr === 'number');
    assert.strictEqual(same.growthRate, undefined);
  });

  it('必备禁述语句与必备局限不得删减（重签摘要后仍被拒）', function () {
    const b = clone(bundle);
    b.boundary.cannotSay = b.boundary.cannotSay.filter(x => x.indexOf('碳汇') < 0);
    const v = C.verifyBundle(reseal(b));
    assert.strictEqual(v.ok, false);
    assert.ok(/cannotSay 与固定声明不符/.test(v.errors.join('；')));

    const b2 = clone(bundle);
    b2.boundary.limitations = b2.boundary.limitations.filter(x => x.indexOf('外推') < 0);
    const v2 = C.verifyBundle(reseal(b2));
    assert.strictEqual(v2.ok, false);
    assert.ok(/limitations 与固定声明不符/.test(v2.errors.join('；')));
  });

  it('红线字段固定：registrable=false / removalCount=0 / footprintIdentity=UNVERIFIED', function () {
    assert.strictEqual(bundle.boundary.registrable, false);
    assert.strictEqual(bundle.boundary.removalCount, 0);
    assert.strictEqual(bundle.boundary.claimsLinked, false);
    assert.strictEqual(bundle.boundary.evidenceRecordsLinked, false);
    assert.strictEqual(bundle.boundary.footprintIdentity, 'UNVERIFIED');
    const b = clone(bundle);
    b.boundary.registrable = true;
    assert.strictEqual(C.verifyBundle(reseal(b)).ok, false);
  });
});

describe('CarbonSat 恩格贝研究案例 v1.1 · 来源分层与导出', function () {
  it('无独立 pin ⇒ ② NOT_EVALUATED；提供本站 pin ⇒ MATCHED；错误 pin ⇒ MISMATCHED 且拒绝', function () {
    assert.strictEqual(C.verifyBundle(bundle).pinEvaluation.evaluated, 'NOT_EVALUATED');
    const ok = C.verifyBundle(bundle, { pin, fileSha256: fileSha });
    assert.strictEqual(ok.pinEvaluation.evaluated, 'MATCHED');
    const bad = C.verifyBundle(bundle, { pin: Object.assign({}, pin, { stableDigest: 'local-sha256:' + '0'.repeat(64) }), fileSha256: fileSha });
    assert.strictEqual(bad.pinEvaluation.evaluated, 'MISMATCHED');
    assert.strictEqual(bad.ok, false);
  });

  it('④ 原始来源真实性与科学精度恒 NOT_VERIFIED；③ 页面内恒未核验', function () {
    const v = C.verifyBundle(bundle, { pin, fileSha256: fileSha });
    assert.strictEqual(v.sourceAuthenticityVerified, false);
    assert.strictEqual(v.provenance.find(x => x.level === '④').status, 'NOT_VERIFIED');
    assert.ok(/NOT_LOADED/.test(v.provenance.find(x => x.level === '③').status));
  });

  it('导出件 stable 部分不含时间戳；事件时间戳只在 event 封套', function () {
    const p1 = C.buildExport(bundle, { generatedAtUTC: '2026-01-01T00:00:00.000Z' });
    const p2 = C.buildExport(bundle, { generatedAtUTC: '2026-06-06T06:06:06.000Z' });
    assert.strictEqual(p1.stableDigest, p2.stableDigest, 'stable 内容必须与运行时间无关');
    assert.ok(C.findTimeKeys(p1.stable).length === 0, 'stable 不得含时间戳字段');
    assert.notStrictEqual(p1.event.generatedAtUTC, p2.event.generatedAtUTC);
    assert.strictEqual(C.verifyExport(p1).ok, true);
  });

  it('导出内改一处数值但不重签 ⇒ 拒绝；完全重签 ⇒ 自洽但 stableDigest 改变', function () {
    const p = C.buildExport(bundle, { generatedAtUTC: '2026-01-01T00:00:00.000Z' });
    const t1 = clone(p);
    t1.stable.bundle.records['2020'].prod_tC_yr = 1;
    assert.strictEqual(C.verifyExport(t1).ok, false);

    const t2 = clone(p);
    const r = t2.stable.bundle.records['2020'];
    r.prod_tC_yr = 1; r.integral_kgC_yr = 1000;                             
    t2.stable.bundle = reseal(t2.stable.bundle);
    t2.stableDigest = C.dig(C.EXPORT_STABLE_DOMAIN, t2.stable);
    assert.notStrictEqual(t2.stableDigest, p.stableDigest);
    assert.strictEqual(C.verifyExport(t2).ok, true, '完全重签后内部应自洽（这正是"自摘要≠来源真实"的实证）');
  });

  it('窗口版本过期可被识别（stalenessOf）', function () {
    const p = C.buildExport(bundle, { generatedAtUTC: '2026-01-01T00:00:00.000Z' });
    assert.strictEqual(C.stalenessOf(p, bundle.windowSha256).same, true);
    assert.strictEqual(C.stalenessOf(p, 'local-sha256:' + 'a'.repeat(64)).same, false);
  });

  it('禁用表述扫描：否定语境不算违规，正向结论才算', function () {
    assert.deepStrictEqual(C.scanForbiddenText('不是碳汇，也不得声称碳信用'), []);
    assert.ok(C.scanForbiddenText('该区域碳汇增加').includes('碳汇'));
    assert.ok(C.scanForbiddenText('准确率 95%').includes('准确率'));
  });
});

describe('CarbonSat 恩格贝研究案例 v1.2 · 自述字段固定声明（E8）', function () {
  it('正例：caseTitle / generatedBy / selfDigestNote / scopeNote / provenance 与固定声明逐字相等', function () {
    assert.strictEqual(bundle.caseTitle, C.DECL_CASE_TITLE);
    assert.strictEqual(bundle.generatedBy, C.DECL_GENERATED_BY);
    assert.strictEqual(bundle.selfDigestNote, C.SELF_DIGEST_NOTE);
    assert.strictEqual(bundle.scopeNote, C.SCOPE_NOTE);
    assert.deepStrictEqual(bundle.provenance, JSON.parse(JSON.stringify(C.DECL_PROVENANCE)));
    assert.strictEqual(C.verifyBundle(bundle).ok, true);
  });

  it('provenance 自述层被改写（④ 写成「已核验」/ 整表 PASS / 删一层）⇒ 重签后仍拒', function () {
    const a = clone(bundle); a.provenance[3].status = '已核验（外部权威版本比对通过）';
    const r1 = C.verifyBundle(reseal(a));
    assert.strictEqual(r1.ok, false);
    assert.ok(/provenance\[3\] 与固定声明不符/.test(r1.errors.join('；')));

    const b = clone(bundle); b.provenance = b.provenance.map(x => Object.assign({}, x, { status: 'PASS' }));
    assert.strictEqual(C.verifyBundle(reseal(b)).ok, false);

    const c = clone(bundle); c.provenance = c.provenance.slice(0, 3);
    const r3 = C.verifyBundle(reseal(c));
    assert.strictEqual(r3.ok, false);
    assert.ok(/provenance 层数不符/.test(r3.errors.join('；')));
  });

  it('selfDigestNote / scopeNote 不得改写成「已外部核验 / 已上链」自述', function () {
    const a = clone(bundle);
    a.selfDigestNote = '本包已与外部权威版本逐字节比对并通过，可作为已核验来源使用。';
    const r1 = C.verifyBundle(reseal(a));
    assert.strictEqual(r1.ok, false);
    assert.ok(/selfDigestNote 与固定声明不符/.test(r1.errors.join('；')));

    const b = clone(bundle); b.scopeNote = '本包已完成外部机构复核并登记存证。';
    const r2 = C.verifyBundle(reseal(b));
    assert.strictEqual(r2.ok, false);
    assert.ok(/scopeNote 与固定声明不符/.test(r2.errors.join('；')));
  });

  it('caseTitle / generatedBy 被改写 ⇒ 拒绝；且无 pin 时同样拒绝（与 ② 层无关）', function () {
    const a = clone(bundle); a.caseTitle = '恩格贝官方项目边界案例';
    assert.strictEqual(C.verifyBundle(reseal(a)).ok, false);
    const b = clone(bundle); b.generatedBy = 'third_party/unknown.js';
    assert.strictEqual(C.verifyBundle(reseal(b)).ok, false);
    const c = clone(bundle); c.provenance[3].status = 'VERIFIED';
    const v = C.verifyBundle(reseal(c));
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.pinEvaluation.evaluated, 'NOT_EVALUATED');
  });
});

describe('CarbonSat 恩格贝研究案例 v1.1 · 独立限定审阅的四组 P1', function () {
                                            
  const rejectResealed = (b, re, label) => {
    const v = C.verifyBundle(reseal(b));
    assert.strictEqual(v.ok, false, label + '：重签后被接受');
    const joined = v.errors.join('；');
    assert.ok(re.test(joined), label + '：原因未指向语义 → ' + joined.slice(0, 140));
    assert.ok(!/摘要与内容不符/.test(joined), label + '：只被摘要不符拦下');
  };

  it('P1-1 数值与元数据：null 有效面积 / 比例与面积不符 / 行内投影与尺度矛盾 / 交付年份数组矛盾', function () {
    const a = clone(bundle); a.records['2001'].gridValidAreaM2 = null;
    rejectResealed(a, /gridValidAreaM2 须为有限正数/, 'null 有效面积');

    const b = clone(bundle); b.records['2001'].validAreaRatio = 0.5;
    rejectResealed(b, /有效面积比例与面积不符/, '比例与面积不符');

    const c = clone(bundle); c.records['2001'].crs = 'EPSG:4326'; c.records['2001'].scale = 1000;
    rejectResealed(c, /行内投影与数据包方法不符|行内像元尺度与数据包方法不符/, '行内投影/尺度');

    const d = clone(bundle); d.delivery.yearsOk = []; d.delivery.yearsFailed = [2001]; d.delivery.totalYears = 0;
    rejectResealed(d, /delivery\.yearsOk 与记录重建不符|delivery\.totalYears 与记录数不符/, '交付年份数组');
  });

  it('P1-1 记录必填类型/有限值：有效像元与负值计数须为正整数/非负整数', function () {
    const a = clone(bundle); a.records['2002'].validPixels = '813';
    rejectResealed(a, /validPixels 须为正整数/, 'validPixels 类型错');
    const b = clone(bundle); b.records['2003'].nppNegPixels = -1;
    rejectResealed(b, /nppNegPixels 须为非负整数/, 'nppNegPixels 为负');
    const c = clone(bundle); c.records['2004'].gridAreaM2 = 0;
    rejectResealed(c, /gridAreaM2 须为有限正数/, 'gridAreaM2 为 0');
  });

  it('P1-1 方法学字段对权威常量表逐项核对', function () {
    const a = clone(bundle); a.methodology.crs = 'EPSG:4326';
    rejectResealed(a, /方法学 crs 与权威常量不符/, '顶层 crs 被改');
    const b = clone(bundle); b.methodology.validRawRange = [-30000, 32767];
    rejectResealed(b, /方法学 validRawRange 与权威常量不符/, '有效值域被改');
  });

  it('P1-2 边界：版本化固定声明（关键词串替换 / 正向越界进 canSay 均被拒）', function () {
    const a = clone(bundle);
    a.boundary.cannotSay = ['碳汇 碳信用 精度 治理 2012 项目边界 上链'];
    a.boundary.limitations = ['足迹同一性 未取得 自摘要 外推 registrable'];
    rejectResealed(a, /版本化固定声明必须逐条逐字相等/, '关键词串替换');

    const b = clone(bundle);
    b.boundary.canSay = ['本案例已签发碳信用，已完成科学精度验证，整包已上链。'];
    rejectResealed(b, /canSay 与固定声明不符|正向禁述表述/, 'canSay 正向越界');

    const c = clone(bundle); c.boundary.declarationVersion = 'v0';
    rejectResealed(c, /边界固定声明版本不符/, '声明版本被改');
  });

  it('P1-2 声明本体扫描：限述句豁免，正向结论命中（补充手段）', function () {
    assert.deepStrictEqual(C.scanDeclarations(bundle.boundary.cannotSay), []);
    assert.deepStrictEqual(C.scanDeclarations(bundle.boundary.limitations), []);
    const hits = C.scanDeclarations(['本案例已签发碳信用，已完成科学精度验证，整包已上链。']);
    ['碳信用', '精度', '上链'].forEach(w => assert.ok(hits.some(h => h.indexOf(w) === 0), '未命中 ' + w));
  });

  it('P1-3 pin：不完整 pin 不得 MATCHED；身份错配 ⇒ MISMATCHED；内容与文件字节分列', function () {
    const empty = C.verifyBundle(bundle, { pin: { schemaVersion: C.PIN_SCHEMA } });
    assert.strictEqual(empty.ok, false);
    assert.notStrictEqual(empty.pinEvaluation.evaluated, 'MATCHED');

    const wrongId = Object.assign({}, pin, { caseId: 'another_case' });
    const v1 = C.verifyBundle(bundle, { pin: wrongId });
    assert.strictEqual(v1.ok, false);
    assert.strictEqual(v1.pinEvaluation.evaluated, 'MISMATCHED');

    const wrongWin = Object.assign({}, pin, { windowSha256: 'local-sha256:' + 'a'.repeat(64) });
    assert.strictEqual(C.verifyBundle(bundle, { pin: wrongWin }).pinEvaluation.evaluated, 'MISMATCHED');

    const ok = C.verifyBundle(bundle, { pin, fileSha256: fileSha });
    assert.strictEqual(ok.pinEvaluation.contentMatch, true);
    assert.strictEqual(ok.pinEvaluation.fileBytesMatch, true);
    assert.ok(/MATCHED（内容 \+ 文件字节）/.test(ok.pinStatus));

    const fileBad = C.verifyBundle(bundle, { pin, fileSha256: '0'.repeat(64) });
    assert.strictEqual(fileBad.pinEvaluation.contentMatch, true);
    assert.strictEqual(fileBad.pinEvaluation.fileBytesMatch, false);
    assert.strictEqual(fileBad.pinEvaluation.evaluated, 'MISMATCHED');
  });

  it('P1-4 导出绑定：外层身份必须与内含 bundle 一致；当前上下文绑定内含源产物', function () {
    const p = C.buildExport(bundle, { generatedAtUTC: '2026-01-01T00:00:00.000Z' });
    const t = clone(p);
    t.stable.caseId = 'another_case';
    t.stable.windowSha256 = 'local-sha256:' + 'f'.repeat(64);
    t.stableDigest = C.dig(C.EXPORT_STABLE_DOMAIN, t.stable);
    const v = C.verifyExport(t);
    assert.strictEqual(v.ok, false);
    assert.ok(/导出外层 caseId 与内含数据包不符|导出外层 windowSha256 与内含数据包不符/.test(v.errors.join('；')));
  });

  it('P1-4 内含窗口被改而外层保留旧摘要 ⇒ 拒；staleness 分别报告窗口与源产物', function () {
    const a = clone(bundle);
    a.window.boundsWGS84.W += 0.001;
    a.windowSha256 = C.windowSha256Of(a.window);
    Object.values(a.records).forEach(r => { r.windowSha256 = a.windowSha256; });
    a.stableDigest = C.stableDigestOf(a);
    const pack = C.buildExport(a, { generatedAtUTC: '2026-01-01T00:00:00.000Z' });
    pack.stable.windowSha256 = bundle.windowSha256;
    pack.stableDigest = C.dig(C.EXPORT_STABLE_DOMAIN, pack.stable);
    assert.strictEqual(C.verifyExport(pack, { currentWindowSha256: bundle.windowSha256 }).ok, false);
    const st = C.stalenessOf(pack, { windowSha256: bundle.windowSha256 });
    assert.strictEqual(st.same, false);
    assert.strictEqual(st.outerMatchesInner, false);
  });

  it('直接核验·绕过构建端把重签后的非法数据包交给生产核验器 ⇒ 仍拒', function () {
    const bad = clone(bundle);
    bad.records['2010'].gridValidAreaM2 = null;
    bad.stableDigest = C.stableDigestOf(bad);
    const v = C.verifyBundle(bad);
    assert.strictEqual(v.ok, false);
    assert.ok(/gridValidAreaM2 须为有限正数/.test(v.errors.join('；')));
  });

  it('正例对照·数值锚点与声明版本不变（科研产物未被改写）', function () {
    assert.strictEqual(bundle.records['2001'].prod_tC_yr, 13318.372381792975);
    assert.strictEqual(bundle.records['2024'].prod_tC_yr, 30780.13401430004);
    assert.strictEqual(bundle.records['2001'].validAreaRatio, 0.9311618297166796);
    assert.strictEqual(bundle.boundary.declarationVersion, 'engebei-boundary-declaration-v1.1');
    assert.strictEqual(C.verifyBundle(bundle).ok, true);
  });

  it('来源补记·作者接受稿与出版定稿分开标注（窗口性质不变）', function () {
    const s = bundle.sourceRef;
    assert.ok(/author_accepted_manuscript/.test(s.paperKind));
    assert.ok(/published_version_not_obtained/.test(s.paperAccessLevel));
    assert.ok(/researchgate\.net/.test(s.paperAuthorVersionUrl));
    assert.ok(/出版定稿 PDF 未取得/.test(s.paperVersionNote));
    assert.strictEqual(bundle.window.statute, C.WINDOW_STATUTE);
  });
});
