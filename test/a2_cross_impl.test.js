                                                                       
  
      
                                                                        
                                                                        
                                               
                                                   
                                              
                                           
  
                                                                
                                                                 
                                          
  
                                                              
  
                                                                   
                                                        
                                                   
                                        
                                                     
"use strict";
const fs = require("fs");
const path = require("path");
const A2 = require(path.join(__dirname, "..", "web", "a2_core.js"));

const ROOT = path.join(__dirname, "..");
const A2_PATH = path.join(ROOT, "evidence", "a2_landcover_valid_footprint.json");

function main() {
  const doc = JSON.parse(fs.readFileSync(A2_PATH, "utf8"));
  const results = [];
  const check = (name, ok, detail) => {
    results.push([name, !!ok, detail || ""]);
    console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${ok || !detail ? "" : "  -> " + detail}`);
  };

  check("A2 内容行数 = 1523", doc.rows.length === 1523, "rows=" + doc.rows.length);
  check("A2 格年数 = 816", doc.cells.length === 816, "cells=" + doc.cells.length);

  let badRow = 0, firstRow = null;
  for (const row of doc.rows) {
    const want = A2.classRowRef(row);
    if (want !== row.classRowRef) {
      badRow++;
      if (!firstRow) firstRow = `${row.cellId}/${row.year}/lc${row.lcCode}: js=${want} py=${row.classRowRef}`;
    }
  }
  check("1523 条 classRowRef：JS 重算 == Python 记录", badRow === 0,
        `不符=${badRow}${firstRow ? " | " + firstRow : ""}`);

  let badCell = 0, firstCell = null;
  for (const cell of doc.cells) {
    const want = A2.cellFootprintRef(cell);
    if (want !== cell.cellFootprintRef) {
      badCell++;
      if (!firstCell) firstCell = `${cell.cellId}/${cell.year}: js=${want} py=${cell.cellFootprintRef}`;
    }
  }
  check("816 条 cellFootprintRef：JS 重算 == Python 记录", badCell === 0,
        `不符=${badCell}${firstCell ? " | " + firstCell : ""}`);

                                               
  const body = Object.assign({}, doc);
  delete body.contentAnchor;
  const wantAnchor = "local-sha256:" + A2.sha256OfCanonical(body);
  check("contentAnchor：JS 重算 == Python 记录", wantAnchor === doc.contentAnchor,
        `js=${wantAnchor.slice(0, 26)}… py=${String(doc.contentAnchor).slice(0, 26)}…`);

                                                    
  const vbad = A2.NUMERIC_VECTORS.filter(([v, want]) => A2.canonicalize(v) !== want);
  check(`数值规范共同向量表 ${A2.NUMERIC_VECTORS.length} 项逐项一致（含 1e-5/1e-6/1e-7/1e16）`,
        vbad.length === 0, "不符=" + JSON.stringify(vbad.slice(0, 3)));
  check("缺键/undefined 拒绝规范化（不得静默折叠成 null）", (() => {
    try { A2.canonicalize(undefined); return false; } catch (e) { return true; }
  })());
  check("非有限值拒绝规范化", (() => {
    try { A2.canonicalize(NaN); return false; } catch (e) { return true; }
  })());

                              
  const zeroRow = doc.rows.find((r) => r.classValidAreaM2 === 0);
  const fullRow = doc.rows.find((r) => r.coverageRatio === 1 && r.classValidAreaM2 > 0);
  const cellOfRow = (row) => {
    const c = doc.cells.find((x) => x.cellId === row.cellId && x.year === row.year);
    return Object.assign({}, c, { classRowCount: c.classRowRefs.length });
  };
  const rehash = (pkg) => {
    const b = Object.assign({}, pkg);
    delete b.packageSha256;
    pkg.packageSha256 = "sha256:" + A2.sha256OfCanonical(b);
    return pkg;
  };
  const mkPkg = (row) => A2.buildRowPackage(row, cellOfRow(row), null);

                      
  if (zeroRow && fullRow) {
    const zc = cellOfRow(zeroRow), fc = cellOfRow(fullRow);
    const zp = A2.buildRowPackage(zeroRow, zc, null);
    const fp = A2.buildRowPackage(fullRow, fc, null);
    const vz = A2.verifyRowPackage(zp, { classRowRef: zeroRow.classRowRef, cellFootprintRef: zc.cellFootprintRef });
    const vf = A2.verifyRowPackage(fp, { classRowRef: fullRow.classRowRef, cellFootprintRef: fc.cellFootprintRef });
    check("正例：零有效足迹行 → 包内 prod 保持 null（未被写 0）且核验通过",
          zp.record.prod_kgC_yr === null && vz.ok, vz.errors.slice(0, 2).join("; "));
    check("正例：完整有效足迹行 → 产品积分值非 null 且核验通过",
          typeof fp.record.prod_kgC_yr === "number" && vf.ok, vf.errors.slice(0, 2).join("; "));

    const expectFail = (name, row, mutate, mustHit, expected) => {
      const pkg = mkPkg(row);
      mutate(pkg);
      rehash(pkg);
      const v = A2.verifyRowPackage(pkg, expected);
      const hit = !mustHit || v.errors.some((e) => e.indexOf(mustHit) >= 0);
      check(name, !v.ok && hit, v.errors.slice(0, 2).join("; "));
    };
    const own = (row) => {
      const c = cellOfRow(row);
      return { classRowRef: row.classRowRef, cellFootprintRef: c.cellFootprintRef };
    };

    expectFail("反例1 声明越界 declarationCategory=REMOVAL（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.declarationCategory = "REMOVAL"; }, "声明类别", own(zeroRow));
    expectFail("反例2 删掉必填字段 prod_kgC_yr（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { delete p.record.prod_kgC_yr; }, "缺必填字段", own(zeroRow));
    expectFail("反例3 空兄弟集（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.cell.classRowRefs = []; }, "兄弟集", own(zeroRow));
    expectFail("反例4 兄弟集重复项（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.cell.classRowRefs = [zeroRow.classRowRef, zeroRow.classRowRef]; },
               "重复", own(zeroRow));
    expectFail("反例5 兄弟集元素非法格式（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.cell.classRowRefs = ["sha256:deadbeef"]; }, "非法", own(zeroRow));
    expectFail("反例6 兄弟集不含本行 classRowRef（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.cell.classRowRefs = ["local-sha256:" + "a".repeat(64)]; },
               "不含本行自身", own(zeroRow));
    expectFail("反例7 classRowCount 与兄弟集项数不符（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.cell.classRowCount = p.cell.classRowRefs.length + 1; },
               "classRowCount", own(zeroRow));
    expectFail("反例8 行内格级总量与所属格年不符（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.record.cellValidAreaM2 = p.record.cellValidAreaM2 + 1; },
               "不绑定", own(zeroRow));
    expectFail("反例9 单位链断裂 prod_tC_yr != prod_kgC_yr/1000（自摘要已重算）→ 拒绝",
               fullRow, (p) => { p.record.prod_tC_yr = p.record.prod_tC_yr + 1; },
               "单位链", own(fullRow));
    expectFail("反例10 单位链断裂 intensity != prod/classValidAreaM2（自摘要已重算）→ 拒绝",
               fullRow, (p) => { p.record.intensity_kg_m2_yr = p.record.intensity_kg_m2_yr + 1; },
               "单位链", own(fullRow));
    expectFail("反例11 伪零：零有效足迹的 prod 改成 0（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.record.prod_kgC_yr = 0; }, "伪零", own(zeroRow));
    expectFail("反例12 归因被改成其它值（自摘要已重算）→ 拒绝",
               zeroRow, (p) => { p.attributionStatus = "verified"; }, "归因声明", own(zeroRow));
    expectFail("反例13 与页面记录锚点不符（结构自洽但非本记录）→ 拒绝",
               zeroRow, () => {}, "页面记录",
               { classRowRef: "local-sha256:" + "b".repeat(64), cellFootprintRef: null });

                                       
    const otherCell = doc.cells.find((c) => c.cellId !== zeroRow.cellId);
    const mixed = A2.buildRowPackage(zeroRow, Object.assign({}, otherCell,
      { classRowCount: otherCell.classRowRefs.length }), null);
    const vm = A2.verifyRowPackage(mixed, own(zeroRow));
    check("反例14 类别行配到另一格年（自摘要已重算）→ 拒绝",
          !vm.ok && vm.errors.some((e) => e.indexOf("不绑定") >= 0),
          vm.errors.slice(0, 2).join("; "));

                                   
    const t15 = mkPkg(fullRow);
    t15.record.prod_kgC_yr = t15.record.prod_kgC_yr + 1;
    const v15 = A2.verifyRowPackage(t15, own(fullRow));
    check("反例15 只改包内数值不重算摘要 → packageSha256 重算不符",
          !v15.ok && v15.errors.some((e) => e.indexOf("packageSha256") >= 0),
          v15.errors.slice(0, 2).join("; "));
  } else {
    check("需要零有效/完整有效行用于反例组", false, "未找到");
  }

  const passed = results.filter((r) => r[1]).length;
  console.log("-".repeat(70));
  console.log(`A2 JS↔Python 交叉核验：${passed}/${results.length} 通过`);
  return passed === results.length ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}
module.exports = main;                                           
