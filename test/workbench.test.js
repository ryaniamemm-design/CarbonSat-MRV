'use strict';
                              
                           
                                       
  
                                                 
                                            
                                                        
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('../web/workbench_core.js');
const N = require('../web/npp_entry_core.js');
const E = require('../web/engebei_core.js');

const ROOT = path.join(__dirname, '..');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const BUNDLE_A = path.join(ROOT, 'web/npp_estimate_bundle.json');
const PIN_A = path.join(ROOT, 'web/npp_estimate_bundle.pin.json');
const BUNDLE_B = path.join(ROOT, 'web/engebei_bundle.json');
const PIN_B = path.join(ROOT, 'web/engebei_bundle.pin.json');
const REGISTRY = readJson(path.join(ROOT, 'web/workbench_evidence_registry.json'));

function modelA() {
  const b = readJson(BUNDLE_A);
  const pin = readJson(PIN_A);
  const fileSha = sha(BUNDLE_A);
  const verdict = N.verifyBundle(b, { pin, fileSha256: fileSha });
  return { b, model: C.buildModelA(b, { pin, fileSha256: fileSha, verdict }) };
}
function modelB() {
  const b = readJson(BUNDLE_B);
  const pin = readJson(PIN_B);
  const fileSha = sha(BUNDLE_B);
  const verdict = E.verifyBundle(b, { pin, fileSha256: fileSha });
  return { b, model: C.buildModelB(b, { pin, fileSha256: fileSha, verdict }) };
}

   
                                                
                                     
   
function variantA(mutate) {
  const b = readJson(BUNDLE_A);
  mutate(b);
  b.bundleContentSha256 = N.contentSha(b);
  const verdict = N.verifyBundle(b, { fileSha256: null });
  return { b, verdict, model: C.buildModelA(b, { pin: null, fileSha256: null, verdict }) };
}


describe('CarbonSat 研究工作台 v1.1 · 案例 A 适配', function () {
  this.timeout(120000);
  let b, m;
  before(() => { const r = modelA(); b = r.b; m = r.model; });

  it('核验通过后才建模型；对象 34 / 年 24', () => {
    assert.strictEqual(m.verdict.ok, true, (m.verdict.errors || []).join('；'));
    assert.strictEqual(m.objects.length, 34);
    assert.strictEqual(m.years.length, 24);
  });

  it('格框由产物 halfSpanDeg 规则派生（不是手绘），且与测地面积一致', () => {
    assert.strictEqual(m.geometryRule.halfSpanDeg, b.cellGeometry.halfSpanDeg);
    const o = C.objectById(m, 'cell_0020');
    const cell = b.cells.filter(x => x.cellId === 'cell_0020')[0];
    assert.strictEqual(o.bbox.W, cell.lon - 0.03);
    assert.strictEqual(o.bbox.E, cell.lon + 0.03);
                                                
    const R = 6371007.181, h = 0.06 * Math.PI / 180;
    const area = (R * h) * (R * h * Math.cos(cell.lat * Math.PI / 180));
    const rel = Math.abs(area - b.cellYears['cell_0020|2001'].geomAreaM2) / b.cellYears['cell_0020|2001'].geomAreaM2;
    assert.ok(rel < 5e-6, '方框面积与 geomAreaM2 不一致：rel=' + rel);
  });

  it('分组 32 治理 / 2 对照（示意 AOI 规则，非真实划分）', () => {
    const g = m.objects.reduce((a, o) => (a[o.group] = (a[o.group] || 0) + 1, a), {});
    assert.strictEqual(g.treated, 32);
    assert.strictEqual(g.control, 2);
    assert.strictEqual(g.unassigned, undefined);
    assert.ok(/示意/.test(C.GROUP_LABEL.treated));
  });

  it('序列 24 点、按 era 分段、数值与产物逐位相同', () => {
    const s = C.seriesOf(m, 'cell_0020');
    assert.strictEqual(s.length, 24);
    assert.deepStrictEqual(s.filter(p => p.era === 1).map(p => p.year), b.years.filter(y => y <= 2011));
    assert.deepStrictEqual(s.filter(p => p.era === 2).map(p => p.year), b.years.filter(y => y >= 2012));
    s.forEach(p => {
      assert.strictEqual(p.value, b.cellYears['cell_0020|' + p.year].prod_tC_yr);
    });
  });

  it('年度明细的面积三分分列且与产物一致', () => {
    const d = C.detailOf(m, 'cell_0020', 2008);
    const r = b.cellYears['cell_0020|2008'];
    assert.strictEqual(d.areas.geom.m2, r.geomAreaM2);
    assert.strictEqual(d.areas.total.m2, r.gridTotalAreaM2);
    assert.strictEqual(d.areas.valid.m2, r.gridValidAreaM2);
    assert.strictEqual(d.ratio, r.validAreaRatio);
    assert.strictEqual(d.prod, r.prod_tC_yr);
    assert.strictEqual(d.integral, r.integral_kgC_yr);
  });

  it('地类零有效面积 ⇒ 生产量/强度为 null（不是 0）', () => {
    const d = C.detailOf(m, 'cell_0020', 2001);
    const zero = d.landCover.filter(x => x.note);
    zero.forEach(x => { assert.strictEqual(x.prod, null); assert.strictEqual(x.intensity, null); });
  });

  it('可进入既有变化台账，链接只带定位参数', () => {
    const h = C.locateHref(m, 'cell_0020', 2008);
    assert.strictEqual(h.ok, true);
    assert.strictEqual(h.href, 'changes.html?cell=cell_0020&era=1&year=2008');
    assert.deepStrictEqual(Object.keys(h.params).sort(), ['cellId', 'era', 'year']);
    assert.strictEqual(C.locateHref(m, 'cell_9999', 2008).ok, false);
    assert.strictEqual(C.locateHref(m, 'cell_0020', 1999).ok, false);
  });
});

