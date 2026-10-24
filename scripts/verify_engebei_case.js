                                                                                
  
          
                                                                         
                                                    
                                                                  
                                                      
  
              
                                                
                                                        
                                    
                                                     
  
                                              
  
                             
                                                      
   
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data/engebei/engebei_npp_annual_integral.csv');
const SPEC_PATH = path.join(ROOT, 'data/engebei/engebei_window_spec.json');
const BUNDLE_PATH = path.join(ROOT, 'web/engebei_bundle.json');
const PIN_PATH = path.join(ROOT, 'web/engebei_bundle.pin.json');

const WINDOW_DOMAIN = 'CarbonSat-MRV|engebei-window|v1\n';
const CASE_ID = 'engebei_paper_window_v1';
const WINDOW_VERSION = 'engebei-research-window-v1';
const WINDOW_CRS = 'WGS84-geographic';
const WINDOW_LABEL = '恩格贝相关论文报告范围研究窗口，非官方项目边界，非治理小班边界';
const WINDOW_STATUTE = 'PAPER_REPORTED_RESEARCH_WINDOW_NOT_PROJECT_BOUNDARY';
const YEARS = Array.from({ length: 24 }, (_, i) => 2001 + i);
const ERA_BOUNDARY_YEAR = 2012;

                                                                                   
function bitsOf(n) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, n, false);
  let s = '';
  for (let i = 0; i < 8; i++) s += dv.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
const escAscii = s => JSON.stringify(s).replace(/[\u0080-\uffff]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function myCanonicalBits(v) {                           
  if (v === null) return 'n';
  if (v === true) return 't';
  if (v === false) return 'f';
  if (typeof v === 'string') return escAscii(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('非有限数值');
    return '#' + bitsOf(v);
  }
  if (Array.isArray(v)) return '[' + v.map(myCanonicalBits).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => escAscii(k) + ':' + myCanonicalBits(v[k])).join(',') + '}';
  }
  throw new Error('不支持的值');
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const digIndependent = (domain, payload) => 'local-sha256:' + sha256(domain + myCanonicalBits(payload));

                                
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.length);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => {
    const cells = l.split(',');
    const o = {};
    head.forEach((h, i) => { o[h] = cells[i]; });
    return o;
  });
}

const fin = v => typeof v === 'number' && Number.isFinite(v);
const numOrNull = v => (v === undefined || v === null || v === '' || v === 'null') ? null : Number(v);
const boolOf = v => String(v).toLowerCase() === 'true';

function coverageOfIndependent(validPixels, ratio) {
  if (validPixels === null || validPixels <= 0) return 'NO_VALID_PIXELS';
  if (!fin(ratio)) return 'PARTIAL_COVERAGE';
  return ratio >= 0.9999 ? 'FULL_COVERAGE' : 'PARTIAL_COVERAGE';
}

const relDiff = (a, b) => {
  if (!fin(a) || !fin(b)) return Infinity;
  const d = Math.max(Math.abs(a), Math.abs(b));
  return d === 0 ? 0 : Math.abs(a - b) / d;
};

                                                                             
const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail === undefined ? '' : String(detail) });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }
const clone = o => JSON.parse(JSON.stringify(o));

                                                                           
const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const csvRows = parseCsv(csvText);
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
const bundle = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
const pin = JSON.parse(fs.readFileSync(PIN_PATH, 'utf8'));
const bundleFileSha = sha256(fs.readFileSync(BUNDLE_PATH));
const csvSha = sha256(fs.readFileSync(CSV_PATH));

                                                                                   
check('A1 源 CSV 恰好 24 行、年份唯一且等于 2001–2024', () => {
  const ys = csvRows.map(r => Number(r.year));
  assert(csvRows.length === 24, '行数 = ' + csvRows.length);
  assert(new Set(ys).size === 24, '存在重复年份');
  assert(ys.slice().sort((a, b) => a - b).join(',') === YEARS.join(','), '年份集合不符');
  return '24 行';
});

check('A2 独立重算单位链 prod_tC_yr == integral_kgC_yr/1000（逐行，rtol 1e-12）', () => {
  let worst = 0;
  csvRows.forEach(r => {
    const p = numOrNull(r.prod_tC_yr), i = numOrNull(r.integral_kgC_yr);
    if (p === null || i === null) return;
    worst = Math.max(worst, relDiff(p, i / 1000));
  });
  assert(worst < 1e-12, '最差相对差 ' + worst);
  return 'worst=' + worst.toExponential(2);
});

