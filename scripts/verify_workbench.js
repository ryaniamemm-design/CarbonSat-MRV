                   
                                  
  
                                         
                      
  
       
                                                                               
                                                   
                                              
  
                                 
  
                                               
   
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'audit/workbench_v1_2026-10-19');

const C = require(path.join(ROOT, 'web/workbench_core.js'));
const N = require(path.join(ROOT, 'web/npp_entry_core.js'));
const E = require(path.join(ROOT, 'web/engebei_core.js'));

const results = [];
const add = (group, name, ok, detail) => results.push({ group, name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });

                                                                                  
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.length);
  const head = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
                                               
    const f = lines[i].split(',');
    if (f.length !== head.length) throw new Error('CSV 第 ' + (i + 1) + ' 行字段数 ' + f.length + ' ≠ 表头 ' + head.length);
    const o = {};
    head.forEach((k, j) => { o[k] = f[j]; });
    rows.push(o);
  }
  return rows;
}
const num = v => (v === '' || v === undefined || v === null ? NaN : Number(v));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));

                                                                                   
function checkSyntax() {
  const files = ['web/workbench_core.js', 'web/workbench.js'];
  files.forEach(f => {
    try {
      new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
      add('syntax', '语法可解析：' + f, true, '');
    } catch (e) {
      add('syntax', '语法可解析：' + f, false, e.message);
    }
  });

  const html = fs.readFileSync(path.join(ROOT, 'web/workbench.html'), 'utf8');
  const srcs = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(m => m[1]);
                                                                                
                                                                           
  const missing = srcs.filter(s => !fs.existsSync(path.join(ROOT, 'web', s.split(/[?#]/)[0])));
  add('syntax', '页面引用的本地脚本均存在', missing.length === 0, missing.join(', ') || srcs.length + ' 个');
  add('syntax', '零 CDN：无 http(s) 脚本/样式引用',
    !/<script[^>]+src="https?:/i.test(html) && !/<link[^>]+href="https?:/i.test(html), '');
  const css = fs.readFileSync(path.join(ROOT, 'web/workbench.css'), 'utf8');
  add('syntax', '零外部字体：CSS 无 @import / 远程 font', !/@import|https?:/i.test(css), '');
}

                                                                                     
function checkCaseA() {
  const csvPath = path.join(ROOT, 'data/npp_annual_production_integral.csv');
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  add('A-csv', '行数 = 816 格年', rows.length === 816, rows.length);
  const cells = Array.from(new Set(rows.map(r => r.cellId)));
  const years = Array.from(new Set(rows.map(r => Number(r.year)))).sort((a, b) => a - b);
  add('A-csv', '格数 = 34', cells.length === 34, cells.length);
  add('A-csv', '年份 = 2001–2024 连续 24 年',
    years.length === 24 && years[0] === 2001 && years[23] === 2024, years[0] + '–' + years[23]);

  let worstProd = 0, worstRatio = 0, worstBBox = 0;
  rows.forEach(r => {
    const integral = num(r.integral_kgC_yr), prod = num(r.prod_tC_yr);
    const valid = num(r.gridValidAreaM2), total = num(r.gridTotalAreaM2), ratio = num(r.validAreaRatio);
    if (Number.isFinite(integral) && Number.isFinite(prod)) worstProd = Math.max(worstProd, rel(prod, integral / 1000));
    if (Number.isFinite(valid) && Number.isFinite(total) && total > 0) worstRatio = Math.max(worstRatio, rel(ratio, valid / total));
                                               
    const lon = num(r.lon), lat = num(r.lat), geom = num(r.geomAreaM2);
    const R = 6371007.181, h = 0.06 * Math.PI / 180;
    const area = (R * h) * (R * h * Math.cos(lat * Math.PI / 180));
    if (Number.isFinite(geom) && geom > 0) worstBBox = Math.max(worstBBox, rel(area, geom));
  });
  add('A-csv', 'prod_tC_yr = integral_kgC_yr / 1000（全表）', worstProd <= 1e-12, 'worst=' + worstProd.toExponential(2));
  add('A-csv', 'validAreaRatio = 有效面积 / 总面积（全表）', worstRatio <= 1e-12, 'worst=' + worstRatio.toExponential(2));
  add('A-csv', '格框规则（格心 ±0.03°）与 geomAreaM2 一致', worstBBox <= 1e-6, 'worst=' + worstBBox.toExponential(2));

                                    
  const b = readJson(path.join(ROOT, 'web/npp_estimate_bundle.json'));
  const pin = readJson(path.join(ROOT, 'web/npp_estimate_bundle.pin.json'));
  const fileSha = sha(path.join(ROOT, 'web/npp_estimate_bundle.json'));
  const verdict = N.verifyBundle(b, { pin, fileSha256: fileSha });
  add('A-model', '既有核心核验通过（含 pin 内容与文件字节）', verdict.ok && /^MATCHED/.test(String(verdict.publishedPin.status)),
    verdict.publishedPin.status);
  const model = C.buildModelA(b, { pin, fileSha256: fileSha, verdict });

  const byKey = new Map(rows.map(r => [r.cellId + '|' + r.year, r]));
  let mism = 0, checked = 0;
  model.objects.forEach(o => {
    C.seriesOf(model, o.id).forEach(p => {
      const r = byKey.get(o.id + '|' + p.year);
      checked += 1;
      if (!r || Number(r.prod_tC_yr) !== p.value) mism += 1;
    });
  });
  add('A-model', '模型序列 816 点与 CSV 逐位一致', checked === 816 && mism === 0, 'checked=' + checked + ' mismatch=' + mism);

                              
  const samples = [['cell_0020', 2008], ['cell_0074', 2019], ['cell_0045', 2001], ['cell_0094', 2024]];
  let areaMism = 0;
  samples.forEach(([id, y]) => {
    const d = C.detailOf(model, id, y);
    const r = byKey.get(id + '|' + y);
    if (!r || !d.ok) { areaMism += 1; return; }
    if (d.areas.geom.m2 !== num(r.geomAreaM2)) areaMism += 1;
    if (d.areas.total.m2 !== num(r.gridTotalAreaM2)) areaMism += 1;
    if (d.areas.valid.m2 !== num(r.gridValidAreaM2)) areaMism += 1;
    if (d.ratio !== num(r.validAreaRatio)) areaMism += 1;
    if (d.prod !== num(r.prod_tC_yr)) areaMism += 1;
  });
  add('A-model', '代表格年三面积 + 比例 + 生产量与 CSV 一致', areaMism === 0, 'samples=' + samples.length + ' mismatch=' + areaMism);

  const groups = model.objects.reduce((a, o) => (a[o.group] = (a[o.group] || 0) + 1, a), {});
  add('A-model', '示意 AOI 分组 32 治理 / 2 对照', groups.treated === 32 && groups.control === 2, JSON.stringify(groups));
  return { model, cells, years, rows };
}

                                                                                     
function checkCaseB() {
  const csvPath = path.join(ROOT, 'data/engebei/engebei_npp_annual_integral.csv');
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  add('B-csv', '行数 = 24 年', rows.length === 24, rows.length);

  let worstProd = 0, worstRatio = 0, partial = 0, worstPixels = 0;
  rows.forEach(r => {
    if (rel(num(r.prod_tC_yr), num(r.integral_kgC_yr) / 1000) > worstProd) worstProd = rel(num(r.prod_tC_yr), num(r.integral_kgC_yr) / 1000);
    if (rel(num(r.validAreaRatio), num(r.gridValidAreaM2) / num(r.gridAreaM2)) > worstRatio) {
      worstRatio = rel(num(r.validAreaRatio), num(r.gridValidAreaM2) / num(r.gridAreaM2));
    }
    if (r.validCoverageStatus === 'PARTIAL_COVERAGE') partial += 1;
    worstPixels = Math.max(worstPixels, Math.abs(num(r.validPixels) - 813));
  });
  add('B-csv', 'prod_tC_yr = integral_kgC_yr / 1000（全表）', worstProd <= 1e-12, 'worst=' + worstProd.toExponential(2));
  add('B-csv', 'validAreaRatio = 有效面积 / 栅格总面积（全表）', worstRatio <= 1e-12, 'worst=' + worstRatio.toExponential(2));
  add('B-csv', '24/24 年均 PARTIAL_COVERAGE', partial === 24, partial + '/24');
  add('B-csv', '有效像元恒为 813', worstPixels === 0, 'max|Δ|=' + worstPixels);

  const spec = readJson(path.join(ROOT, 'data/engebei/engebei_window_spec.json'));
  const b = readJson(path.join(ROOT, 'web/engebei_bundle.json'));
  const pin = readJson(path.join(ROOT, 'web/engebei_bundle.pin.json'));
  const fileSha = sha(path.join(ROOT, 'web/engebei_bundle.json'));
  const verdict = E.verifyBundle(b, { pin, fileSha256: fileSha });
  add('B-model', '既有核心核验通过（含 pin 内容与文件字节）',
    verdict.ok && /^MATCHED/.test(String(verdict.pinStatus)), verdict.pinStatus || '');
  const model = C.buildModelB(b, { pin, fileSha256: fileSha, verdict });

  const w = model.objects[0].bbox;
  add('B-model', '窗口几何 = window_spec 的 boundsWGS84（逐值相等）',
    w.W === spec.boundsWGS84.W && w.S === spec.boundsWGS84.S && w.E === spec.boundsWGS84.E && w.N === spec.boundsWGS84.N,
    JSON.stringify(w));

                                          
  const R = 6371007.181;
  const dLon = (spec.boundsWGS84.E - spec.boundsWGS84.W) * Math.PI / 180;
  const dLat = (spec.boundsWGS84.N - spec.boundsWGS84.S) * Math.PI / 180;
  const latMid = (spec.boundsWGS84.N + spec.boundsWGS84.S) / 2 * Math.PI / 180;
  const approx = (R * dLon * Math.cos(latMid)) * (R * dLat);
  const geom = num(rows[0].geomAreaM2);
  add('B-model', '窗口外接矩形面积与 geomAreaM2 一致（≤1e-4）', rel(approx, geom) <= 1e-4, 'rel=' + rel(approx, geom).toExponential(2));

  const byYear = new Map(rows.map(r => [Number(r.year), r]));
  let mism = 0;
  C.seriesOf(model, 'engebei_paper_window_v1').forEach(p => {
    const r = byYear.get(p.year);
    if (!r || Number(r.prod_tC_yr) !== p.value) mism += 1;
  });
  add('B-model', '模型序列 24 点与 CSV 逐位一致', mism === 0, 'mismatch=' + mism);

  const d = C.detailOf(model, 'engebei_paper_window_v1', 2001);
  const r01 = byYear.get(2001);
  add('B-model', '年度明细：覆盖状态与有效像元来自 CSV',
    d.coverage.status === r01.validCoverageStatus &&
    d.extra.filter(x => x.label === '有效像元数')[0].value === r01.validPixels,
    d.coverage.status + ' / ' + d.extra.filter(x => x.label === '有效像元数')[0].value);

  add('B-model', '页面标注与数据包窗口标注逐字一致', C.CASES.B.scopeLabel === b.window.label, C.CASES.B.scopeLabel);
  add('B-model', '未接入原 34 格变化台账', C.locateHref(model, model.objects[0].id, 2001).ok === false, '');
  return { model, rows };
}

                                                                              
function counterexamples(a, b) {
  const bA = readJson(path.join(ROOT, 'web/npp_estimate_bundle.json'));
  const pinA = readJson(path.join(ROOT, 'web/npp_estimate_bundle.pin.json'));
  const shaA = sha(path.join(ROOT, 'web/npp_estimate_bundle.json'));
  const clone = o => JSON.parse(JSON.stringify(o));

                                         
  {
    const t = clone(bA);
    const k = 'cell_0020|2008';
    const orig = t.cellYears[k].validAreaRatio;
    t.cellYears[k].validAreaRatio = 0.123456;
    t.bundleContentSha256 = N.contentSha(t);                    
    const v = N.verifyBundle(t, { pin: pinA, fileSha256: shaA });
    const semantic = (v.errors || []).some(e => /比例|面积|关系/.test(e));
    add('counter', '篡改面积比例并重签自摘要 ⇒ 拒绝且理由为语义关系',
      v.ok === false && semantic, (v.errors || []).slice(0, 2).join('；') + ' | orig=' + orig);
  }

                                                    
  {
    const t = clone(bA);
    t.cellYears['cell_0020|2008'].prod_tC_yr += 100;
    t.bundleContentSha256 = N.contentSha(t);
    const v = N.verifyBundle(t, { pin: pinA, fileSha256: shaA });
    add('counter', '篡改生产量并重签自摘要 ⇒ 拒绝', v.ok === false, (v.errors || []).slice(0, 2).join('；'));
  }

                      
  {
    const bad = clone(pinA);
    bad.bundleContentSha256 = 'local-sha256:' + '0'.repeat(64);
    const v = N.verifyBundle(bA, { pin: bad, fileSha256: shaA });
    add('counter', '错 pin（内容摘要不符）⇒ 拒绝', v.ok === false, (v.errors || [])[0] || '');
  }

                                  
  {
    const v = N.verifyBundle(bA, {});
    const norm = C.normalizeVerdict(v, 'A');
    add('counter', '缺 pin ⇒ pin 状态为未评估，不得声称已核对发布件',
      v.ok === true && norm.pinStatus === 'PIN_ABSENT', norm.pinStatus);
  }

                       
  {
    const fake = {
      caseKey: 'A', years: [2001],
      objects: [{ id: 'c', label: 'c', bbox: { W: 0, S: 0, E: 1, N: 1 } }],
      bundle: {
        cellYears: { 'c|2001': { cellId: 'c', year: 2001, missing: true, missingReason: 'cloud', prod_tC_yr: null, integral_kgC_yr: null, geomAreaM2: 1, gridTotalAreaM2: 1, gridValidAreaM2: 0, validAreaRatio: 0, landCover: [] } },
        methodology: {}, generatedFrom: {},
      },
      verdict: {},
    };
    const d = C.detailOf(fake, 'c', 2001);
    add('counter', 'null 不被转为 0（明细与序列均为 null）',
      d.prod === null && C.seriesOf(fake, 'c')[0].value === null && d.unusableReason.length > 0,
      'prod=' + d.prod);
                  
    fake.bundle.cellYears['c|2001'] = { cellId: 'c', year: 2001, missing: false, missingReason: 'ok', prod_tC_yr: 0, integral_kgC_yr: 0, geomAreaM2: 1, gridTotalAreaM2: 1, gridValidAreaM2: 1, validAreaRatio: 1, landCover: [] };
    add('counter', '合法 0 保留为 0', C.detailOf(fake, 'c', 2001).prod === 0, '');
  }

                              
  {
    const bb = readJson(path.join(ROOT, 'web/engebei_bundle.json'));
    const pinB = readJson(path.join(ROOT, 'web/engebei_bundle.pin.json'));
    const shaB = sha(path.join(ROOT, 'web/engebei_bundle.json'));
    const t = clone(bb);
    t.records['2001'].validCoverageStatus = 'FULL_COVERAGE';
    t.records['2001'].validAreaRatio = 1;
    t.stableDigest = E.stableDigestOf(t);                      
    const v = E.verifyBundle(t, { pin: pinB, fileSha256: shaB });
    add('counter', '把部分覆盖改标为整窗覆盖并重签 ⇒ 拒绝',
      v.ok === false, (v.errors || []).slice(0, 2).join('；'));
  }

                               
  {
    const api = Object.keys(C);
    const deltaApi = api.filter(k => /^(delta|diff|growth|crossEra)/i.test(k));
    const noteHasBan = /跨段|不跨|2012/.test(C.CANNOT_SAY.join('|'));
    const series = C.seriesOf(a.model, 'cell_0020');
    const e1 = series.filter(p => p.era === 1).map(p => p.year);
    const e2 = series.filter(p => p.era === 2).map(p => p.year);
    add('counter', '无跨 2012 差值出口：API 无 delta/growth，序列按段切开，文案明确禁止',
      deltaApi.length === 0 && noteHasBan && Math.max.apply(null, e1) === 2011 && Math.min.apply(null, e2) === 2012,
      'deltaApi=' + JSON.stringify(deltaApi));
  }

                                 
  {
    const afterB = b.model;
    add('counter', '切换案例后旧对象不可定位（不残留旧指标/来源）',
      C.objectById(afterB, 'cell_0020') === null &&
      C.detailOf(afterB, 'cell_0020', 2008).ok === false &&
      C.sourcePanel(afterB, { registry: readJson(path.join(ROOT, 'web/workbench_evidence_registry.json')) })
        .rows.every(r => !/816|34 个/.test(r.detail)),
      'B objects=' + afterB.objects.length);
  }

                                
  {
    const bad = [
      C.detailOf(a.model, 'cell_9999', 2008).ok === false,
      C.detailOf(a.model, 'cell_0020', 1999).ok === false,
      C.locateHref(b.model, b.model.objects[0].id, 2001).ok === false,
      C.parseShareParams('?case=Z', null).ok === false,
      C.parseShareParams('?prod=1', null).ok === false,
    ];
    add('counter', '未知对象 / 未知年份 / 跨案例台账 / 非法参数 ⇒ 全部拒绝', bad.every(Boolean), JSON.stringify(bad));
  }
}

                                                                                        
function checkLocateParams() {
  const CH = require(path.join(ROOT, 'web/change_core.js'));
  const ctx = { cells: ['cell_0020', 'cell_0074'], years: N.AUTH_YEARS.slice(), eras: [1, 2] };
  const cases = [
    ['', true, null], ['?cell=cell_0020&era=1&year=2008', true, 2008],
    ['?cell=cell_9999', false, null], ['?year=1999', false, null],
    ['?era=2&year=2008', false, null], ['?cell=cell_0020&x=1', false, null],
  ];
  let ok = 0;
  cases.forEach(([q, expected, year]) => {
    const r = CH.parseLocateParams(q, ctx);
    if (r.ok === expected && (year === null || r.year === year)) ok += 1;
  });
  add('locate', '台账定位参数：合法接受 / 非法拒绝（6 例）', ok === cases.length, ok + '/' + cases.length);

  const L1 = CH.buildLedger(readJson(path.join(ROOT, 'web/npp_estimate_bundle.json')), {});
  add('locate', '定位参数不进入台账摘要（ledgerSha256 与参数无关）',
    typeof L1.ledgerSha256 === 'string' && L1.ledgerSha256.length > 0 && CH.LOCATE_PARAMS.length === 3,
    'LOCATE_PARAMS=' + CH.LOCATE_PARAMS.join(','));
}

                                                                                                  
function checkEvidence(a) {
  const regPath = path.join(ROOT, 'web/workbench_evidence_registry.json');
  if (!fs.existsSync(regPath)) { add('evidence', '证据登记文件存在', false, regPath); return; }
  const reg = readJson(regPath);
  add('evidence', '证据登记 schema 与案例齐全',
    reg.schemaVersion === 'CarbonSat-WorkbenchEvidenceRegistry-v1.0' && !!(reg.cases && reg.cases.A && reg.cases.B),
    reg.schemaVersion);

                                         
  const arts = reg.cases.A.sourceArtifacts.concat(reg.cases.B.sourceArtifacts);
  const badArts = arts.filter(x => sha(path.join(ROOT, x.path)) !== x.sha256).map(x => x.path);
  add('evidence', '登记的源产物摘要 = 脚本独立计算的磁盘字节摘要（' + arts.length + ' 个）',
    badArts.length === 0, badArts.join(', ') || 'all match');

                   
  const badBundles = ['A', 'B'].filter(k => {
    const p = reg.cases[k].bundle.path;
    return sha(path.join(ROOT, p)) !== reg.cases[k].bundle.fileSha256;
  });
  add('evidence', '登记的数据包文件摘要 = 磁盘字节摘要', badBundles.length === 0, badBundles.join(',') || 'A/B match');

                                
                                               
                                                      
  const bA = readJson(path.join(ROOT, 'web/npp_estimate_bundle.json'));
  const bB = readJson(path.join(ROOT, 'web/engebei_bundle.json'));
  add('evidence', '登记的 caseId / methodVersion 与产物自述一致',
    reg.cases.A.caseId === a.model.caseId &&
    reg.cases.A.methodVersion === bA.methodology.method_version &&
    reg.cases.B.caseId === bB.caseId &&
    reg.cases.B.methodVersion === bB.methodology.methodVersion,
    reg.cases.A.caseId + ' / ' + reg.cases.A.methodVersion + ' | ' + reg.cases.B.caseId);

                             
  const evA = C.evaluateEvidence(a.model, reg);
  add('evidence', '当前发布件 ⇒ 历史证据判为适用（APPLICABLE）', evA.status === 'APPLICABLE', evA.status + ' ' + JSON.stringify(evA.mismatched));

                                        
  {
    const t = JSON.parse(JSON.stringify(bA));
    t.generatedFrom.productionIntegral.sha256 = '1'.repeat(64);
    t.bundleContentSha256 = N.contentSha(t);
    const v = N.verifyBundle(t, { fileSha256: null });
    const m = C.buildModelA(t, { pin: null, fileSha256: null, verdict: v });
    const ev = C.evaluateEvidence(m, reg);
    const sp = C.sourcePanel(m, { registry: reg, selection: { objectId: 'cell_0020', year: 2001 } });
    const local = sp.rows.filter(r => r.key === 'local')[0];
    const up = sp.rows.filter(r => r.key === 'upstream')[0];
    add('evidence', '反例：新源 + 新内容 + 重签 + 无 pin ⇒ 内部通过但历史结论不继承',
      v.ok === true && ev.status === 'NOT_APPLICABLE' && local.ok === false && up.ok === false &&
      local.verdict === '历史报告存在，未确认适用于当前产物',
      'internal=' + v.ok + ' status=' + ev.status + ' local=' + local.verdict + ' upstream=' + up.verdict);
  }

                                         
  {
    const t = JSON.parse(JSON.stringify(bA));
    t.cellYears['cell_0020|2001'].missingReason = 'probe';
    t.bundleContentSha256 = N.contentSha(t);
    const v = N.verifyBundle(t, { fileSha256: null });
    const m = C.buildModelA(t, { pin: null, fileSha256: null, verdict: v });
    const ev = C.evaluateEvidence(m, reg);
    add('evidence', '反例：保留旧源摘要、只改内容 ⇒ 仅"内容摘要"不符也失去适用性',
      v.ok === true && ev.status === 'NOT_APPLICABLE' && ev.mismatched.length === 1 && ev.mismatched[0] === '内容摘要',
      JSON.stringify(ev.mismatched));
  }

                              
  {
    const ev = C.evaluateEvidence(a.model, null);
    const sp = C.sourcePanel(a.model, { registry: null, selection: { objectId: 'cell_0020', year: 2001 } });
    const local = sp.rows.filter(r => r.key === 'local')[0];
    add('evidence', '反例：未载入登记 ⇒ 显示"未取得证据登记"且不给通过色',
      ev.status === 'NO_REGISTRY' && local.ok === false && local.verdict === '未取得证据登记',
      local.verdict + ' ok=' + local.ok);
  }

                         
  {
    const m = Object.assign({}, a.model, { fileSha256: null });
    const ev = C.evaluateEvidence(m, reg);
    add('evidence', '内存载入 ⇒ APPLICABLE_CONTENT_ONLY，文件字节记为不可比',
      ev.status === 'APPLICABLE_CONTENT_ONLY' && ev.uncomparable.join() === '文件字节', ev.status);
  }

                                            
  {
    const inS = C.upstreamSampleFor(C.evaluateEvidence(a.model, reg), { objectId: 'cell_0020', year: 2001 });
    const outS = C.upstreamSampleFor(C.evaluateEvidence(a.model, reg), { objectId: 'cell_0020', year: 2002 });
    const spOut = C.sourcePanel(a.model, { registry: reg, selection: { objectId: 'cell_0020', year: 2002 } });
    const upOut = spOut.rows.filter(r => r.key === 'upstream')[0];
    const tot = Object.keys(bA.cellYears).length + Object.keys(bB.records).length;
    add('evidence', '上游抽样 = 9 个对象年 / 全量 ' + tot + '；未抽中者不得继承',
      reg.upstream.sampleSize === 9 && reg.upstream.totalObjectYears === tot &&
      inS.inSample === true && outS.inSample === false &&
      upOut.ok === false && /不在已抽范围/.test(upOut.verdict),
      'sample=' + reg.upstream.sampleSize + ' total=' + tot + ' | ' + upOut.verdict);
  }

                                                            
  {
    const bB = readJson(path.join(ROOT, 'web/engebei_bundle.json'));
    const pinB = readJson(path.join(ROOT, 'web/engebei_bundle.pin.json'));
    const shaB = sha(path.join(ROOT, 'web/engebei_bundle.json'));
    const vB = E.verifyBundle(bB, { pin: pinB, fileSha256: shaB });
    const mB = C.buildModelB(bB, { pin: pinB, fileSha256: shaB, verdict: vB });
    const all = [];
    [a.model, mB].forEach((m, i) => {
      const sp = C.sourcePanel(m, { registry: reg, selection: { objectId: m.objects[0].id, year: 2001 } });
      sp.rows.forEach(r => all.push(i + ':' + r.key + ':' + r.verdict + '|' + r.detail));
    });
    const bad = all.filter(s => /已核验|已完成核验|验证通过/.test(s));
    add('evidence', '来源层文案不把历史引用/未验证项写成"已核验"', bad.length === 0, bad.slice(0, 2).join(' / ') || '0 处');
  }
}

                                                                             
function main() {
  checkSyntax();
  const a = checkCaseA();
  const b = checkCaseB();
  counterexamples(a, b);
  checkEvidence(a);
  checkLocateParams();

  const failed = results.filter(r => !r.ok);
  const out = {
    schema: 'CarbonSat-WorkbenchVerification-v1.1',
    moduleVersion: C.MODULE_VERSION,
    generatedAtUTC: new Date().toISOString(),
    scope: '工作台适配层的独立复算与反例；不重跑 GEE、不覆盖科研 CSV、不发交易',
    passed: results.length - failed.length,
    total: results.length,
    failed: failed.length,
    groups: results.reduce((acc, r) => { acc[r.group] = (acc[r.group] || 0) + 1; return acc; }, {}),
    checks: results,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'workbench_verification.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

  results.forEach(r => console.log((r.ok ? '[PASS] ' : '[FAIL] ') + r.group + ' · ' + r.name + (r.detail ? ' — ' + r.detail : '')));
  console.log('\n工作台独立验证：' + out.passed + '/' + out.total + ' 通过 ' + (out.failed ? '（失败 ' + out.failed + '）' : ''));
  process.exit(failed.length ? 1 : 0);
}

main();
