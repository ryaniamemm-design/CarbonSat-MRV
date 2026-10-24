                                        
  
                                                    
  
                                           
                          
                                                           
                                                     
                                                                               

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const AC = require(path.join(ROOT, "web", "annual_core.js"));
const CSV_PATH = path.join(ROOT, "data", "npp_annual_production_integral.csv");
const CSV = fs.readFileSync(CSV_PATH, "utf8");

const C = "cell_0030", Y = 2012;

function lines() { return CSV.split(/\r?\n/); }
function header() { return lines()[0].split(",").map((s) => s.trim()); }
function findLine(cellId, year) {
  const L = lines(), h = header(), i0 = h.indexOf("cellId"), i1 = h.indexOf("year");
  for (let i = 1; i < L.length; i++) {
    const f = L[i].split(",");
    if (f[i0] === cellId && Number(f[i1]) === year) return i;
  }
  return -1;
}
function mutate(cellId, year, edits) {
  const L = lines(), h = header(), i = findLine(cellId, year);
  assert.ok(i > 0, "找不到行 " + cellId + "/" + year);
  for (const col of Object.keys(edits)) {
    const f = L[i].split(",");
    f[h.indexOf(col)] = edits[col];
    L[i] = f.join(",");
  }
  return L.join("\n");
}
function dropRow(cellId, year) {
  const L = lines(), i = findLine(cellId, year);
  assert.ok(i > 0); L.splice(i, 1); return L.join("\n");
}
function dupRow(cellId, year) {
  const L = lines(), i = findLine(cellId, year);
  assert.ok(i > 0); L.splice(i, 0, L[i]); return L.join("\n");
}
function yearOf(res, y) { return res.years.find((x) => x.year === y); }