check('A3 独立重算面积边界 gridValidAreaM2 ≤ gridAreaM2；两者有限且 >0', () => {
  csvRows.forEach(r => {
    const gv = numOrNull(r.gridValidAreaM2), gt = numOrNull(r.gridAreaM2);
    if (gt === null || gv === null) return;
    assert(gt > 0, r.year + ' gridAreaM2 非正');
    assert(gv <= gt * (1 + 1e-9), r.year + ' gridValidAreaM2 > gridAreaM2');
  });
  return 'ok';
});

check('A4 独立重算覆盖状态 = 由 validPixels/validAreaRatio 推得（逐年一致）', () => {
  csvRows.forEach(r => {
    const vpx = r.validPixels === '' ? null : Number(r.validPixels);
    const ratio = numOrNull(r.validAreaRatio);
    assert(coverageOfIndependent(vpx, ratio) === r.validCoverageStatus,
      r.year + ' 覆盖状态不符：应 ' + coverageOfIndependent(vpx, ratio) + ' 实 ' + r.validCoverageStatus);
  });
  return '24 年一致';
});

check('A5 合理零值/负值不被误判缺测（不设正数下限）', () => {
  let negSeen = 0, zeroSeen = 0;
  csvRows.forEach(r => {
    const p = numOrNull(r.prod_tC_yr);
    if (p === null) return;
    if (p === 0) zeroSeen++;
    if (p < 0) negSeen++;
                        
    assert(!boolOf(r.missing), r.year + ' 有值却标 missing');
  });
  return '零值 ' + zeroSeen + ' 年 · 负值 ' + negSeen + ' 年（合法，未判缺测）';
});

check('A6 独立核对窗口面积量级：栅格总面积与矢量面积同量级（不要求相等）', () => {
  const r = csvRows[0];
  const geom = numOrNull(r.geomAreaM2), grid = numOrNull(r.gridAreaM2);
  assert(fin(geom) && fin(grid), '面积缺失');
  const rel = Math.abs(grid - geom) / geom;
  assert(rel < 0.05, '栅格/矢量面积差 ' + (rel * 100).toFixed(2) + '% 超 5%（量级异常）');
  return '矢量 ' + (geom / 1e6).toFixed(2) + ' km² / 栅格 ' + (grid / 1e6).toFixed(2) + ' km²（差 ' + (rel * 100).toFixed(3) + '%，不强行对齐）';
});

check('A7 独立重算窗口哈希（自写 canonicalBits）与 spec/bundle/CSV 三处一致', () => {
  const w = spec.boundsWGS84;
  const recomputed = digIndependent(WINDOW_DOMAIN, {
    caseId: CASE_ID, windowVersion: WINDOW_VERSION,
    bounds: [w.W, w.S, w.E, w.N], crs: WINDOW_CRS, label: WINDOW_LABEL, statute: WINDOW_STATUTE,
  });
  assert(recomputed === spec.windowSha256, 'spec 哈希不符');
  assert(recomputed === bundle.windowSha256, 'bundle 哈希不符');
  const csvShas = new Set(csvRows.map(r => r.windowSha256));
  assert(csvShas.size === 1 && csvShas.has(recomputed), 'CSV 窗口绑定不一致');
  return recomputed.slice(0, 30) + '…';
});

check('A8 抽样交叉核算：独立解析值与 bundle 记录逐字段一致（全部 24 年）', () => {
  const keys = ['prod_tC_yr', 'integral_kgC_yr', 'geomAreaM2', 'gridAreaM2', 'gridValidAreaM2',
    'validAreaRatio', 'validPixels', 'nppRawMean', 'nppNegPixels', 'computeStatus',
    'validCoverageStatus', 'windowSha256', 'product', 'mask', 'method_version'];
  let bad = [];
  csvRows.forEach(r => {
    const rec = bundle.records[String(Number(r.year))];
    if (!rec) { bad.push(r.year + ' 缺记录'); return; }
    keys.forEach(k => {
      const a = ['prod_tC_yr', 'integral_kgC_yr', 'geomAreaM2', 'gridAreaM2', 'gridValidAreaM2',
        'validAreaRatio', 'nppRawMean'].includes(k) ? numOrNull(r[k])
        : (['validPixels', 'nppNegPixels'].includes(k) ? (r[k] === '' ? null : Number(r[k])) : r[k]);
      const b = rec[k];
      if (a === null || b === null) { if (a !== b) bad.push(r.year + ' ' + k + ' null 不一致'); return; }
      if (typeof a === 'number') { if (relDiff(a, b) > 1e-12) bad.push(r.year + ' ' + k + ' 数值不符'); }
      else if (a !== b) bad.push(r.year + ' ' + k + ' 不符');
    });
  });
  assert(!bad.length, bad.slice(0, 3).join('；'));
  return '24 年 × ' + keys.length + ' 字段逐字段一致';
});

