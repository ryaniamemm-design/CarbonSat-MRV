                                                            
  
              
                                                                   
                                                                  
                    
  
                         
                                                                               
                    
                                                                           
                                                         
                                                
                                                                            
                                    
                                              
                               
  
                                    
                                                                                   
                                            
                                 
                                                                    
                                                           
                                                             
  
                                       
                                                                      
                                                                              
                                                           
                                                                      
                                                                              
                                                                      
                                                                            
                                                    
  
                     
                                                              
                                      
                                                                    
                                          
  
                                                                          

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.AnnualCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

                                           
  const ANNUAL_SPEC_VERSION = "npp-annual-aggregate-v2";
  const UNIT_CHAIN_SPEC = "prod_tC_yr == integral_kgC_yr / 1000 (rel tol 1e-9)";
  const NUMBER_SPEC = "prod_tC_yr / integral_kgC_yr must be finite (0 and negatives allowed; empty/NaN/Inf rejected)";
  const MISSING_SPEC = "missing in {true,false} (case-insensitive); missing=true row is unusable";
  const KEY_SPEC = "primary key = (cellId, year); must equal EXPECTED_CELLS x [2001,2024] exactly";
  const STRUCT_SPEC = "R1 duplicate header column or R2 unlocatable year => reject WHOLE input (no years); " +
    "R3 extra row / field-count mismatch with locatable year => that year INCOMPLETE (total=null)";
  const STATUS_COMPLETE = "COMPLETE";
  const STATUS_INCOMPLETE = "INCOMPLETE";

  const EXPECTED_YEAR_START = 2001;
  const EXPECTED_YEAR_END = 2024;
  const EXPECTED_CELLS = [
    "cell_0020", "cell_0030", "cell_0040", "cell_0045", "cell_0046", "cell_0049", "cell_0050",
    "cell_0051", "cell_0055", "cell_0056", "cell_0060", "cell_0061", "cell_0062", "cell_0063",
    "cell_0065", "cell_0066", "cell_0070", "cell_0071", "cell_0072", "cell_0074", "cell_0075",
    "cell_0076", "cell_0080", "cell_0081", "cell_0082", "cell_0084", "cell_0085", "cell_0086",
    "cell_0087", "cell_0089", "cell_0090", "cell_0091", "cell_0092", "cell_0094",
  ];
  const EXPECTED_CELL_COUNT = EXPECTED_CELLS.length;
  const EXPECTED_YEAR_COUNT = EXPECTED_YEAR_END - EXPECTED_YEAR_START + 1;
  const EXPECTED_KEY_COUNT = EXPECTED_CELL_COUNT * EXPECTED_YEAR_COUNT;

  const REQUIRED_COLUMNS = ["cellId", "year", "prod_tC_yr", "integral_kgC_yr", "missing"];
  const UNIT_TOL = 1e-9;

                                                                    
                                                                      
  function classifyNumber(raw) {
    const s = raw == null ? "" : String(raw).trim();
    if (s === "") return { ok: false, reason: "empty", raw: raw };
    const v = Number(s);
    if (Number.isNaN(v)) return { ok: false, reason: "not-a-number", raw: raw };
    if (!Number.isFinite(v)) return { ok: false, reason: "non-finite", raw: raw };
    return { ok: true, value: v, raw: raw };
  }

  function classifyMissing(raw) {
    const s = raw == null ? "" : String(raw).trim().toLowerCase();
    if (s === "true") return { ok: true, value: true, raw: raw };
    if (s === "false") return { ok: true, value: false, raw: raw };
    return { ok: false, reason: s === "" ? "empty" : "unknown-missing-flag", raw: raw };
  }

  function classifyYear(raw) {
    const s = raw == null ? "" : String(raw).trim();
    if (s === "") return { ok: false, reason: "empty", raw: raw };
    const v = Number(s);
    if (!Number.isFinite(v)) return { ok: false, reason: "non-finite", raw: raw };
    if (!Number.isInteger(v)) return { ok: false, reason: "not-integer", raw: raw };
    return { ok: true, value: v, raw: raw };
  }

                                             
                                                    
                                                
                                         
  function parseCsv(text) {
    const raw = String(text == null ? "" : text).split(/\r?\n/);
    const lines = [];
    for (let i = 0; i < raw.length; i++) if (raw[i].trim() !== "") lines.push({ no: i + 1, text: raw[i] });
    if (!lines.length) {
      return { header: null, headerIndex: null, headerFieldCount: 0, duplicateColumns: [], rows: [] };
    }

    const header = lines[0].text.split(",").map((h) => h.trim());
    const index = {};
    const duplicateColumns = [];
    for (let i = 0; i < header.length; i++) {
      const name = header[i];
      if (Object.prototype.hasOwnProperty.call(index, name)) {
                                                   
        duplicateColumns.push({
          code: "DUPLICATE_COLUMN", column: name, firstIndex: index[name], duplicateIndex: i,
          msg: "表头重名列 " + (name === "" ? "(空列名)" : name) + "（列 " + index[name] + " 与 " + i + "）",
        });
      } else {
        index[name] = i;
      }
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].text.split(",");
      rows.push({
        lineNo: lines[i].no,
        fields: fields,
        fieldCount: fields.length,
        fieldCountMismatch: fields.length !== header.length,
      });
    }
    return { header: header, headerIndex: index, headerFieldCount: header.length, duplicateColumns: duplicateColumns, rows: rows };
  }

  function keyOf(cellId, year) { return String(cellId) + "\u0000" + String(year); }

                                          
                                                                                
  function aggregateAnnual(text, opts) {
    const o = opts || {};
    const cells = o.cells || EXPECTED_CELLS;
    const yearStart = o.yearStart == null ? EXPECTED_YEAR_START : o.yearStart;
    const yearEnd = o.yearEnd == null ? EXPECTED_YEAR_END : o.yearEnd;
    const unitTol = o.unitTol == null ? UNIT_TOL : o.unitTol;

    const expectedYears = [];
    for (let y = yearStart; y <= yearEnd; y++) expectedYears.push(y);
    const expectedKeySet = new Set();
    for (const c of cells) for (const y of expectedYears) expectedKeySet.add(keyOf(c, y));

    const parsed = parseCsv(text);
    const out = {
      specVersion: ANNUAL_SPEC_VERSION,
      unitChainSpec: UNIT_CHAIN_SPEC,
      numberSpec: NUMBER_SPEC,
      missingSpec: MISSING_SPEC,
      keySpec: KEY_SPEC,
      structSpec: STRUCT_SPEC,
      expectedCells: cells.slice(),
      expectedYears: expectedYears.slice(),
      expectedKeyCount: cells.length * expectedYears.length,
      parseErrors: [],                                              
      unlocatableYearRows: [],                            
      duplicateColumns: parsed.duplicateColumns.slice(),                     
      yearFaults: {},                                               
      headerErrors: [],
      keyErrors: { duplicate: [], missing: [], unexpected: [], badYear: [] },
      years: [],
      ok: false,
    };

    if (!parsed.header) {
      out.headerErrors.push({ code: "NO_HEADER", msg: "无表头（文件为空或只有空行）" });
      return finalize(out);
    }
    for (const col of REQUIRED_COLUMNS) {
      if (!(col in parsed.headerIndex)) out.headerErrors.push({ code: "MISSING_COLUMN", msg: "缺列 " + col });
    }
                                                        
    for (const d of parsed.duplicateColumns) out.headerErrors.push({ code: "DUPLICATE_COLUMN", msg: d.msg });
    if (out.headerErrors.length) return finalize(out);

    const ix = parsed.headerIndex;
    const buckets = new Map();                                      
    const globalMissingKeys = new Set();

    function addYearFault(year, fault) {
      const yk = String(year);
      if (!out.yearFaults[yk]) out.yearFaults[yk] = [];
      out.yearFaults[yk].push(fault);
    }

    for (const r of parsed.rows) {
      const f = r.fields;

                                                         
      const yc = (ix.year == null || f.length <= ix.year)
        ? { ok: false, reason: ix.year == null ? "no-year-column" : "row-too-short(" + r.fieldCount + " 列)" }
        : classifyYear(f[ix.year]);
      if (!yc.ok) {
        out.unlocatableYearRows.push({
          lineNo: r.lineNo, reason: yc.reason,
          msg: "第 " + r.lineNo + " 行的 year 无法定位（" + yc.reason + "）⇒ 整份输入拒绝，不产出任何年度",
        });
        continue;
      }

                                                  
      if (r.fieldCountMismatch) {
        out.parseErrors.push({
          code: "FIELD_COUNT", lineNo: r.lineNo, year: yc.value,
          msg: "第 " + r.lineNo + " 行字段数 " + r.fieldCount + " ≠ 表头 " + parsed.headerFieldCount + "（该年不可用）",
        });
        addYearFault(yc.value, {
          code: "FIELD_COUNT_ROW", lineNo: r.lineNo,
          msg: "额外行/解析错误：第 " + r.lineNo + " 行字段数与表头不符 ⇒ 该年不可用",
        });
        continue;
      }

      const cellId = String(f[ix.cellId]).trim();
      const pc = classifyNumber(f[ix.prod_tC_yr]);
      const ic = classifyNumber(f[ix.integral_kgC_yr]);
      const mc = classifyMissing(f[ix.missing]);

      const rowErrors = [];
      if (cellId === "") rowErrors.push({ code: "EMPTY_CELLID", msg: "cellId 为空" });
      if (mc.ok && mc.value === true) rowErrors.push({ code: "MISSING_FLAG", msg: "missing=true ⇒ 该格年不可用" });
      if (!mc.ok) rowErrors.push({ code: "BAD_MISSING_FLAG", msg: "missing 标志非法（" + mc.reason + "）" });
      if (!pc.ok) rowErrors.push({ code: "BAD_PROD", msg: "prod_tC_yr 非法（" + pc.reason + "）" });
      if (!ic.ok) rowErrors.push({ code: "BAD_INTEGRAL", msg: "integral_kgC_yr 非法（" + ic.reason + "）" });
      const prod = pc.ok ? pc.value : null;
      if (mc.ok && mc.value === false && pc.ok && ic.ok) {
        const expect = ic.value / 1000;
        const scale = Math.max(1, Math.abs(expect));
        if (Math.abs(prod - expect) > unitTol * scale) {
          rowErrors.push({ code: "UNIT_CHAIN", msg: "单位链不符：prod=" + prod + " ≠ integral/1000=" + expect });
        }
      }

      const rec = { lineNo: r.lineNo, cellId: cellId, year: yc.value, prod: prod, errors: rowErrors };
      const k = keyOf(cellId, yc.value);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(rec);

                                                           
      if (!expectedKeySet.has(k)) {
        globalMissingKeys.add(k);
        if (yc.value >= yearStart && yc.value <= yearEnd) {
          addYearFault(yc.value, {
            code: "UNEXPECTED_ROW", lineNo: r.lineNo,
            msg: "额外行（键 " + (cellId === "" ? "(空 cellId)" : cellId) + "/" + yc.value +
              " 不在期望主键集内）⇒ 该年不可用",
          });
        }
      }
    }

                                             
    if (out.unlocatableYearRows.length) { out.years = []; return finalize(out); }

             
    const dupKeys = new Set();
    for (const [k, list] of buckets) {
      if (list.length > 1) {
        dupKeys.add(k);
        const list2 = list.slice(0, 3).map((x) => "L" + x.lineNo);
        out.keyErrors.duplicate.push({ key: k.replace("\u0000", "/"), count: list.length, at: list2.join(" ") });
      }
    }
                             
    for (const k of expectedKeySet) {
      if (!buckets.has(k)) out.keyErrors.missing.push({ key: k.replace("\u0000", "/") });
    }
    for (const k of globalMissingKeys) {
      const [c, y] = k.split("\u0000");
      if (Number(y) < yearStart || Number(y) > yearEnd) out.keyErrors.badYear.push({ key: c + "/" + y });
      else out.keyErrors.unexpected.push({ key: c + "/" + y });
    }
    out.keyErrors.missing.sort((a, b) => (a.key < b.key ? -1 : 1));
    out.keyErrors.unexpected.sort((a, b) => (a.key < b.key ? -1 : 1));
    out.keyErrors.badYear.sort((a, b) => (a.key < b.key ? -1 : 1));

           
    for (const y of expectedYears) {
      const yr = { year: y, status: STATUS_COMPLETE, total: null, rows: 0, usableRows: 0, missingRows: 0, invalidRows: 0, errors: [] };
      let sum = 0, allUsable = true;
                                               
      const faults = out.yearFaults[String(y)];
      if (faults) { allUsable = false; for (const fl of faults) yr.errors.push({ code: fl.code, msg: fl.msg, lineNo: fl.lineNo }); }
      for (const c of cells) {
        const k = keyOf(c, y);
        const list = buckets.get(k);
        if (!list) { yr.errors.push({ code: "MISSING_KEY", msg: c + "/" + y + " 缺失" }); allUsable = false; continue; }
        if (list.length > 1) { yr.errors.push({ code: "DUPLICATE_KEY", msg: c + "/" + y + " 重复 " + list.length + " 次" }); allUsable = false; }
        const rec = list[0];
        yr.rows += list.length;
        const isMissing = rec.errors.some((e) => e.code === "MISSING_FLAG");
        if (isMissing) { yr.missingRows++; allUsable = false; }
        if (rec.errors.length) {
          yr.invalidRows++;
          allUsable = false;
          for (const e of rec.errors) yr.errors.push({ code: e.code, msg: c + "/" + y + " " + e.msg, lineNo: rec.lineNo });
        } else {
          yr.usableRows++;
          sum += rec.prod;
        }
      }
      if (allUsable && yr.usableRows === cells.length) {
        yr.status = STATUS_COMPLETE;
        yr.total = sum;                                            
      } else {
        yr.status = STATUS_INCOMPLETE;
        yr.total = null;                              
      }
      out.years.push(yr);
    }
    return finalize(out);
  }

  function finalize(out) {
    out.completeYears = out.years.filter((y) => y.status === STATUS_COMPLETE).map((y) => y.year);
    out.incompleteYears = out.years.filter((y) => y.status === STATUS_INCOMPLETE).map((y) => y.year);
    const anyKeyError = (out.keyErrors.missing.length + out.keyErrors.unexpected.length +
      out.keyErrors.duplicate.length + out.keyErrors.badYear.length) > 0;
                                                           
    out.ok = out.parseErrors.length === 0 &&
      out.headerErrors.length === 0 &&
      out.unlocatableYearRows.length === 0 &&
      out.duplicateColumns.length === 0 &&
      !anyKeyError &&
      out.incompleteYears.length === 0 &&
      out.years.length === out.expectedYears.length;
    return out;
  }

  function totalsByYear(result) {
    const m = {};
    for (const y of result.years) m[y.year] = y.total;                         
    return m;
  }

                                                        
  function _findLine(lines, header, cellId, year) {
    const i0 = header.indexOf("cellId"), i1 = header.indexOf("year");
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "") continue;
      const f = lines[i].split(",");
      if (f[i0] === cellId && Number(f[i1]) === year) return i;
    }
    return -1;
  }
  function _set(lines, header, i, col, value) {
    const idx = header.indexOf(col), f = lines[i].split(",");
    f[idx] = value; lines[i] = f.join(",");
  }
  function _mutate(text, cellId, year, edits) {
    const lines = text.split(/\r?\n/);
    const header = lines[0].split(",").map((s) => s.trim());
    const i = _findLine(lines, header, cellId, year);
    if (i < 0) throw new Error("selftest 找不到行 " + cellId + "/" + year);
    for (const col of Object.keys(edits)) _set(lines, header, i, col, edits[col]);
    return lines.join("\n");
  }
  function _drop(text, cellId, year) {
    const lines = text.split(/\r?\n/), header = lines[0].split(",").map((s) => s.trim());
    const i = _findLine(lines, header, cellId, year);
    if (i < 0) throw new Error("selftest 找不到行 " + cellId + "/" + year);
    lines.splice(i, 1); return lines.join("\n");
  }
  function _dup(text, cellId, year) {
    const lines = text.split(/\r?\n/), header = lines[0].split(",").map((s) => s.trim());
    const i = _findLine(lines, header, cellId, year);
    if (i < 0) throw new Error("selftest 找不到行 " + cellId + "/" + year);
    lines.splice(i, 0, lines[i]); return lines.join("\n");
  }
  function _expectIncomplete(res, year) {
    const y = res.years.find((x) => x.year === year);
    return !!y && y.status === STATUS_INCOMPLETE && y.total === null;
  }
  function _expectComplete(res, year) {
    const y = res.years.find((x) => x.year === year);
    return !!y && y.status === STATUS_COMPLETE && typeof y.total === "number" && Number.isFinite(y.total);
  }

                                                                        
  const HINT_2011 = 97206.2, HINT_2012 = 154251.3;

  function selftest(csvText) {
    const cases = [];
    if (!csvText || String(csvText).trim() === "") {
      return { ok: false, count: 0, failures: [{ name: "selftest 输入", detail: "未提供真实 CSV 文本" }] };
    }
    const T = String(csvText);
    const base = aggregateAnnual(T);
    const C = "cell_0030", Y = 2012;

    function add(name, fn) {
      let pass = false, detail = "";
      try { const r = fn(); pass = r.pass; detail = r.detail; }
      catch (e) { pass = false; detail = "抛错：" + e.message; }
      cases.push({ name: name, pass: pass, detail: detail });
    }

                                             
    add("基线：真实 CSV 24 年全部 COMPLETE", () => {
      const t = totalsByYear(base);
      const okc = base.completeYears.length === 24 && base.incompleteYears.length === 0;
      const ok1 = Math.abs(t[2011] - HINT_2011) < 1e-6 * HINT_2011;
      const ok2 = Math.abs(t[2012] - HINT_2012) < 1e-6 * HINT_2012;
      return { pass: okc && ok1 && ok2, detail: "complete=" + base.completeYears.length + " 2011=" + t[2011] + " 2012=" + t[2012] };
    });

                                                           
    add("反例C1 补空值：prod_tC_yr = \"\" ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { prod_tC_yr: "" }));
      return { pass: _expectIncomplete(r, Y), detail: "2012=" + JSON.stringify(r.years.find((x) => x.year === Y).status) };
    });
    add("反例C2 删行：删掉一格年 ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_drop(T, C, Y));
      const y = r.years.find((x) => x.year === Y);
      return { pass: _expectIncomplete(r, Y) && y.usableRows === 33, detail: "usableRows=" + y.usableRows };
    });
    add("反例C3 重复：同一 (cellId, year) 出现两次 ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_dup(T, C, Y));
      return { pass: _expectIncomplete(r, Y) && r.keyErrors.duplicate.length === 1, detail: "dup=" + r.keyErrors.duplicate.length };
    });
    add("反例C4 NaN：prod_tC_yr = \"NaN\" ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { prod_tC_yr: "NaN" }));
      return { pass: _expectIncomplete(r, Y), detail: "total=" + r.years.find((x) => x.year === Y).total };
    });
    add("反例C5 Infinity：prod_tC_yr = \"Infinity\" ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { prod_tC_yr: "Infinity" }));
      return { pass: _expectIncomplete(r, Y), detail: "total=" + r.years.find((x) => x.year === Y).total };
    });
    add("反例C6 缺测标志：missing = \"true\" ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { missing: "true" }));
      const y = r.years.find((x) => x.year === Y);
      return { pass: _expectIncomplete(r, Y) && y.missingRows === 1, detail: "missingRows=" + y.missingRows };
    });
    add("反例C7 缺测标志非法：missing = \"maybe\" ⇒ 该年 INCOMPLETE", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { missing: "maybe" }));
      return { pass: _expectIncomplete(r, Y), detail: "missingRows=" + r.years.find((x) => x.year === Y).missingRows };
    });
    add("反例C8 单位链：prod_tC_yr 写成 integral 原值（差 1000 倍）⇒ INCOMPLETE", () => {
      const lines = T.split(/\r?\n/), header = lines[0].split(",").map((s) => s.trim());
      const i = _findLine(lines, header, C, Y);
      const ig = lines[i].split(",")[header.indexOf("integral_kgC_yr")];
      const r = aggregateAnnual(_mutate(T, C, Y, { prod_tC_yr: ig }));
      const y = r.years.find((x) => x.year === Y);
      return { pass: _expectIncomplete(r, Y) && y.errors.some((e) => e.code === "UNIT_CHAIN"), detail: "unitErrors=" + y.errors.filter((e) => e.code === "UNIT_CHAIN").length };
    });
    add("反例C9 年份越界：把 2012 改成年份 2000 ⇒ 2000 意外键 + 2012 缺键", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { year: "2000" }));
      return { pass: r.keyErrors.badYear.length === 1 && _expectIncomplete(r, Y), detail: "badYear=" + r.keyErrors.badYear.length };
    });
    add("反例C10 表头缺列：删掉 missing 列 ⇒ headerErrors 非空、ok=false", () => {
      const lines = T.split(/\r?\n/);
      const h = lines[0].split(",");
      const mi = h.indexOf("missing");
      lines[0] = h.filter((_, i2) => i2 !== mi).join(",");
      for (let i = 1; i < lines.length; i++) { const f = lines[i].split(","); if (f.length) f.splice(mi, 1); lines[i] = f.join(","); }
      const r = aggregateAnnual(lines.join("\n"));
      return { pass: r.headerErrors.length > 0 && r.ok === false, detail: "headerErrors=" + r.headerErrors.length };
    });

                                                         
    add("反例C11 额外行(R3)：追加未授权键 cell_9999/2012 ⇒ 2012 INCOMPLETE", () => {
      const L = T.split(/\r?\n/), h = L[0].split(",").map((s) => s.trim());
      const extra = h.map((n) => (n === "cellId" ? "cell_9999" : n === "year" ? "2012"
        : n === "prod_tC_yr" ? "123" : n === "integral_kgC_yr" ? "123000"
        : n === "missing" ? "False" : "0")).join(",");
      const r = aggregateAnnual(L.join("\n") + "\n" + extra);
      const y = r.years.find((x) => x.year === Y);
      const ok = _expectIncomplete(r, Y) && r.keyErrors.unexpected.length === 1 && r.ok === false &&
        y.errors.some((e) => e.code === "UNEXPECTED_ROW");
      return { pass: ok, detail: "unexpected=" + r.keyErrors.unexpected.length + " status=" + y.status };
    });
    add("反例C12 解析错误(R3)：2012 某行字段数不符（年份仍可定位）⇒ 2012 INCOMPLETE", () => {
      const L = T.split(/\r?\n/), h = L[0].split(",").map((s) => s.trim());
      const i = _findLine(L, h, C, Y);
      L[i] = L[i] + ",EXTRA_COL";
      const r = aggregateAnnual(L.join("\n"));
      const y = r.years.find((x) => x.year === Y);
      const ok = _expectIncomplete(r, Y) && r.parseErrors.length === 1 && r.ok === false &&
        y.errors.some((e) => e.code === "FIELD_COUNT_ROW");
      return { pass: ok, detail: "parseErrors=" + r.parseErrors.length + " status=" + y.status };
    });
    add("反例C13 无法定位年份(R2)：year = \"abc\" ⇒ 整份拒绝（不产出任何年度）", () => {
      const r = aggregateAnnual(_mutate(T, C, Y, { year: "abc" }));
      const ok = r.unlocatableYearRows.length === 1 && r.ok === false && r.years.length === 0;
      return { pass: ok, detail: "unlocatable=" + r.unlocatableYearRows.length + " years=" + r.years.length };
    });
    add("反例C14 重复表头(R1)：prod_tC_yr 列名出现两次 ⇒ 整份拒绝", () => {
      const L = T.split(/\r?\n/);
      const h = L[0].split(",").map((s) => s.trim());
      L[0] = h.concat(["prod_tC_yr"]).join(",");                                
      for (let i = 1; i < L.length; i++) if (L[i].trim() !== "") L[i] = L[i] + ",0";
      const r = aggregateAnnual(L.join("\n"));
      const ok = r.headerErrors.some((e) => e.code === "DUPLICATE_COLUMN") && r.ok === false && r.years.length === 0;
      return { pass: ok, detail: "headerErrors=" + r.headerErrors.length + " years=" + r.years.length };
    });

                                               
    add("正例P1 合法零：prod=0 且 integral=0 ⇒ 该年仍 COMPLETE，总量含 0", () => {
      const lines = T.split(/\r?\n/), header = lines[0].split(",").map((s) => s.trim());
      const i = _findLine(lines, header, C, Y);
      const p0 = Number(lines[i].split(",")[header.indexOf("prod_tC_yr")]);
      const baseT = totalsByYear(base)[Y];
      const r = aggregateAnnual(_mutate(T, C, Y, { prod_tC_yr: "0", integral_kgC_yr: "0" }));
      const y = r.years.find((x) => x.year === Y);
      const expect = baseT - p0;                                       
      return { pass: _expectComplete(r, Y) && Math.abs(y.total - expect) < 1e-9 * Math.abs(expect), detail: "total=" + y.total + " (期望 " + expect + ")" };
    });
    add("正例P2 合法负值：prod=-1 且 integral=-1000 ⇒ 该年仍 COMPLETE，总量含负值", () => {
      const lines = T.split(/\r?\n/), header = lines[0].split(",").map((s) => s.trim());
      const i = _findLine(lines, header, C, Y);
      const p0 = Number(lines[i].split(",")[header.indexOf("prod_tC_yr")]);
      const baseT = totalsByYear(base)[Y];
      const r = aggregateAnnual(_mutate(T, C, Y, { prod_tC_yr: "-1", integral_kgC_yr: "-1000" }));
      const y = r.years.find((x) => x.year === Y);
      const expect = baseT - p0 + (-1);
      return { pass: _expectComplete(r, Y) && Math.abs(y.total - expect) < 1e-9 * Math.abs(expect), detail: "total=" + y.total + " (期望 " + expect + ")" };
    });
    add("正例P3 未改动：正确 index 不被误杀（24/24 COMPLETE，ok=true）", () => {
      return { pass: base.ok === true && base.parseErrors.length === 0 && base.keyErrors.missing.length === 0 && base.keyErrors.unexpected.length === 0, detail: "ok=" + base.ok };
    });

    const failures = cases.filter((c) => !c.pass);
    return { ok: failures.length === 0, count: cases.length, passed: cases.length - failures.length, cases: cases, failures: failures };
  }

  return {
    ANNUAL_SPEC_VERSION: ANNUAL_SPEC_VERSION,
    UNIT_CHAIN_SPEC: UNIT_CHAIN_SPEC,
    NUMBER_SPEC: NUMBER_SPEC,
    MISSING_SPEC: MISSING_SPEC,
    KEY_SPEC: KEY_SPEC,
    STRUCT_SPEC: STRUCT_SPEC,
    STATUS_COMPLETE: STATUS_COMPLETE,
    STATUS_INCOMPLETE: STATUS_INCOMPLETE,
    EXPECTED_YEAR_START: EXPECTED_YEAR_START,
    EXPECTED_YEAR_END: EXPECTED_YEAR_END,
    EXPECTED_CELLS: EXPECTED_CELLS.slice(),
    EXPECTED_CELL_COUNT: EXPECTED_CELL_COUNT,
    EXPECTED_YEAR_COUNT: EXPECTED_YEAR_COUNT,
    EXPECTED_KEY_COUNT: EXPECTED_KEY_COUNT,
    REQUIRED_COLUMNS: REQUIRED_COLUMNS.slice(),
    UNIT_TOL: UNIT_TOL,
    classifyNumber: classifyNumber,
    classifyMissing: classifyMissing,
    classifyYear: classifyYear,
    parseCsv: parseCsv,
    aggregateAnnual: aggregateAnnual,
    totalsByYear: totalsByYear,
    selftest: selftest,
  };
});
