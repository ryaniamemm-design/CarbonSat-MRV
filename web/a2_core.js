                                                   
  
      
                                                                                    
                             
                                          
                                                       
  
                         
                                                                             
                  
  
                                          
                                    
                                                                
                                                                       
                                                            
                                              
                                                                   
                                                               
                                                                 
                                                         
  
      
                                                         
                                                                 
                                

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./e2e_core.js"));
  } else {
    root.A2Core = factory(root.E2ECore);
  }
})(typeof self !== "undefined" ? self : this, function (E2E) {
  "use strict";

  const SCHEMA_VERSION = "CarbonSat-NPP-LandcoverValidFootprint-A2-v1.1";
  const CANONICAL_VERSION = "a2-canonical-v2";
  const DECLARATION = "DESCRIPTIVE_NPP_ONLY";
  const ATTRIBUTION = "insufficient_evidence";
  const FORBIDDEN_OUTPUTS = ["REMOVAL", "GOVERNANCE_INCREMENT", "CARBON_CREDIT"];
  const ANCHOR_PREFIX = "local-sha256:";
  const ANCHOR_RE = /^local-sha256:[0-9a-f]{64}$/;

                                     
  const ROW_FIELDS = [
    "cellId", "lon", "lat", "year", "lcCode", "lcName", "pixelCount",
    "areaM2", "classValidAreaM2", "coverageRatio",
    "prod_kgC_yr", "prod_tC_yr", "intensity_kg_m2_yr",
    "cellTotalAreaM2", "cellValidAreaM2", "totalIntegral_kgC_yr", "totalProd_tC_yr",
    "product", "lcProduct", "mask", "crs", "scale", "method_version",
  ];
                                                                   
                                                   
                                                                            
  const CELL_FIELDS = ["cellId", "year", "cellTotalAreaM2", "cellValidAreaM2",
                       "totalIntegral_kgC_yr", "totalProd_tC_yr", "classRowRefs"];
                                 
  const ROW_CELL_TOTALS = ["cellTotalAreaM2", "cellValidAreaM2",
                           "totalIntegral_kgC_yr", "totalProd_tC_yr"];
                                                                    
                                                   
  const NUMERIC_VECTORS = [
    [0, "0"], [0.0, "0"], [-0.0, "0"],
    [1, "1"], [1.0, "1"], [-1, "-1"], [100, "100"], [100.0, "100"],
    [0.1, "0.1"], [-0.1, "-0.1"],
    [1e-3, "0.001"], [1e-4, "0.0001"], [1e-5, "0.00001"], [1e-6, "0.000001"],
    [1e-7, "0.0000001"], [1e-8, "0.00000001"], [1.5e-5, "0.000015"],
    [463.3127165, "463.3127165"], [107.74999999999999, "107.74999999999999"],
    [1234567.89, "1234567.89"],
    [1e15, "1000000000000000"], [9999999999999998.0, "9999999999999998"],
    [1e16, "10000000000000000"], [1.5e16, "15000000000000000"],
    [1e21, "1000000000000000000000"], [1e22, "10000000000000000000000"],
  ];

                                                             
  function expandDecimal(str) {
    let s = String(str).trim();
    let neg = false;
    if (s[0] === "+" || s[0] === "-") { neg = s[0] === "-"; s = s.slice(1); }
    let mant = s, exp10 = 0;
    const ei = s.search(/[eE]/);
    if (ei >= 0) { mant = s.slice(0, ei); exp10 = parseInt(s.slice(ei + 1), 10); }
    let ip, fp;
    const di = mant.indexOf(".");
    if (di >= 0) { ip = mant.slice(0, di); fp = mant.slice(di + 1); }
    else { ip = mant; fp = ""; }
    let digits = (ip + fp).replace(/^0+/, "");
    if (digits === "") return "0";                            
    exp10 -= fp.length;                                                                    
    while (digits.length > 1 && digits.charAt(digits.length - 1) === "0") {
      digits = digits.slice(0, -1); exp10 += 1;
    }
    let out;
    if (exp10 >= 0) {
      out = digits + "0".repeat(exp10);
    } else {
      const point = digits.length + exp10;
      out = point > 0 ? digits.slice(0, point) + "." + digits.slice(point)
                      : "0." + "0".repeat(-point) + digits;
    }
    return (neg ? "-" : "") + out;
  }

                                        
  function canonicalize(v) {
    if (v === undefined) {
      throw new Error("缺键/undefined 不可规范化（缺必填字段必须显式报错，不得折叠成 null）");
    }
    if (v === null) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "number") {
      if (!Number.isFinite(v)) {
        throw new Error("非有限数值，拒绝规范化: " + v);
      }
      return expandDecimal(String(v));
    }
    if (typeof v === "string") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(canonicalize).join(", ") + "]";
    if (typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (k) {
        return JSON.stringify(k) + ": " + canonicalize(v[k]);
      }).join(", ") + "}";
    }
    throw new Error("不可规范化的类型: " + typeof v);
  }

  function sha256OfCanonical(obj) {
    if (!E2E || typeof E2E.sha256HexUtf8 !== "function") {
      throw new Error("e2e_core.sha256HexUtf8 不可用（冻结模块未加载）");
    }
    return E2E.sha256HexUtf8(canonicalize(obj));
  }

  function anchor(obj) {
    return ANCHOR_PREFIX + sha256OfCanonical(obj);
  }

                                                     
                                        
  function pickStrict(obj, fields, label) {
    if (!obj || typeof obj !== "object") throw new Error((label || "对象") + " 非对象");
    const o = {};
    const missing = [];
    fields.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) { missing.push(k); return; }
      o[k] = obj[k];
    });
    if (missing.length) {
      throw new Error((label || "对象") + " 缺必填字段: " + missing.join(", "));
    }
    return o;
  }

  function classRowRef(row) {
    return anchor(pickStrict(row, ROW_FIELDS, "逐类行"));
  }

  function cellFootprintRef(cell) {
    return anchor({
      cellId: cell.cellId,
      year: cell.year,
      cellTotalAreaM2: cell.cellTotalAreaM2,
      cellValidAreaM2: cell.cellValidAreaM2,
      totalIntegral_kgC_yr: cell.totalIntegral_kgC_yr,
      totalProd_tC_yr: cell.totalProd_tC_yr,
      classRowRefs: (cell.classRowRefs || []).slice().sort(),
    });
  }

                                              
  function buildRowPackage(row, cell, meta) {
    const pkg = {
      schemaVersion: SCHEMA_VERSION,
      generator: "web/a2_core.js",
      canonicalVersion: CANONICAL_VERSION,
      methodVersion: row.method_version,
      declarationCategory: DECLARATION,
      attributionStatus: ATTRIBUTION,
      forbiddenOutputs: FORBIDDEN_OUTPUTS.slice(),
      record: pickStrict(row, ROW_FIELDS, "逐类行"),
      classRowRef: classRowRef(row),
      cellFootprintRef: cellFootprintRef(cell),
      cell: pickStrict(cell, CELL_FIELDS, "格年上下文"),
      sourceContext: meta || null,
      note: "有效足迹内产品积分值（MOD17 模型 NPP 积分，非地面实测）；零有效足迹 → prod/intensity 为 null（缺测），不得写作 0。",
    };
    pkg.packageSha256 = "sha256:" + sha256OfCanonical(pkg);
    return pkg;
  }

                                          
                                                      
                                                                   
                                           
  function verifyRowPackage(pkg, expected) {
    const errs = [];
    if (!pkg || typeof pkg !== "object") {
      return { ok: false, errors: ["非对象"], recomputed: {} };
    }

              
    if (pkg.declarationCategory !== DECLARATION) {
      errs.push("声明类别必须为 " + DECLARATION + "（当前=" + String(pkg.declarationCategory) + "）");
    }
    if (FORBIDDEN_OUTPUTS.indexOf(pkg.declarationCategory) >= 0) {
      errs.push("声明类别落在禁用输出内: " + String(pkg.declarationCategory));
    }
    if (pkg.attributionStatus !== ATTRIBUTION) {
      errs.push("归因声明必须为 " + ATTRIBUTION + "（当前=" + String(pkg.attributionStatus) + "）");
    }
    if (pkg.schemaVersion !== SCHEMA_VERSION) errs.push("schemaVersion 不符: " + String(pkg.schemaVersion));
    if (pkg.canonicalVersion !== CANONICAL_VERSION) {
      errs.push("canonicalVersion 不符: " + String(pkg.canonicalVersion));
    }
    if (JSON.stringify(pkg.forbiddenOutputs) !== JSON.stringify(FORBIDDEN_OUTPUTS)) {
      errs.push("forbiddenOutputs 不完整");
    }

             
    const rec = pkg.record;
    if (!rec || typeof rec !== "object") {
      errs.push("record 缺失或非对象");
      return { ok: false, errors: errs, recomputed: {} };
    }
    const cellObj = pkg.cell;
    if (!cellObj || typeof cellObj !== "object") {
      errs.push("cell 缺失或非对象");
      return { ok: false, errors: errs, recomputed: {} };
    }
    const has = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
    const missRow = ROW_FIELDS.filter(function (k) { return !has(rec, k); });
    if (missRow.length) errs.push("record 缺必填字段: " + missRow.join(", "));
    const missCell = CELL_FIELDS.filter(function (k) { return !has(cellObj, k); });
    if (missCell.length) errs.push("cell 缺必填字段: " + missCell.join(", "));

                   
    if (cellObj.cellId !== rec.cellId) errs.push("类别行与格年不绑定：cell.cellId != record.cellId");
    if (cellObj.year !== rec.year) errs.push("类别行与格年不绑定：cell.year != record.year");
    ROW_CELL_TOTALS.forEach(function (f) {
      if (has(rec, f) && has(cellObj, f) && rec[f] !== cellObj[f]) {
        errs.push("类别行与格年不绑定：行内 " + f + " 与格年条目不一致");
      }
    });

                                      
    const sib = cellObj.classRowRefs;
    if (!Array.isArray(sib) || sib.length === 0) {
      errs.push("兄弟集缺失或为空：无法独立重算 cellFootprintRef");
    } else {
      if (sib.some(function (x) { return typeof x !== "string" || !ANCHOR_RE.test(x); })) {
        errs.push("兄弟集含非法 local-sha256 锚点");
      }
      if (new Set(sib).size !== sib.length) errs.push("兄弟集有重复项");
                                                         
      if (typeof pkg.classRowRef === "string" && sib.indexOf(pkg.classRowRef) < 0) {
        errs.push("兄弟集不含本行自身 classRowRef（兄弟集不完整）");
      }
      if (typeof cellObj.classRowCount === "number" && cellObj.classRowCount !== sib.length) {
        errs.push("兄弟集项数与 classRowCount 不符（兄弟集不完整）");
      }
    }

                                      
    if (missRow.length === 0) {
      const cva = rec.classValidAreaM2;
      const prod = rec.prod_kgC_yr;
      const inten = rec.intensity_kg_m2_yr;
      if (cva === 0) {
        if (prod !== null) errs.push("伪零：classValidAreaM2==0 但 prod 非 null");
        if (inten !== null) errs.push("伪零：classValidAreaM2==0 但 intensity 非 null");
      } else if (typeof cva === "number" && cva > 0) {
        if (prod === null) errs.push("未知缺失：classValidAreaM2>0 但 prod 为 null");
        if (inten === null) errs.push("未知缺失：classValidAreaM2>0 但 intensity 为 null");
      }
      if (typeof prod === "number" && typeof rec.prod_tC_yr === "number"
          && Math.abs(rec.prod_tC_yr - prod / 1000) > 1e-9 * Math.max(1, Math.abs(rec.prod_tC_yr))) {
        errs.push("单位链 prod_tC_yr != prod_kgC_yr/1000");
      }
      if (typeof prod === "number" && typeof inten === "number"
          && typeof cva === "number" && cva > 0
          && Math.abs(inten - prod / cva) > 1e-9 * Math.max(1, Math.abs(inten))) {
        errs.push("单位链 intensity != prod_kgC_yr/classValidAreaM2");
      }
    }

                                   
    let wantRow = null, wantCell = null;
    if (missRow.length === 0) {
      try {
        wantRow = classRowRef(rec);
        if (pkg.classRowRef !== wantRow) errs.push("classRowRef 重算不符");
      } catch (e) { errs.push("classRowRef 无法重算: " + e.message); }
    }
    if (missCell.length === 0) {
      try {
        wantCell = cellFootprintRef(cellObj);
        if (pkg.cellFootprintRef !== wantCell) errs.push("cellFootprintRef 重算不符");
      } catch (e) { errs.push("cellFootprintRef 无法重算: " + e.message); }
    }

                      
    if (expected && typeof expected === "object") {
      if (expected.classRowRef && pkg.classRowRef !== expected.classRowRef) {
        errs.push("classRowRef 与页面记录不一致");
      }
      if (expected.cellFootprintRef && pkg.cellFootprintRef !== expected.cellFootprintRef) {
        errs.push("cellFootprintRef 与页面记录不一致");
      }
    }

              
    try {
      const body = Object.assign({}, pkg);
      delete body.packageSha256;
      const wantPkg = "sha256:" + sha256OfCanonical(body);
      if (pkg.packageSha256 !== wantPkg) errs.push("packageSha256 重算不符（包内容被改动）");
    } catch (e) {
      errs.push("packageSha256 无法重算: " + e.message);
    }

    return { ok: errs.length === 0, errors: errs,
             recomputed: { classRowRef: wantRow, cellFootprintRef: wantCell } };
  }

                                 
  function footprintBandLabel(row) {
    if (row.classValidAreaM2 === 0) return "无有效产品值";
    if (row.coverageRatio === 1) return "完整有效足迹";
    return "部分有效足迹";
  }

  function coverageBand(row) {
    if (row.classValidAreaM2 === 0) return "zero";
    if (row.coverageRatio === 1) return "full";
    return "partial";
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    CANONICAL_VERSION: CANONICAL_VERSION,
    DECLARATION: DECLARATION,
    ATTRIBUTION: ATTRIBUTION,
    FORBIDDEN_OUTPUTS: FORBIDDEN_OUTPUTS,
    ANCHOR_PREFIX: ANCHOR_PREFIX,
    ANCHOR_RE: ANCHOR_RE,
    ROW_FIELDS: ROW_FIELDS,
    CELL_FIELDS: CELL_FIELDS,
    ROW_CELL_TOTALS: ROW_CELL_TOTALS,
    NUMERIC_VECTORS: NUMERIC_VECTORS,
    expandDecimal: expandDecimal,
    pickStrict: pickStrict,
    canonicalize: canonicalize,
    sha256OfCanonical: sha256OfCanonical,
    classRowRef: classRowRef,
    cellFootprintRef: cellFootprintRef,
    buildRowPackage: buildRowPackage,
    verifyRowPackage: verifyRowPackage,
    footprintBandLabel: footprintBandLabel,
    coverageBand: coverageBand,
  };
});