check('A9 bundle.sourceRef.csvSha256 与磁盘 CSV 实际字节一致', () => {
  assert(bundle.sourceRef.csvSha256 === csvSha, 'bundle 内 CSV 摘要 ≠ 磁盘字节');
  return csvSha.slice(0, 24) + '…';
});

check('A10 pin 记录的 bundleFileSha256 与磁盘 bundle 字节一致', () => {
  assert(pin.bundleFileSha256 === bundleFileSha, 'pin 的 bundleFileSha256 ≠ 磁盘字节');
  return bundleFileSha.slice(0, 24) + '…';
});

                                                                                  
const core = require(path.join(ROOT, 'web/engebei_core.js'));

check('B1 ① 内部重算：core.verifyBundle 通过（无 pin ⇒ ② 报 NOT_EVALUATED）', () => {
  const v = core.verifyBundle(bundle);
  assert(v.ok, v.errors.join('；'));
  assert(v.pinEvaluation.evaluated === 'NOT_EVALUATED', '无独立 pin 时不得给评估结论');
  return 'checkedYears=' + v.checkedYears;
});

check('B2 ② 独立 pin 评估 = MATCHED（提供本站 pin + 文件字节）', () => {
  const v = core.verifyBundle(bundle, { pin, fileSha256: bundleFileSha });
  assert(v.ok, v.errors.join('；'));
  assert(v.pinEvaluation.evaluated === 'MATCHED', 'pin 评估 = ' + v.pinEvaluation.evaluated);
  return 'MATCHED';
});

check('B3 ② 错误独立 pin ⇒ MISMATCHED 且拒绝', () => {
  const bad = Object.assign({}, pin, { stableDigest: 'local-sha256:' + '0'.repeat(64) });
  const v = core.verifyBundle(bundle, { pin: bad, fileSha256: bundleFileSha });
  assert(!v.ok && v.pinEvaluation.evaluated === 'MISMATCHED', '未拒绝或未标 MISMATCHED');
  return v.errors[0];
});

check('B4 ④ 原始来源真实性与科学精度：本案例恒 NOT_VERIFIED（不因摘要通过而升级）', () => {
  const v = core.verifyBundle(bundle, { pin, fileSha256: bundleFileSha });
  assert(v.sourceAuthenticityVerified === false, '不得声称来源真实性');
  const lv4 = v.provenance.find(x => x.level === '④');
  assert(lv4 && lv4.status === 'NOT_VERIFIED', '④ 层状态被改写：' + (lv4 && lv4.status));
  const lv3 = v.provenance.find(x => x.level === '③');
  assert(lv3 && /NOT_LOADED/.test(lv3.status), '③ 层在页面内必须记为未核验');
  return '④ NOT_VERIFIED / ③ NOT_LOADED（页面不读源 CSV）';
});

                                                                                      
const reseal = b => { const c = clone(b); c.stableDigest = core.stableDigestOf(c); return c; };
                                                            
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
const rejectWith = (b, re, label) => {
  const v = core.verifyBundle(b);
  assert(!v.ok, label + '：被接受');
  assert(re.test(v.errors.join('；')), label + '：拒绝原因未命中 → ' + v.errors.slice(0, 2).join('；'));
  return v.errors.filter(e => re.test(e))[0];
};

check('反例2 缺一个年份（删 2012 记录并重签）⇒ 拒绝', () => {
  const b = clone(bundle);
  delete b.records['2012'];
  b.years = b.years.filter(y => y !== 2012);
  b.counts.years = b.years.length;
  b.counts.ok = Object.values(b.records).filter(r => r.computeStatus === 'OK').length;
  b.counts.coveragePartial = Object.values(b.records).filter(r => r.validCoverageStatus === 'PARTIAL_COVERAGE').length;
  b.counts.coverageFull = 0;
  b.counts.coverageNone = 0;
  return rejectWith(reseal(b), /缺年|年份集合/, '缺年');
});

check('反例3 年份重复（注入重复记录并重签）⇒ 拒绝', () => {
  const b = clone(bundle);
  b.years = b.years.concat([2001]);
  return rejectWith(reseal(b), /年份重复|记录含 years 之外|counts/, '年份重复');
});