describe('CarbonSat 研究工作台 v1.1 · 案例 B 适配', function () {
  this.timeout(120000);
  let b, m;
  before(() => { const r = modelB(); b = r.b; m = r.model; });

  it('核验通过（含 pin 内容与文件字节双匹配）', () => {
    assert.strictEqual(m.verdict.ok, true, (m.verdict.errors || []).join('；'));
    assert.ok(C.pinMatches(m.verdict.pinStatus), m.verdict.pinStatus);
    assert.strictEqual(m.verdict.pinEvaluation.contentMatch, true);
    assert.strictEqual(m.verdict.pinEvaluation.fileBytesMatch, true);
  });

  it('窗口几何来自 boundsWGS84，且标注含「非官方项目边界 / 非治理小班边界」', () => {
    assert.strictEqual(m.objects.length, 1);
    assert.deepStrictEqual(m.objects[0].bbox, {
      W: b.window.boundsWGS84.W, S: b.window.boundsWGS84.S,
      E: b.window.boundsWGS84.E, N: b.window.boundsWGS84.N,
    });
    assert.ok(/非官方项目边界/.test(C.CASES.B.scopeLabel));
    assert.ok(/非治理小班边界/.test(C.CASES.B.scopeLabel));
    assert.strictEqual(C.CASES.B.scopeLabel, b.window.label, '页面标注必须与数据包窗口标注逐字一致');
  });

  it('24 年全部 PARTIAL_COVERAGE，数值只代表有效足迹', () => {
    const s = C.seriesOf(m, 'engebei_paper_window_v1');
    assert.strictEqual(s.length, 24);
    s.forEach(p => {
      const r = b.records[String(p.year)];
      assert.strictEqual(r.validCoverageStatus, 'PARTIAL_COVERAGE');
      assert.strictEqual(p.value, r.prod_tC_yr);
    });
    const d = C.detailOf(m, 'engebei_paper_window_v1', 2001);
    assert.strictEqual(d.coverage.status, 'PARTIAL_COVERAGE');
    assert.ok(/有效产品足迹/.test(d.coverage.note));
    assert.strictEqual(d.extra.filter(x => x.label === '有效像元数')[0].value, String(b.records['2001'].validPixels));
  });

  it('未接入原 34 格变化台账 ⇒ 入口禁用并给出原因', () => {
    const h = C.locateHref(m, 'engebei_paper_window_v1', 2001);
    assert.strictEqual(h.ok, false);
    assert.ok(/未接入/.test(h.reason), h.reason);
  });
});