describe("年度 NPP 聚合 · 输入校验（npp-annual-aggregate-v2）", function () {
  const base = AC.aggregateAnnual(CSV);

  it("规范常量与期望主键自述完整（34 格 × 2001–2024 = 816 键）", function () {
    assert.strictEqual(AC.ANNUAL_SPEC_VERSION, "npp-annual-aggregate-v2");
    assert.strictEqual(AC.EXPECTED_CELL_COUNT, 34);
    assert.strictEqual(AC.EXPECTED_YEAR_COUNT, 24);
    assert.strictEqual(AC.EXPECTED_KEY_COUNT, 816);
    assert.deepStrictEqual(AC.REQUIRED_COLUMNS, ["cellId", "year", "prod_tC_yr", "integral_kgC_yr", "missing"]);
  });

  it("真实 CSV：24/24 COMPLETE，816 个期望主键全部命中、无缺失/意外/重复", function () {
    assert.strictEqual(base.parseErrors.length, 0);
    assert.strictEqual(base.headerErrors.length, 0);
    assert.strictEqual(base.keyErrors.missing.length, 0);
    assert.strictEqual(base.keyErrors.unexpected.length, 0);
    assert.strictEqual(base.keyErrors.duplicate.length, 0);
    assert.strictEqual(base.keyErrors.badYear.length, 0);
                                    
    assert.strictEqual(base.unlocatableYearRows.length, 0);
    assert.strictEqual(base.duplicateColumns.length, 0);
    assert.strictEqual(base.years.length, 24);
    assert.deepStrictEqual(base.incompleteYears, []);
    assert.strictEqual(base.completeYears.length, 24);
    assert.strictEqual(base.ok, true);
  });

  it("真实 CSV：逐年合计现场重算正确（2011 / 2012 锚点）", function () {
    const t = AC.totalsByYear(base);
    assert.ok(Math.abs(t[2011] - 97206.2) < 1e-6 * 97206.2, "2011 = " + t[2011]);
    assert.ok(Math.abs(t[2012] - 154251.3) < 1e-6 * 154251.3, "2012 = " + t[2012]);
                               
    for (const y of base.years) {
      assert.ok(y.status === "COMPLETE" && Number.isFinite(y.total), y.year + " 应为 COMPLETE 且 total 有限");
    }
  });

  it("反例·补空值：prod_tC_yr = \"\" ⇒ 2012 INCOMPLETE、total=null", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { prod_tC_yr: "" }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
    assert.ok(y.errors.some((e) => e.code === "BAD_PROD" && /empty/.test(e.msg)));
  });

  it("反例·删行：删掉一格年 ⇒ 2012 只剩 33 个可用格、INCOMPLETE、total=null", function () {
    const r = AC.aggregateAnnual(dropRow(C, Y));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
    assert.strictEqual(y.usableRows, 33);
    assert.ok(r.keyErrors.missing.some((k) => k.key === C + "/" + Y));
  });

  it("反例·重复：同一 (cellId, year) 出现两次 ⇒ 2012 INCOMPLETE、total=null", function () {
    const r = AC.aggregateAnnual(dupRow(C, Y));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
    assert.strictEqual(r.keyErrors.duplicate.length, 1);
    assert.ok(y.errors.some((e) => e.code === "DUPLICATE_KEY"));
  });

  it("反例·NaN：prod_tC_yr = \"NaN\" ⇒ INCOMPLETE、total=null（不得变成 NaN 总量）", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { prod_tC_yr: "NaN" }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
  });

  it("反例·Infinity：prod_tC_yr = \"Infinity\" ⇒ INCOMPLETE、total=null", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { prod_tC_yr: "Infinity" }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
  });

  it("反例·缺测标志：missing = true ⇒ 该格年不可用、2012 INCOMPLETE、total=null", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { missing: "true" }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
    assert.strictEqual(y.missingRows, 1);
  });

  it("反例·缺测标志非法：missing = \"maybe\" ⇒ INCOMPLETE（不得默认按 false 放行）", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { missing: "maybe" }));
    assert.strictEqual(yearOf(r, Y).status, "INCOMPLETE");
    assert.strictEqual(yearOf(r, Y).total, null);
  });

  it("反例·单位链：prod_tC_yr 误填 integral 原值（差 1000 倍）⇒ INCOMPLETE", function () {
    const L = lines(), h = header(), i = findLine(C, Y);
    const ig = L[i].split(",")[h.indexOf("integral_kgC_yr")];
    const r = AC.aggregateAnnual(mutate(C, Y, { prod_tC_yr: ig }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.ok(y.errors.some((e) => e.code === "UNIT_CHAIN"));
  });

  it("反例·年份越界：把 2012 改成 2000 ⇒ 2000 记为越界键、2012 记缺键", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { year: "2000" }));
    assert.strictEqual(r.keyErrors.badYear.length, 1);
    assert.strictEqual(r.keyErrors.badYear[0].key, C + "/2000");
    assert.strictEqual(yearOf(r, Y).status, "INCOMPLETE");
  });

  it("反例·表头缺列：删掉 missing 列 ⇒ headerErrors 非空、ok=false（不得静默跳过校验）", function () {
    const L = lines();
    const h = L[0].split(",");
    const mi = h.indexOf("missing");
    L[0] = h.filter((_, i) => i !== mi).join(",");
    for (let i = 1; i < L.length; i++) { const f = L[i].split(","); if (f.length) f.splice(mi, 1); L[i] = f.join(","); }
    const r = AC.aggregateAnnual(L.join("\n"));
    assert.ok(r.headerErrors.length > 0);
    assert.strictEqual(r.ok, false);
  });

  it("反例·额外行(R3)：追加未授权键 cell_9999/2012 ⇒ 该年 INCOMPLETE，其他年不受影响", function () {
    const h = header();
    const extra = h.map((n) => (n === "cellId" ? "cell_9999" : n === "year" ? "2012"
      : n === "prod_tC_yr" ? "123" : n === "integral_kgC_yr" ? "123000"
      : n === "missing" ? "False" : "0")).join(",");
    const r = AC.aggregateAnnual(CSV.split(/\r?\n/).join("\n") + "\n" + extra);
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "INCOMPLETE");
    assert.strictEqual(y.total, null);
    assert.ok(y.errors.some((e) => e.code === "UNEXPECTED_ROW"), "应记录 UNEXPECTED_ROW 归因");
    assert.strictEqual(r.keyErrors.unexpected.length, 1);
    assert.deepStrictEqual(r.incompleteYears, [2012]);
    assert.strictEqual(r.completeYears.length, 23);
    assert.strictEqual(r.ok, false);
  });

  it("反例·解析错误(R3)：2012 某行字段数不符（年份可定位）⇒ 该年 INCOMPLETE，不整份拒绝", function () {
    const L = lines(), i = findLine(C, Y);
    assert.ok(i > 0);
    L[i] = L[i] + ",EXTRA_COL";
    const r = AC.aggregateAnnual(L.join("\n"));
    assert.strictEqual(r.parseErrors.length, 1);
    assert.strictEqual(r.parseErrors[0].year, Y);
    assert.strictEqual(r.years.length, 24, "R3 只影响该年，不得整份拒绝");
    assert.strictEqual(yearOf(r, Y).status, "INCOMPLETE");
    assert.strictEqual(yearOf(r, Y).total, null);
    assert.ok(yearOf(r, Y).errors.some((e) => e.code === "FIELD_COUNT_ROW"));
    assert.strictEqual(r.ok, false);
  });

  it("反例·无法定位年份(R2)：year = \"abc\" ⇒ 整份拒绝（不产出任何年度）", function () {
    const r = AC.aggregateAnnual(mutate(C, Y, { year: "abc" }));
    assert.strictEqual(r.unlocatableYearRows.length, 1);
    assert.strictEqual(r.unlocatableYearRows[0].reason, "non-finite");                                            
    assert.deepStrictEqual(r.years, []);
    assert.deepStrictEqual(r.completeYears, []);
    assert.strictEqual(r.ok, false);
  });

  it("反例·无法定位年份(R2)：某行字段数不足以取到 year 列 ⇒ 整份拒绝", function () {
    const r = AC.aggregateAnnual(CSV + "\ncell_0030");
    assert.strictEqual(r.unlocatableYearRows.length, 1);
    assert.deepStrictEqual(r.years, []);
    assert.strictEqual(r.ok, false);
  });

  it("反例·重复表头(R1)：prod_tC_yr 列名出现两次 ⇒ 整份拒绝（不得静默取第一个）", function () {
    const L = lines();
    const h = header();
    L[0] = h.concat(["prod_tC_yr"]).join(",");
    for (let i = 1; i < L.length; i++) if (L[i].trim() !== "") L[i] = L[i] + ",0";
    const r = AC.aggregateAnnual(L.join("\n"));
    assert.strictEqual(r.duplicateColumns.length, 1);
    assert.strictEqual(r.duplicateColumns[0].column, "prod_tC_yr");
    assert.ok(r.headerErrors.some((e) => e.code === "DUPLICATE_COLUMN"));
    assert.deepStrictEqual(r.years, []);
    assert.strictEqual(r.ok, false);
  });

  it("正例·合法零：prod=0 且 integral=0 ⇒ 该年仍 COMPLETE，总量精确少掉该格原值", function () {
    const L = lines(), h = header(), i = findLine(C, Y);
    const p0 = Number(L[i].split(",")[h.indexOf("prod_tC_yr")]);
    const expect = AC.totalsByYear(base)[Y] - p0;
    const r = AC.aggregateAnnual(mutate(C, Y, { prod_tC_yr: "0", integral_kgC_yr: "0" }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "COMPLETE");
    assert.ok(Math.abs(y.total - expect) < 1e-9 * Math.abs(expect), "total=" + y.total + " expect=" + expect);
  });

  it("正例·合法负值：prod=-1 且 integral=-1000 ⇒ 该年仍 COMPLETE，总量含负值", function () {
    const L = lines(), h = header(), i = findLine(C, Y);
    const p0 = Number(L[i].split(",")[h.indexOf("prod_tC_yr")]);
    const expect = AC.totalsByYear(base)[Y] - p0 + (-1);
    const r = AC.aggregateAnnual(mutate(C, Y, { prod_tC_yr: "-1", integral_kgC_yr: "-1000" }));
    const y = yearOf(r, Y);
    assert.strictEqual(y.status, "COMPLETE");
    assert.ok(Math.abs(y.total - expect) < 1e-9 * Math.abs(expect), "total=" + y.total + " expect=" + expect);
  });

  it("自检 selftest()：18/18 全通过", function () {
    const st = AC.selftest(CSV);
    assert.strictEqual(st.count, 18);
    assert.strictEqual(st.passed, 18);
    assert.strictEqual(st.ok, true, JSON.stringify(st.failures));
  });
});