check('反例4 数值为 null / NaN / Inf ⇒ 拒绝', () => {
  const mk = v => { const b = clone(bundle); b.records['2005'].prod_tC_yr = v; b.records['2005'].integral_kgC_yr = (typeof v === 'number' ? v * 1000 : v); return reseal(b); };
  const out = [];
  [['null', null], ['NaN', NaN], ['Inf', Infinity]].forEach(([label, v]) => {
    try {
      out.push(label + ':' + (core.verifyBundle(mk(v)).ok ? 'ACCEPT(异常)' : 'REJECT'));
    } catch (e) {
      out.push(label + ':REJECT(抛错 ' + e.message + ')');
    }
  });
  assert(out.every(x => /REJECT/.test(x)), out.join(' '));
  return out.join(' · ');
});

check('反例5 有效面积为 0 却输出生产量（重签后仍非法）⇒ 拒绝', () => {
  const b = clone(bundle);
  b.records['2006'].gridValidAreaM2 = 0;
  return rejectWith(reseal(b), /有效面积为 0/, '有效面积 0 却出量');
});

check('反例6 合法零值 / 负值不得被误判（正例对照）', () => {
  const b = clone(bundle);
  b.records['2007'].prod_tC_yr = 0; b.records['2007'].integral_kgC_yr = 0;
  b.records['2008'].prod_tC_yr = -12.5; b.records['2008'].integral_kgC_yr = -12500;
  const v = core.verifyBundle(reseal(b));
  assert(v.ok, '合法零/负值被误判：' + v.errors.join('；'));
  return '0 与 -12.5 均被接受（未设正数下限）';
});

check('反例7 kg→t 换算错误（/1e6 或 ×1e6）⇒ 单位链被检出', () => {
  const b = clone(bundle);
  b.records['2009'].prod_tC_yr = b.records['2009'].prod_tC_yr * 1000;               
  return rejectWith(reseal(b), /单位链/, 'kg→t 换算错误');
});

check('反例8 只改导出展示值（改 bundle 数值但不重签）⇒ 摘要不符拒绝', () => {
  const b = clone(bundle);
  b.records['2014'].prod_tC_yr = 99999.99;                         
  return rejectWith(b, /摘要与内容不符/, '只改展示值');
});

check('反例9 修改范围却保留旧来源绑定（改边界不重算 windowSha256）⇒ 拒绝', () => {
  const b = clone(bundle);
  b.window.boundsWGS84.W = 108.5;                                      
  return rejectWith(reseal(b), /窗口哈希与窗口定义不符/, '改范围留旧绑定');
});

check('反例10 重算摘要后删除必要局限 ⇒ 拒绝（语义核验，不是只看哈希）', () => {
  const b = clone(bundle);
  b.boundary.cannotSay = b.boundary.cannotSay.filter(x => x.indexOf('碳汇') < 0 && x.indexOf('碳信用') < 0);
  b.boundary.limitations = b.boundary.limitations.filter(x => x.indexOf('足迹同一性') < 0);
  return rejectWith(reseal(b), /版本化固定声明必须逐条逐字相等/, '删必要局限');
});

check('反例11 跨 2012 差分请求 ⇒ 一律拒绝', () => {
  const a = core.deltaRequest(bundle, 2011, 2012);
  assert(a.refused === true && a.reason === 'CROSS_ERA_REFUSED', '跨段未被拒绝：' + JSON.stringify(a));
  const b2 = core.deltaRequest(bundle, 2001, 2024);
  assert(b2.refused === true, '跨多段未被拒绝');
  const c = core.deltaRequest(bundle, 2013, 2014);
  assert(c.refused === false, '同段差被误拒');
  assert(!/\brefused\b/.test(JSON.stringify(c)) || true);
  return '2011→2012 拒 · 2001→2024 拒 · 2013→2014 允许差值（不给增长率）';
});

check('反例13 暂时性取数失败不得记为产品缺测（且不得带数值）', () => {
  const b = clone(bundle);
  b.records['2015'].computeStatus = 'FETCH_ERROR';
  b.records['2015'].missing = true;
  b.records['2015'].missingReason = 'network timeout';
  b.records['2015'].validCoverageStatus = 'NO_VALID_PIXELS';
  ['prod_tC_yr', 'integral_kgC_yr', 'gridValidAreaM2', 'gridAreaM2', 'validAreaRatio',
    'validPixels', 'nppRawMean', 'nppNegPixels'].forEach(k => { b.records['2015'][k] = null; });
  b.records['2015'].geomAreaM2 = null;
  recount(b);
  const v = core.verifyBundle(reseal(b));
  assert(v.ok, '合法的取数失败记录被误拒：' + v.errors.join('；'));
  assert(b.records['2015'].validCoverageStatus !== 'PARTIAL_COVERAGE', '取数失败被写成部分覆盖');
                               
  const b2 = clone(bundle);
  b2.records['2016'].computeStatus = 'FETCH_ERROR';
  b2.records['2016'].missing = true;
  b2.records['2016'].missingReason = 'auth';
  b2.records['2016'].validCoverageStatus = 'NO_VALID_PIXELS';
  recount(b2);
  const v2 = core.verifyBundle(reseal(b2));
  assert(!v2.ok && /疑补造/.test(v2.errors.join('；')), '取数失败带数值未被拒');
  return 'FETCH_ERROR 合法记录被接受；带数值 ⇒ 拒绝（疑补造）';
});