describe('CarbonSat 研究工作台 v1.1 · 空值与边界', function () {
  it('缺测行 ⇒ value/detail 为 null（不填 0）', () => {
    const fake = {
      caseKey: 'A', years: [2001, 2002],
      objects: [{ id: 'c', label: 'c', bbox: { W: 0, S: 0, E: 1, N: 1 } }],
      bundle: {
        cellYears: {
          'c|2001': { cellId: 'c', year: 2001, missing: true, missingReason: 'cloud', prod_tC_yr: null, integral_kgC_yr: null, geomAreaM2: 1, gridTotalAreaM2: 1, gridValidAreaM2: 0, validAreaRatio: 0, landCover: [] },
          'c|2002': { cellId: 'c', year: 2002, missing: false, missingReason: 'ok', prod_tC_yr: 0, integral_kgC_yr: 0, geomAreaM2: 1, gridTotalAreaM2: 1, gridValidAreaM2: 1, validAreaRatio: 1, landCover: [] },
        },
        methodology: {}, generatedFrom: {},
      },
      verdict: {},
    };
    assert.strictEqual(C.valueOf(fake, 'c', 2001).value, null);
    assert.strictEqual(C.detailOf(fake, 'c', 2001).prod, null);
    assert.ok(C.detailOf(fake, 'c', 2001).unusableReason.length > 0);
                                   
    assert.strictEqual(C.valueOf(fake, 'c', 2002).value, 0);
    assert.strictEqual(C.valueOf(fake, 'c', 2002).usable, true);
  });

  it('缺失年份 ⇒ null 且原因明确', () => {
    const fake = {
      caseKey: 'A', years: [2001, 2002], objects: [{ id: 'c', label: 'c', bbox: { W: 0, S: 0, E: 1, N: 1 } }],
      bundle: { cellYears: {}, methodology: {}, generatedFrom: {} }, verdict: {},
    };
    const p = C.seriesOf(fake, 'c')[0];
    assert.strictEqual(p.value, null);
    assert.strictEqual(p.usable, false);
    assert.ok(/不存在/.test(p.reason));
  });

  it('未知对象/年份 ⇒ 明确失败，不返回半成品', () => {
    const { model } = modelA();
    assert.strictEqual(C.detailOf(model, 'cell_9999', 2008).ok, false);
    assert.strictEqual(C.detailOf(model, 'cell_0020', 1999).ok, false);
    assert.strictEqual(C.objectById(model, 'cell_9999'), null);
  });

  it('着色：null 落灰色，不当作 0 落第一档', () => {
    const brk = C.colorBreaks([1000, 2000, 3000, 4000, 5000]);
    assert.strictEqual(C.colorFor(null, brk).fill, '#eceff1');
    assert.notStrictEqual(C.colorFor(0, brk).fill, '#eceff1');
    assert.notStrictEqual(C.colorFor(-5, brk).fill, '#eceff1');            
  });

  it('两个案例不可合计：模型间没有共享对象或合计入口', () => {
    const a = modelA().model, bb = modelB().model;
    assert.notStrictEqual(a.caseId, bb.caseId);
    const idsA = new Set(a.objects.map(o => o.id));
    bb.objects.forEach(o => assert.ok(!idsA.has(o.id)));
                                         
    const api = Object.keys(C);
    assert.ok(!api.some(k => /^(sum|rank|aggregate)/i.test(k)));
  });
});