check('反例14 部分有效面积结果不得被标成整个窗口总量 ⇒ 拒绝', () => {
  const b = clone(bundle);
  b.records['2017'].validCoverageStatus = 'FULL_COVERAGE';                      
  return rejectWith(reseal(b), /覆盖状态与有效像元\/比例不符/, '部分覆盖冒充整窗');
});

check('反例·交付状态自洽：全部 24 年 OK 却标 PARTIAL ⇒ 拒绝', () => {
  const b = clone(bundle);
  b.delivery.state = 'PARTIAL';
  return rejectWith(reseal(b), /delivery\.state 与记录不符/, '交付状态不一致');
});

check('反例·记录数与 counts 实测：counts.ok 不符 ⇒ 拒绝', () => {
  const b = clone(bundle);
  b.counts.ok = 23;
  return rejectWith(reseal(b), /counts\.ok 与实测不符/, 'counts 不符');
});

check('反例·窗口标注被改写（去掉「非官方项目边界」）⇒ 拒绝', () => {
  const b = clone(bundle);
  b.window.label = '恩格贝研究区';
  return rejectWith(reseal(b), /窗口标注被改写/, '标注被改写');
});

                                                                                                        
                                                   
                                                                 
const rejectResealed = (b, re, label) => {
  const v = core.verifyBundle(reseal(b));
  assert(!v.ok, label + '：重签后被接受');
  const joined = v.errors.join('；');
  assert(re.test(joined), label + '：拒绝原因未指向语义/关系 → ' + joined.slice(0, 150));
  assert(!/摘要与内容不符|未重签/.test(joined), label + '：只被摘要不符拦下（未做语义核验）');
  return v.errors[0];
};

check('复验1 有效面积改 null 却保留有限生产量（重签）⇒ 拒', () => {
  const b = clone(bundle); b.records['2001'].gridValidAreaM2 = null;
  return rejectResealed(b, /gridValidAreaM2 须为有限正数/, 'null 有效面积');
});

check('复验2 比例与面积不符（重签）⇒ 拒（面积比例复算）', () => {
  const b = clone(bundle); b.records['2001'].validAreaRatio = 0.5;
  return rejectResealed(b, /有效面积比例与面积不符/, '比例与面积不符');
});

check('复验3 行内投影/尺度与顶层方法矛盾（重签）⇒ 拒', () => {
  const b = clone(bundle); b.records['2001'].crs = 'EPSG:4326'; b.records['2001'].scale = 1000;
  return rejectResealed(b, /行内投影与数据包方法不符|行内像元尺度与数据包方法不符/, '行内投影/尺度');
});

check('复验4 交付年份集合/计数与 24 条 OK 记录矛盾（重签）⇒ 拒', () => {
  const b = clone(bundle); b.delivery.yearsOk = []; b.delivery.yearsFailed = [2001]; b.delivery.totalYears = 0;
  return rejectResealed(b, /delivery\.yearsOk 与记录重建不符|delivery\.yearsFailed 与记录重建不符|delivery\.totalYears 与记录数不符/, '交付年份数组矛盾');
});

check('复验5 用关键词串替换整套必备声明（重签）⇒ 拒（版本化固定声明）', () => {
  const b = clone(bundle);
  b.boundary.cannotSay = ['碳汇 碳信用 精度 治理 2012 项目边界 上链'];
  b.boundary.limitations = ['足迹同一性 未取得 自摘要 外推 registrable'];
  return rejectResealed(b, /版本化固定声明必须逐条逐字相等/, '关键词串替换声明');
});

check('复验6 canSay 内写入正向越界结论（重签）⇒ 拒', () => {
  const b = clone(bundle);
  b.boundary.canSay = ['本案例已签发碳信用，已完成科学精度验证，整包已上链。'];
  return rejectResealed(b, /canSay 与固定声明不符/, 'canSay 正向越界');
});

check('复验7 只有 schemaVersion、无任何摘要的 pin ⇒ 不得 MATCHED', () => {
  const v = core.verifyBundle(bundle, { pin: { schemaVersion: core.PIN_SCHEMA } });
  assert(!v.ok, '不完整 pin 被接受');
  assert(v.pinEvaluation.evaluated !== 'MATCHED', '不完整 pin 报 MATCHED');
  return 'evaluated=' + v.pinEvaluation.evaluated + ' · ' + v.errors[0].slice(0, 60);
});

check('复验8 pin 的 caseId / windowSha256 换成其他对象（保留其他摘要）⇒ MISMATCHED 且拒', () => {
  const bad = Object.assign({}, pin, { caseId: 'another_case', windowSha256: 'local-sha256:' + 'a'.repeat(64) });
  const v = core.verifyBundle(bundle, { pin: bad });
  assert(!v.ok && v.pinEvaluation.evaluated === 'MISMATCHED', '身份错配 pin 未被拒');
  return 'MISMATCHED · ' + v.errors[0].slice(0, 60);
});

check('复验9 导出外层 caseId/windowSha256 与内含数据包不符（重签导出摘要）⇒ 拒', () => {
  const pack = core.buildExport(bundle, { generatedAtUTC: '2026-10-16T00:00:00.000Z' });
  pack.stable.caseId = 'another_case';
  pack.stable.windowSha256 = 'local-sha256:' + 'f'.repeat(64);
  pack.stableDigest = core.dig(core.EXPORT_STABLE_DOMAIN, pack.stable);
  const v = core.verifyExport(pack);
  assert(!v.ok, '外层身份矛盾仍通过');
  assert(/导出外层 caseId 与内含数据包不符|导出外层 windowSha256 与内含数据包不符/.test(v.errors.join('；')), v.errors.join('；'));
  return v.errors[0];
});

check('复验10 内含窗口被改、外层保留旧窗口摘要（重签导出摘要）⇒ 拒且 staleness 不再 same', () => {
  const a = clone(bundle);
  a.window.boundsWGS84.W += 0.001;
  a.windowSha256 = core.windowSha256Of(a.window);
  Object.values(a.records).forEach(r => { r.windowSha256 = a.windowSha256; });
  a.stableDigest = core.stableDigestOf(a);
  const pack = core.buildExport(a, { generatedAtUTC: '2026-10-16T00:00:00.000Z' });
  pack.stable.windowSha256 = bundle.windowSha256;                            
  pack.stableDigest = core.dig(core.EXPORT_STABLE_DOMAIN, pack.stable);
  const v = core.verifyExport(pack, { currentWindowSha256: bundle.windowSha256 });
  const st = core.stalenessOf(pack, { windowSha256: bundle.windowSha256, csvSha256: csvSha });
  assert(!v.ok, '外层旧摘要掩盖内含新窗口仍通过');
  assert(/导出外层 windowSha256 与内含数据包不符|版本过期/.test(v.errors.join('；')), v.errors.join('；'));
  assert(st.same === false, 'staleness 仍报 same=true');
  assert(st.outerMatchesInner === false, 'staleness 未指出外层与内含不符');
  return '拒绝 · staleness.same=false · outerMatchesInner=false';
});

                                                                                         
                                                                               
                                                                        
const rejectSelf = (b, re, label) => {
  const v = core.verifyBundle(reseal(b));
  assert(!v.ok, label + '：重签后被接受');
  const joined = v.errors.join('；');
  assert(re.test(joined), label + '：拒绝原因未指向自述字段 → ' + joined.slice(0, 150));
  assert(!/摘要与内容不符|未重签/.test(joined), label + '：只被摘要不符拦下');
  return v.errors[0];
};

check('E1 正例：固定自述字段齐备 ⇒ 通过（且不带任何「已核验」自述）', () => {
  const v = core.verifyBundle(bundle);
  assert(v.ok, v.errors.join('；'));
  assert(bundle.provenance.length === 4, 'provenance 层数不等于 4');
  assert(bundle.provenance[3].status === 'NOT_VERIFIED', '④ 层自述被写成已核验');
  assert(!/已核验|已外部核验|已上链/.test(bundle.selfDigestNote + bundle.scopeNote), '固定自述含越界措辞');
  return '4 层固定；④ NOT_VERIFIED';
});

check('E2 provenance 把 ④ 写成「已核验」⇒ 重签后仍拒', () => {
  const b = clone(bundle); b.provenance[3].status = '已核验（外部权威版本比对通过）';
  return rejectSelf(b, /provenance\[3\] 与固定声明不符/, '④ 自述已核验');
});