describe('CarbonSat 研究工作台 v1.1 · 投影与令牌', function () {
  it('墨卡托基准点（0,0）在画布中心', () => {
    const v = { cx: 0.5, cy: 0.5, scale: 1000, width: 400, height: 300 };
    const p = C.project(v, 0, 0);
    assert.ok(Math.abs(p.x - 200) < 1e-9);
    assert.ok(Math.abs(p.y - 150) < 1e-9);
  });

  it('适配尺度：0.06° 方框在常用画布上有可辨像素尺寸（防"亚像素退化"）', () => {
    const v = C.fitView({ W: 107.72, S: 40.07, E: 109.18, N: 40.53 }, 610, 350, 34);
    const box = C.projectBox(v, { W: 107.72, S: 40.07, E: 107.78, N: 40.13 });
    assert.ok(box.w >= 10 && box.h >= 10, '方框退化为亚像素：w=' + box.w + ' h=' + box.h);
                 
    const all = C.projectBox(v, { W: 107.72, S: 40.07, E: 109.18, N: 40.53 });
    assert.ok(all.x >= 0 && all.y >= 0 && all.x + all.w <= 610 && all.y + all.h <= 350,
      '范围越界：' + JSON.stringify(all));
  });

  it('方框投影往返一致（不翻转南北）', () => {
    const v = C.fitView({ W: 107, S: 40, E: 110, N: 41 }, 600, 400, 20);
    const box = { W: 108, S: 40.2, E: 108.5, N: 40.4 };
    const r = C.projectBox(v, box);
    assert.ok(r.w > 0 && r.h > 0);
    const tl = C.unproject(v, r.x, r.y);
    assert.ok(Math.abs(tl.lon - box.W) < 1e-9);
    assert.ok(Math.abs(tl.lat - box.N) < 1e-9);
  });

  it('令牌：只有最新一次请求是 current', () => {
    const g = C.createGate();
    const t1 = g.next(), t2 = g.next();
    assert.strictEqual(g.isCurrent(t1), false);
    assert.strictEqual(g.isCurrent(t2), true);
  });

  it('状态跃迁 ⇒ 关联结论显式失效（status=loading）', () => {
    const s0 = Object.assign(C.createState(), { status: 'ready', model: { x: 1 } });
    const s1 = C.transition(s0, { caseKey: 'B' });
    assert.strictEqual(s1.status, 'loading');
    assert.ok(s1.token > s0.token);
    assert.strictEqual(s1.model.x, 1, 'transition 不应就地清空外部引用，由调用方显式置空');
  });
});