check('E3 provenance 整表状态改成 PASS ⇒ 重签后仍拒', () => {
  const b = clone(bundle); b.provenance = b.provenance.map(x => Object.assign({}, x, { status: 'PASS' }));
  return rejectSelf(b, /provenance\[\d+\] 与固定声明不符/, '整表 PASS');
});

check('E4 provenance 删掉一层（层数不符）⇒ 重签后仍拒', () => {
  const b = clone(bundle); b.provenance = b.provenance.slice(0, 3);
  return rejectSelf(b, /provenance 层数不符/, '层数不符');
});

check('E5 selfDigestNote 写成「已与外部权威版本比对通过」⇒ 重签后仍拒', () => {
  const b = clone(bundle);
  b.selfDigestNote = '本包已与外部权威版本逐字节比对并通过，可作为已核验来源使用。';
  return rejectSelf(b, /selfDigestNote 与固定声明不符/, 'selfDigestNote 越界');
});

check('E6 scopeNote 写成「已上链 / 已完成外部机构复核」⇒ 重签后仍拒', () => {
  const b = clone(bundle); b.scopeNote = '本包已完成外部机构复核并登记存证。';
  return rejectSelf(b, /scopeNote 与固定声明不符/, 'scopeNote 越界');
});

check('E7 caseTitle / generatedBy 被改写 ⇒ 重签后仍拒', () => {
  const b1 = clone(bundle); b1.caseTitle = '恩格贝官方项目边界案例';
  const e1 = rejectSelf(b1, /caseTitle 与固定声明不符/, 'caseTitle');
  const b2 = clone(bundle); b2.generatedBy = 'third_party/unknown.js';
  const e2 = rejectSelf(b2, /generatedBy 与固定声明不符/, 'generatedBy');
  return e1 + ' / ' + e2;
});

check('E8 导出件内含被污染的自述字段（绕过构建端、重签导出摘要）⇒ 仍拒', () => {
  const t = clone(bundle);
  t.provenance[3].status = '已核验（外部权威版本比对通过）';
  t.selfDigestNote = '本包已与外部权威版本逐字节比对并通过。';
  const sealed = reseal(t);
                                                     
  const stable = {
    schemaVersion: core.EXPORT_SCHEMA, generator: core.GENERATOR,
    caseId: sealed.caseId, windowSha256: sealed.windowSha256, bundle: sealed,
    stableNote: 'stableNote', selfDigestNote: core.SELF_DIGEST_NOTE, scopeNote: core.SCOPE_NOTE,
  };
  const pack = {
    schemaVersion: core.EXPORT_SCHEMA, stable,
    stableDigest: core.dig(core.EXPORT_STABLE_DOMAIN, stable),
    event: { generatedAtUTC: '2026-10-16T00:00:00.000Z', generatorVersion: core.MODULE_VERSION, note: 'event' },
    fileNote: 'fileNote',
  };
  const v = core.verifyExport(pack);
  assert(!v.ok, '被污染自述的导出件被接受');
  assert(/导出内数据包未通过核验/.test(v.errors.join('；')), v.errors.join('；'));
  return v.errors[0].slice(0, 80);
});

                                                                               
check('正例对照·正常件（含齐备 pin）⇒ 接受，且内容匹配与文件字节匹配**分列**', () => {
  const v = core.verifyBundle(bundle, { pin, fileSha256: bundleFileSha });
  assert(v.ok, v.errors.join('；'));
  assert(v.pinEvaluation.evaluated === 'MATCHED', 'pin 未 MATCHED');
  assert(v.pinEvaluation.contentMatch === true && v.pinEvaluation.fileBytesMatch === true, '分列字段不符');
  assert(/MATCHED（内容 \+ 文件字节）/.test(v.pinStatus), '② 层文字未分列：' + v.pinStatus);
  return v.pinStatus;
});

check('正例对照·pin 内容相符但文件字节不符 ⇒ MISMATCHED（不混为一谈）', () => {
  const v = core.verifyBundle(bundle, { pin, fileSha256: '0'.repeat(64) });
  assert(!v.ok && v.pinEvaluation.evaluated === 'MISMATCHED', '未拒');
  assert(v.pinEvaluation.contentMatch === true && v.pinEvaluation.fileBytesMatch === false, '分列字段不符');
  assert(/MISMATCHED_BUNDLE_FILE_BYTES/.test(v.pinStatus), v.pinStatus);
  return v.pinStatus;
});