describe('CarbonSat 研究工作台 v1.1 · 定位参数与来源面板', function () {
  it('分享链接只接受 case/object/year，其余一律拒绝', () => {
    const r = C.parseShareParams('?case=B&object=x&year=2008&prod=1', null);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.caseKey, 'B');
    assert.strictEqual(r.year, 2008);
    assert.ok(r.rejected.some(x => /不支持的参数/.test(x)));
  });

  it('未知案例 / 非法年份 ⇒ 拒绝', () => {
    assert.strictEqual(C.parseShareParams('?case=Z', null).ok, false);
    assert.strictEqual(C.parseShareParams('?year=abcd', null).ok, false);
    assert.strictEqual(C.parseShareParams('', null).ok, true);
  });

  it('生成链接可被解析回同一组定位值（往返）', () => {
    const { model } = modelA();
    const h = C.shareHref(model, 'cell_0074', 2019);
    const r = C.parseShareParams('?' + h.href.split('?')[1], model);
    assert.strictEqual(r.ok, true, r.rejected.join('；'));
    assert.strictEqual(r.caseKey, 'A');
    assert.strictEqual(r.objectId, 'cell_0074');
    assert.strictEqual(r.year, 2019);
  });

  it('来源面板：五层分列，且每层都写明「不能代替什么」', () => {
    const { model } = modelA();
    const sp = C.sourcePanel(model, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    assert.deepStrictEqual(sp.rows.map(r => r.key), ['internal', 'pin', 'local', 'upstream', 'notverified']);
    sp.rows.forEach(r => { assert.ok(r.scope && r.scope.length > 8, r.key + ' 缺 scope'); });
    assert.ok(/9\s*\/\s*840/.test(sp.rows[3].verdict), sp.rows[3].verdict);
    assert.ok(/未执行/.test(sp.rows[3].scope), sp.rows[3].scope);
    assert.ok(/不等于/.test(sp.disclaimer));
                                       
    sp.rows.forEach(r => {
      assert.ok(['ok', 'warn', 'bad', 'info'].indexOf(r.state) >= 0, r.key + ' 状态越界：' + r.state);
      if (r.state === 'ok') assert.strictEqual(r.ok, true, r.key + '：ok 状态必须 ok=true');
      if (r.state === 'bad') assert.strictEqual(r.ok, false, r.key + '：bad 状态必须 ok=false');
    });
  });

  it('来源面板：B 案例的未验证项必须含出版定稿与项目矢量', () => {
    const sp = C.sourcePanel(modelB().model, { registry: REGISTRY, selection: { objectId: 'engebei_paper_window_v1', year: 2001 } });
    const nv = sp.rows.filter(r => r.key === 'notverified')[0];
    assert.ok(/出版定稿/.test(nv.detail), nv.detail);
    assert.ok(/矢量/.test(nv.detail), nv.detail);
  });
});

                                                                                 
describe('CarbonSat 研究工作台 v1.1 · 历史证据必须绑定当前产物身份（P1-1）', function () {
  this.timeout(120000);

  it('当前发布件：历史复算与上游抽样都判为适用，且给出逐项身份对照', () => {
    const { model } = modelA();
    const ev = C.evaluateEvidence(model, REGISTRY);
    assert.strictEqual(ev.status, 'APPLICABLE', JSON.stringify(ev.mismatched));
    assert.deepStrictEqual(ev.mismatched, []);
    assert.deepStrictEqual(ev.uncomparable, []);
    ['caseId', 'methodVersion', 'sourceDigest', 'contentDigest', 'fileBytes'].forEach(k => {
      const c = ev.checks.filter(x => x.key === k)[0];
      assert.ok(c, '缺身份对照项：' + k);
      assert.strictEqual(c.ok, true, k + ' 应相符');
    });
    const sp = C.sourcePanel(model, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    const local = sp.rows.filter(r => r.key === 'local')[0];
    assert.strictEqual(local.state, 'info');
    assert.strictEqual(local.ok, true);
    assert.ok(/适用于当前产物/.test(local.verdict), local.verdict);
    assert.ok(!/已核验/.test(local.verdict), '历史引用不得写成「已核验」：' + local.verdict);
  });

  it('反例①：新源产物 + 新内容 + 重签 + 无 pin ⇒ 不得继承历史复算与上游抽样', () => {
    const { verdict, model } = variantA(b => { b.generatedFrom.productionIntegral.sha256 = '0'.repeat(64); });
    assert.strictEqual(verdict.ok, true, '该变体内部核验应通过（这才构成"只凭内部核验就会误判"的攻击面）');
    const ev = C.evaluateEvidence(model, REGISTRY);
    assert.strictEqual(ev.status, 'NOT_APPLICABLE');
    assert.ok(ev.mismatched.indexOf('源产物摘要（独立计算）') >= 0, ev.mismatched.join('、'));
    const sp = C.sourcePanel(model, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    const local = sp.rows.filter(r => r.key === 'local')[0];
    assert.strictEqual(local.ok, false);
    assert.strictEqual(local.state, 'warn');
    assert.strictEqual(local.verdict, '历史报告存在，未确认适用于当前产物');
    assert.strictEqual(local.raw, 'HISTORY_NOT_BOUND');
    const up = sp.rows.filter(r => r.key === 'upstream')[0];
    assert.strictEqual(up.ok, false, '上游抽样也不得继承');
    assert.strictEqual(up.verdict, '历史报告存在，未确认适用于当前产物');
    assert.ok(!/属于已抽范围/.test(up.verdict), '身份不符时不得显示"属于已抽范围"：' + up.verdict);
  });

  it('反例②：保留旧源摘要、只改内容并重签 ⇒ 仅内容摘要不符也应失去适用性', () => {
    const { verdict, model } = variantA(b => { b.cellYears['cell_0020|2001'].missingReason = 'probe'; });
    assert.strictEqual(verdict.ok, true);
    const ev = C.evaluateEvidence(model, REGISTRY);
    assert.strictEqual(ev.status, 'NOT_APPLICABLE');
    assert.deepStrictEqual(ev.mismatched, ['内容摘要'], '此时源摘要仍相符，只有内容摘要不符');
    const sp = C.sourcePanel(model, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    assert.strictEqual(sp.rows.filter(r => r.key === 'local')[0].ok, false);
  });

  it('反例③：未载入登记 ⇒ 明确「未取得证据登记」，不给通过色', () => {
    const { model } = modelA();
    const ev = C.evaluateEvidence(model, null);
    assert.strictEqual(ev.status, 'NO_REGISTRY');
    const sp = C.sourcePanel(model, { registry: null, selection: { objectId: 'cell_0020', year: 2001 } });
    const local = sp.rows.filter(r => r.key === 'local')[0];
    assert.strictEqual(local.ok, false);
    assert.strictEqual(local.verdict, '未取得证据登记');
    assert.strictEqual(local.raw, 'NO_REGISTRY');
    assert.strictEqual(sp.evidenceStatus, 'NO_REGISTRY');
  });

  it('内存载入（无盘上字节）：内容可比、文件字节记为不可比，不冒充一致', () => {
    const { model } = modelA();
    const mem = Object.assign({}, model, { fileSha256: null });
    const ev = C.evaluateEvidence(mem, REGISTRY);
    assert.strictEqual(ev.status, 'APPLICABLE_CONTENT_ONLY');
    assert.deepStrictEqual(ev.uncomparable, ['文件字节']);
    const sp = C.sourcePanel(mem, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    const local = sp.rows.filter(r => r.key === 'local')[0];
    assert.strictEqual(local.ok, true);
    assert.ok(/文件字节未比对/.test(local.verdict), local.verdict);
  });

  it('上游抽样只在 9 个对象年内适用，其余一律「不在已抽范围」', () => {
    const { model } = modelA();
    const ev = C.evaluateEvidence(model, REGISTRY);
    assert.strictEqual(ev.upstream.sampleSize, 9);
    assert.strictEqual(ev.upstream.totalObjectYears, 840);
    assert.strictEqual(ev.upstream.objectYears.length, 9);
    const inA = C.upstreamSampleFor(ev, { objectId: 'cell_0020', year: 2001 });
    assert.strictEqual(inA.inSample, true);
    const outA = C.upstreamSampleFor(ev, { objectId: 'cell_0020', year: 2002 });
    assert.strictEqual(outA.inSample, false, '未抽中的对象年不得算进抽样范围');
    const spOut = C.sourcePanel(model, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2002 } });
    const upOut = spOut.rows.filter(r => r.key === 'upstream')[0];
    assert.strictEqual(upOut.ok, false);
    assert.ok(/不在已抽范围/.test(upOut.verdict), upOut.verdict);
    assert.ok(/9\s*\/\s*840/.test(upOut.verdict), upOut.verdict);
    assert.strictEqual(spOut.rows.filter(r => r.key === 'upstream')[0].state, 'warn');
  });

  it('B 案例：窗口哈希也参与身份对照', () => {
    const { model } = modelB();
    const ev = C.evaluateEvidence(model, REGISTRY);
    assert.strictEqual(ev.status, 'APPLICABLE');
    const w = ev.checks.filter(x => x.key === 'windowSha256')[0];
    assert.ok(w, 'B 案例必须检查 windowSha256');
    assert.strictEqual(w.ok, true);
    const broken = Object.assign({}, model, { windowSha256: 'local-sha256:' + '0'.repeat(64) });
    assert.strictEqual(C.evaluateEvidence(broken, REGISTRY).status, 'NOT_APPLICABLE');
  });

  it('登记与磁盘字节一致（--verify 的等价校验，不调用构建脚本）', () => {
    const a = sha(BUNDLE_A), b = sha(BUNDLE_B);
    assert.strictEqual(REGISTRY.cases.A.bundle.fileSha256, a, '登记里的 A 数据包字节摘要与磁盘不一致');
    assert.strictEqual(REGISTRY.cases.B.bundle.fileSha256, b, '登记里的 B 数据包字节摘要与磁盘不一致');
    REGISTRY.cases.A.sourceArtifacts.concat(REGISTRY.cases.B.sourceArtifacts).forEach(x => {
      assert.strictEqual(sha(path.join(ROOT, x.path)), x.sha256, '登记里的源产物摘要与磁盘不一致：' + x.path);
    });
  });
});

                                                                                 
describe('CarbonSat 研究工作台 v1.1 · pin 载入必须区分四类状态（P2-1）', function () {
                                                         
  function modelNoPin() {
    const b = readJson(BUNDLE_A);
    const fileSha = sha(BUNDLE_A);
    const verdict = N.verifyBundle(b, { fileSha256: fileSha });
    return C.buildModelA(b, { pin: null, fileSha256: fileSha, verdict });
  }

  it('未提供（404）⇒ 未与发布摘要比对，但仍可做内部查看', () => {
    const m = Object.assign(modelNoPin(), { pinInput: 'ABSENT', pinReason: '未找到：npp_estimate_bundle.pin.json' });
    assert.strictEqual(m.verdict.ok, true, 'pin 缺失不影响内部核验');
    const sp = C.sourcePanel(m, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    const pin = sp.rows.filter(r => r.key === 'pin')[0];
    assert.strictEqual(pin.ok, false);
    assert.strictEqual(pin.state, 'warn');
    assert.strictEqual(pin.verdict, '未与发布摘要比对');
    assert.strictEqual(pin.raw, 'PIN_ABSENT');
    assert.ok(/未提供发布摘要文件/.test(pin.detail), pin.detail);
                                    
    assert.strictEqual(sp.rows.filter(r => r.key === 'internal')[0].state, 'ok');
  });

  it('获取失败（网络 / HTTP）⇒ 明确写出未取得的原因，不写成「未提供」', () => {
    const m = Object.assign(modelNoPin(), { pinInput: 'FETCH_FAILED', pinReason: '网络获取失败：Failed to fetch' });
    const sp = C.sourcePanel(m, { registry: REGISTRY, selection: { objectId: 'cell_0020', year: 2001 } });
    const pin = sp.rows.filter(r => r.key === 'pin')[0];
    assert.strictEqual(pin.ok, false);
    assert.strictEqual(pin.verdict, '发布摘要未取得');
    assert.strictEqual(pin.raw, 'PIN_FETCH_FAILED');
    assert.ok(/获取失败/.test(pin.detail), pin.detail);
    assert.ok(/Failed to fetch/.test(pin.detail), '必须带出具体原因：' + pin.detail);
    assert.ok(!/未提供/.test(pin.detail), '不得降级成「未提供」：' + pin.detail);
  });

  it('文案表：pin 六类原始状态都有中文，且 MATCHED 前缀一律读作"与发布版本一致"', () => {
    ['MATCHED', 'MATCHED（内容 + 文件字节）', 'CONTENT_ONLY', 'MISMATCHED', 'PIN_ABSENT', 'PIN_INVALID', 'PIN_FETCH_FAILED', 'NOT_EVALUATED']
      .forEach(s => {
        const t = C.txPin(s);
        assert.ok(t && t.length > 0 && !/其他状态/.test(t), s + ' 缺中文文案：' + t);
      });
    assert.strictEqual(C.txPin('MATCHED（内容 + 文件字节）'), '与发布版本一致');
    assert.strictEqual(C.txPin('MISMATCHED'), '与发布摘要不符');
    assert.strictEqual(C.txPin(''), '未评估');
    assert.strictEqual(C.txCoverage('PARTIAL_COVERAGE'), '部分有效覆盖');
    assert.strictEqual(C.txCoverage('FULL_COVERAGE'), '全覆盖');
  });
});

                                                                                 
describe('CarbonSat 研究工作台 v1.1 · 缺测事实表述与实测一致（P2-2）', function () {
  const b = readJson(BUNDLE_A);
  const rows = Object.keys(b.cellYears).map(k => b.cellYears[k]);

  it('816 个整格年都有生产量：不存在整格缺测', () => {
    assert.strictEqual(rows.length, 816);
    assert.strictEqual(rows.filter(r => r.prod_tC_yr === null).length, 0, '存在整格生产量为 null 的年');
    assert.strictEqual(rows.filter(r => r.integral_kgC_yr === null).length, 0);
    assert.strictEqual(rows.filter(r => r.missing === true).length, 0);
  });

  it('23 条地类行零有效面积 ⇒ 保留 null（不是 0）', () => {
    const zero = [];
    rows.forEach(r => (r.landCover || []).forEach(x => { if (!(x.classValidAreaM2 > 0)) zero.push(r.cellId + '|' + r.year + '|' + x.lcCode); }));
    assert.strictEqual(zero.length, 23, '零有效面积的地类行数应为 23，实际 ' + zero.length);
    const zeroWithValue = [];
    rows.forEach(r => (r.landCover || []).forEach(x => {
      if (!(x.classValidAreaM2 > 0) && (x.prod_tC_yr !== null || x.intensity_kg_m2_yr !== null)) zeroWithValue.push(x.lcCode);
    }));
    assert.deepStrictEqual(zeroWithValue, [], '零有效面积的地类行不得带生产量');
  });

  it('适配层把零有效面积读成 null + 原因，而不是 0', () => {
    const { model } = modelA();
    let checked = 0;
    model.objects.forEach(o => model.years.forEach(y => {
      const d = C.detailOf(model, o.id, y);
      d.landCover.filter(x => x.note).forEach(x => {
        checked += 1;
        assert.strictEqual(x.prod, null);
        assert.strictEqual(x.intensity, null);
        assert.ok(/不是真零/.test(x.note), x.note);
      });
    }));
    assert.strictEqual(checked, 23, '遍历到的零有效面积行应为 23，实际 ' + checked);
  });

  it('软件仍支持将来的整格缺测：缺测 ⇒ null 且界面不填 0', () => {
    const fake = {
      caseKey: 'A', years: [2001], objects: [{ id: 'c', label: 'c', bbox: { W: 0, S: 0, E: 1, N: 1 } }],
      bundle: {
        cellYears: {
          'c|2001': { cellId: 'c', year: 2001, missing: true, missingReason: 'cloud', prod_tC_yr: null, integral_kgC_yr: null, geomAreaM2: 1, gridTotalAreaM2: 1, gridValidAreaM2: 0, validAreaRatio: 0, landCover: [] },
        },
        methodology: {}, generatedFrom: {},
      },
      verdict: {},
    };
    const d = C.detailOf(fake, 'c', 2001);
    assert.strictEqual(d.prod, null);
    assert.ok(/不填 0|不可用/.test(d.unusableReason) || d.unusableReason.length > 0, d.unusableReason);
    assert.strictEqual(C.valueOf(fake, 'c', 2001).value, null);
  });
});