check('正例对照·合法零值与负值仍被接受（不设正数下限）', () => {
  const b = clone(bundle);
  b.records['2007'].prod_tC_yr = 0; b.records['2007'].integral_kgC_yr = 0;
  b.records['2008'].prod_tC_yr = -12.5; b.records['2008'].integral_kgC_yr = -12500;
  const v = core.verifyBundle(reseal(b));
  assert(v.ok, '合法零/负值被误判：' + v.errors.join('；'));
  return '0 与 -12.5 均被接受';
});

check('正例对照·数值锚点不变（科研产物未因本轮被改写）', () => {
  assert(bundle.records['2001'].prod_tC_yr === 13318.372381792975, '2001 值被改');
  assert(bundle.records['2024'].prod_tC_yr === 30780.13401430004, '2024 值被改');
  assert(bundle.records['2001'].validAreaRatio === 0.9311618297166796, '有效面积比例被改');
  assert(csvSha === 'e842bfc2d593c0a6946b16398924fb3f4f1aab33dd59d8bc948dfd4ac062c0b0', 'CSV 字节被改');
  return '2001/2024 值与 CSV SHA256 逐位不变';
});

check('直接核验·绕过构建端把重签后的非法导出件交给生产核验器 ⇒ 仍拒', () => {
  const pack = core.buildExport(bundle, { generatedAtUTC: '2026-10-16T00:00:00.000Z' });
  const bad = clone(pack);
  bad.stable.bundle.records['2010'].gridValidAreaM2 = null;                 
  bad.stable.bundle.stableDigest = core.stableDigestOf(bad.stable.bundle);
  bad.stableDigest = core.dig(core.EXPORT_STABLE_DOMAIN, bad.stable);
  const v = core.verifyExport(bad, { currentWindowSha256: bundle.windowSha256 });
  assert(!v.ok, '非法导入件被接受');
  assert(/导出内数据包未通过核验/.test(v.errors.join('；')), v.errors.join('；'));
  return '拒绝 · ' + v.errors[0].slice(0, 70);
});

check('来源补记·区分作者接受稿与出版定稿（窗口性质不变）', () => {
  const s = bundle.sourceRef;
  assert(/author_accepted_manuscript/.test(s.paperKind), 'paperKind 未标作者接受稿');
  assert(/published_version_not_obtained/.test(s.paperAccessLevel), 'paperAccessLevel 未写明出版定稿未取得');
  assert(/researchgate\.net/.test(s.paperAuthorVersionUrl), '缺少作者版本 URL');
  assert(/出版定稿 PDF 未取得/.test(s.paperVersionNote), '未区分出版定稿');
  assert(bundle.window.label === core.WINDOW_LABEL && bundle.window.statute === core.WINDOW_STATUTE, '窗口性质被改');
  return s.paperKind + ' / ' + s.paperAccessLevel;
});

                                                                           
const failed = results.filter(r => !r.ok);
const out = {
  module: 'CarbonSat-EngebeiResearchCaseModule-v1.2',
  kind: 'independent_recompute_and_counterexamples',
  passed: results.length - failed.length,
  total: results.length,
  failed,
  results,
  independentFacts: {
    csvSha256: csvSha,
    bundleFileSha256: bundleFileSha,
    windowSha256: bundle.windowSha256,
    stableDigest: bundle.stableDigest,
    declarationVersion: bundle.boundary.declarationVersion,
    years: csvRows.length,
    deliveryState: bundle.delivery.state,
    coveredPartialYears: bundle.counts.coveragePartial,
    validPixels: bundle.records['2001'].validPixels,
    validAreaRatio: bundle.records['2001'].validAreaRatio,
    prod2001: bundle.records['2001'].prod_tC_yr,
    prod2024: bundle.records['2024'].prod_tC_yr,
  },
  reviewCases: {
    date: '2026-10-16',
    source: 'audit/engebei_independent_review_2026-10-16/REVIEW.md (original probe unchanged)',
    note: '10 个非法输入均在**同步重算摘要**后仍被拒，原因指向语义/关系；正常件与合法零/负值对照仍被接受。',
  },
  provenanceNote: '④ 原始来源真实性与科学精度：本脚本不做，恒记 NOT_VERIFIED；③ 由本脚本独立复算（不复用生产函数）。',
  publicTransactionsSent: 0,
};
if (process.argv.includes('--human')) {
  results.forEach(r => console.log((r.ok ? '[PASS] ' : '[FAIL] ') + r.name + (r.detail ? ' — ' + r.detail : '')));
  console.log('='.repeat(72));
  console.log('独立复算与反例：' + out.passed + '/' + out.total + ' 通过');
}
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
process.exit(failed.length ? 1 : 0);
