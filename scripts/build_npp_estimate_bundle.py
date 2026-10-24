


from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INTEGRAL = ROOT / "data" / "npp_annual_production_integral.csv"
A2 = ROOT / "evidence" / "a2_landcover_valid_footprint.json"
OUT = ROOT / "web" / "npp_estimate_bundle.json"
PIN = ROOT / "web" / "npp_estimate_bundle.pin.json"

SCHEMA = "CarbonSat-NppEstimateBundle-v1.1"
PIN_SCHEMA = "CarbonSat-NppEstimateBundlePin-v1.0"
GENERATOR = "scripts/build_npp_estimate_bundle.py"
GENERATOR_VERSION = "npp-estimate-bundle-v1.1"
CONTENT_DOMAIN = "CarbonSat-MRV|npp-estimate-bundle-content|v1\n"
EXPECTED_CELL_YEARS = 816
EXPECTED_CLASS_ROWS = 1523
EXPECTED_CELLS = 34
ERA_BOUNDARY_YEAR = 2012
YEARS = list(range(2001, 2025))

CROSS_TOL = 1e-9

UNITS = {
    "prod_tC_yr": ["tC/yr", "所选离散足迹的 MOD17 模型年度 NPP 碳生产量（模型值，非碳汇）"],
    "integral_kgC_yr": ["kgC/yr", "逐像元积分原值，未换算为 t"],
    "gridValidAreaM2": ["m2", "栅格有效面积（npp_valid_mask），生产量的分母"],
    "gridTotalAreaM2": ["m2", "栅格总面积；不得代替有效面积作分母"],
    "geomAreaM2": ["m2", "矢量测地面积；与栅格面积有像元边界效应差异"],
    "validAreaRatio": ["dimensionless", "栅格有效面积比例 = gridValidAreaM2 / gridTotalAreaM2；不是逐年观测准确率"],
    "intensity_kg_m2_yr": ["kgC/m2/yr", "地类流量强度，分母为该地类有效栅格面积"],
    "classValidAreaM2": ["m2", "该 IGBP 类别的有效栅格面积"],
    "coverageRatio": ["dimensionless", "该类别有效面积占其类别面积之比"],
}

METHODOLOGY = {
    "method_version": "CarbonSat-NPP-Production-Integral-v0.1",
    "landcover_method_version": "CarbonSat-NPP-LandcoverValidFootprint-v0.1",
    "product": "MOD17A3HGF.v6.1",
    "lcProduct": "MCD12Q1.v6.1",
    "mask": "npp_valid_mask",
    "crs": "SR-ORG:6974",
    "scale": 500,
    "nativePixelSpacingM": 463.3127165,
    "formula": "P_cell = Σ_pixels (NPP_scaled × pixelArea) / 1000  [tC/yr]; NPP_scaled = DN × 0.0001",
    "excludedErrors": [
        "MOD17 模型结构性偏差与输入 GPP 参数误差未评估（无本区涡度相关标定）。",
        "地类产品（MCD12Q1）类别混淆与逐年变化未量化；地类变化不得解读为植被恢复。",
        "2012 附近存在同步结构性断点，成因未证实；按分析时段分段，不得跨该断点作增减解释。",
        "sourceHash / CSV 文件哈希只证明与本地 CSV 一致，不证明 GEE 原始资产真实。",
        "空间尺度差异（463 m 像元 vs 治理地块）与配准误差未评估。",
    ],
    "crossEraPolicy": "默认不绘制跨 2012 的增长箭头/增长率/治理效果；只按分析时段（era）分段查看原始描述性序列。",
}

INSTALLED_BOUNDARY = {
    "claimClass": "DESCRIPTIVE_NPP_ONLY",
    "attributionStatus": "insufficient_evidence",
    "forbiddenOutputs": ["REMOVAL", "GOVERNANCE_INCREMENT", "CARBON_CREDIT", "tCO2e"],
    "carbonQuantificationStatus": "NOT_PERFORMED",
    "registrationReady": False,
    "publiclyAnchored": False,
}

BUNDLE_KEYS = sorted([
    "schemaVersion", "generator", "generatorVersion", "bundleContentSha256",
    *INSTALLED_BOUNDARY.keys(),
    "generatedFrom", "crossCheck", "units", "methodology", "cellGeometry",
    "years", "eraBoundaryYear", "expectedCellYears", "expectedClassRows",
    "observedCellYears", "observedClassRows", "cells", "cellYears",
])
CY_KEYS = sorted(["cellId", "year", "prod_tC_yr", "integral_kgC_yr", "geomAreaM2", "gridTotalAreaM2",
                  "gridValidAreaM2", "validAreaRatio", "missing", "missingReason", "landCover"])
LC_KEYS = sorted(["lcCode", "lcName", "classValidAreaM2", "prod_tC_yr", "intensity_kg_m2_yr", "coverageRatio"])
CELL_KEYS = sorted(["cellId", "lon", "lat"])
AUTH_SOURCES = {
    "productionIntegral": "data/npp_annual_production_integral.csv",
    "a2ValidFootprint": "evidence/a2_landcover_valid_footprint.json",
}
RTOL = 1e-9


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def _esc_ascii(s: str) -> str:

    return json.dumps(s, ensure_ascii=True)


def canonical_bits(value) -> str:


    if value is None:
        return "n"
    if value is True:
        return "t"
    if value is False:
        return "f"
    if isinstance(value, str):
        return _esc_ascii(value)
    if isinstance(value, (int, float)):
        f = float(value)
        if not math.isfinite(f):
            raise ValueError("非有限数值不可规范化")
        return "#" + struct.pack(">d", f).hex()
    if isinstance(value, list):
        return "[" + ",".join(canonical_bits(x) for x in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(_esc_ascii(k) + ":" + canonical_bits(value[k]) for k in sorted(value)) + "}"
    raise ValueError("不支持的值（缺失字段不能当 null）")


def content_sha(bundle: dict) -> str:
    core = {k: v for k, v in bundle.items() if k != "bundleContentSha256"}
    digest = hashlib.sha256((CONTENT_DOMAIN + canonical_bits(core)).encode("utf-8")).hexdigest()
    return "local-sha256:" + digest


def rel_diff(a, b) -> float:
    return abs(a - b) / max(abs(a), abs(b), 1e-30)


def _num(cell: dict, key: str):
    v = cell.get(key)
    if v is None or v == "":
        return None
    try:
        return int(v) if key == "year" else float(v)
    except (TypeError, ValueError):
        return None


def _bool_flag(v):
    return str(v).strip().lower() in ("true", "1", "yes")


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def derive() -> dict:

    with INTEGRAL.open("r", encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))

    cells = {}
    cell_years = {}
    for r in rows:
        cid = r["cellId"]
        year = int(r["year"])
        cells.setdefault(cid, {"cellId": cid, "lon": float(r["lon"]), "lat": float(r["lat"])})
        key = f"{cid}|{year}"
        cell_years[key] = {
            "cellId": cid,
            "year": year,
            "prod_tC_yr": _num(r, "prod_tC_yr"),
            "integral_kgC_yr": _num(r, "integral_kgC_yr"),
            "geomAreaM2": _num(r, "geomAreaM2"),
            "gridTotalAreaM2": _num(r, "gridTotalAreaM2"),
            "gridValidAreaM2": _num(r, "gridValidAreaM2"),
            "validAreaRatio": _num(r, "validAreaRatio"),
            "missing": _bool_flag(r.get("missing", "False")),
            "missingReason": (r.get("missingReason") or "").strip(),
            "landCover": [],
        }

    a2 = json.loads(A2.read_text(encoding="utf-8"))
    class_rows = 0
    for row in a2["rows"]:
        key = f"{row['cellId']}|{row['year']}"
        if key not in cell_years:
            raise ValueError(f"land-cover row for unknown cell-year: {key}")
        cell_years[key]["landCover"].append({
            "lcCode": row["lcCode"],
            "lcName": row["lcName"],
            "classValidAreaM2": row.get("classValidAreaM2"),
            "prod_tC_yr": row.get("prod_tC_yr"),
            "intensity_kg_m2_yr": row.get("intensity_kg_m2_yr"),
            "coverageRatio": row.get("coverageRatio"),
        })
        class_rows += 1
    for key, cy in cell_years.items():
        cy["landCover"].sort(key=lambda x: x["lcCode"])


    a2_cells = {(c["cellId"], c["year"]): c for c in a2["cells"]}
    worst, worst_key = 0.0, None
    for key, cy in cell_years.items():
        ref = a2_cells.get((cy["cellId"], cy["year"]))
        if ref is None:
            raise ValueError(f"A2 cells missing {key}")
        a = cy["prod_tC_yr"]
        b = ref.get("totalProd_tC_yr")
        if a is None or b is None:
            continue
        diff = rel_diff(a, b)
        if diff > worst:
            worst, worst_key = diff, [cy["cellId"], cy["year"]]
    if worst > CROSS_TOL:
        raise ValueError(f"cross-check failed worst={worst} at {worst_key}")

    bundle = {
        "schemaVersion": SCHEMA,
        "generator": GENERATOR,
        "generatorVersion": GENERATOR_VERSION,
        **INSTALLED_BOUNDARY,
        "generatedFrom": {
            "productionIntegral": {
                "path": "data/npp_annual_production_integral.csv",
                "sha256": sha256_file(INTEGRAL),
            },
            "a2ValidFootprint": {
                "path": "evidence/a2_landcover_valid_footprint.json",
                "sha256": sha256_file(A2),
            },
        },
        "crossCheck": {
            "metric": "relative difference between production-integral prod_tC_yr and A2 cell totalProd_tC_yr",
            "worstRelDiff": worst,
            "worstKey": worst_key,
            "tolerance": CROSS_TOL,
        },
        "units": UNITS,
        "methodology": METHODOLOGY,
        "cellGeometry": {
            "definition": "格心 ±0.03° 方框（示意几何；为离散采样框，不是治理地块边界）",
            "halfSpanDeg": 0.03,
        },
        "years": YEARS,
        "eraBoundaryYear": ERA_BOUNDARY_YEAR,
        "expectedCellYears": EXPECTED_CELL_YEARS,
        "expectedClassRows": EXPECTED_CLASS_ROWS,
        "observedCellYears": len(cell_years),
        "observedClassRows": class_rows,
        "cells": [cells[k] for k in sorted(cells)],
        "cellYears": {k: cell_years[k] for k in sorted(cell_years)},
    }
    bundle["bundleContentSha256"] = content_sha(bundle)
    return bundle


def serialized(bundle: dict) -> str:
    return json.dumps(bundle, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def derive_pin(bundle: dict, text: str) -> dict:
    data = text.encode("utf-8")
    return {
        "schemaVersion": PIN_SCHEMA,
        "bundlePath": "web/npp_estimate_bundle.json",
        "bundleBytes": len(data),
        "bundleFileSha256": sha256_bytes(data),
        "bundleContentSha256": bundle["bundleContentSha256"],
        "bundleSchemaVersion": bundle["schemaVersion"],
        "generatedFrom": bundle["generatedFrom"],
    }


def serialized_pin(pin: dict) -> str:
    return json.dumps(pin, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def validate_structure(bundle: dict) -> list:

    errors = []
    if not isinstance(bundle, dict):
        return ["bundle root must be an object"]
    if sorted(bundle.keys()) != BUNDLE_KEYS:
        errors.append("bundle key set mismatch (missing or undeclared field)")
    for key, val in INSTALLED_BOUNDARY.items():
        if bundle.get(key) != val:
            errors.append(f"boundary field {key} changed")
    if bundle.get("schemaVersion") != SCHEMA:
        errors.append("schemaVersion mismatch")
    if bundle.get("generator") != GENERATOR:
        errors.append("generator mismatch")
    if bundle.get("generatorVersion") != GENERATOR_VERSION:
        errors.append("generatorVersion mismatch")
    if bundle.get("years") != YEARS:
        errors.append("years mismatch")
    if bundle.get("eraBoundaryYear") != ERA_BOUNDARY_YEAR:
        errors.append("eraBoundaryYear mismatch")
    if bundle.get("expectedCellYears") != EXPECTED_CELL_YEARS or bundle.get("observedCellYears") != EXPECTED_CELL_YEARS:
        errors.append(f"observedCellYears must be {EXPECTED_CELL_YEARS}")
    if bundle.get("expectedClassRows") != EXPECTED_CLASS_ROWS or bundle.get("observedClassRows") != EXPECTED_CLASS_ROWS:
        errors.append(f"observedClassRows must be {EXPECTED_CLASS_ROWS}")
    if bundle.get("units") != UNITS:
        errors.append("units mismatch (authority copy changed)")
    if bundle.get("methodology") != METHODOLOGY:
        errors.append("methodology mismatch (authority copy changed)")

    digest = bundle.get("bundleContentSha256")
    if not (isinstance(digest, str) and digest.startswith("local-sha256:") and len(digest) == len("local-sha256:") + 64):
        errors.append("bundleContentSha256 missing or malformed")
    else:
        recomputed = content_sha(bundle)
        if digest != recomputed:
            errors.append("bundleContentSha256 does not match recomputed content digest")

    gen = bundle.get("generatedFrom") or {}
    if sorted(gen.keys()) != ["a2ValidFootprint", "productionIntegral"]:
        errors.append("generatedFrom key set mismatch")
    else:
        for key, path in AUTH_SOURCES.items():
            entry = gen.get(key) or {}
            if sorted(entry.keys()) != ["path", "sha256"]:
                errors.append(f"generatedFrom.{key} structure mismatch")
                continue
            if entry.get("path") != path:
                errors.append(f"generatedFrom.{key} path mismatch")
            sha = entry.get("sha256")
            if not (isinstance(sha, str) and len(sha) == 64 and all(c in "0123456789abcdef" for c in sha)):
                errors.append(f"generatedFrom.{key} sha256 malformed")

    cross = bundle.get("crossCheck") or {}
    if sorted(cross.keys()) != ["metric", "tolerance", "worstKey", "worstRelDiff"]:
        errors.append("crossCheck structure mismatch")
    elif not isinstance(cross.get("tolerance"), (int, float)):
        errors.append("crossCheck tolerance malformed")
    elif cross.get("worstRelDiff") is not None and cross["worstRelDiff"] > cross["tolerance"]:
        errors.append("crossCheck worstRelDiff exceeds registered tolerance")

    cells = bundle.get("cells") or []
    if len(cells) != EXPECTED_CELLS or len({c["cellId"] for c in cells}) != EXPECTED_CELLS:
        errors.append("cells must be exactly 34 unique")
    for c in cells:
        if sorted(c.keys()) != CELL_KEYS:
            errors.append("cell structure mismatch")
            break
    cell_ids = [c["cellId"] for c in cells]

    cy = bundle.get("cellYears") or {}
    expected_keys = {f"{cid}|{y}" for cid in cell_ids for y in YEARS}
    if set(cy.keys()) != expected_keys:
        errors.append("cellYears key set must be exactly 34 x 24")
    if len(cy) != EXPECTED_CELL_YEARS:
        errors.append("cellYears count mismatch")
    class_rows = 0
    for key, row in cy.items():
        if sorted(row.keys()) != CY_KEYS:
            errors.append(f"cellYear structure mismatch: {key}")
            break
        if key != f"{row['cellId']}|{row['year']}":
            errors.append(f"cellYear key mismatch: {key}")
            break
        if row["year"] not in YEARS:
            errors.append(f"year out of range: {key}")
            break
        for field in ("prod_tC_yr", "integral_kgC_yr", "geomAreaM2", "gridTotalAreaM2", "gridValidAreaM2", "validAreaRatio"):
            val = row.get(field)
            if val is not None and not _is_num(val):
                errors.append(f"non numeric {field} at {key}")
                break
        prod, integral = row.get("prod_tC_yr"), row.get("integral_kgC_yr")
        if _is_num(prod) and _is_num(integral) and rel_diff(prod, integral / 1000.0) > RTOL:
            errors.append(f"prod_tC_yr != integral_kgC_yr/1000 at {key}")
        gv, gt, ratio = row.get("gridValidAreaM2"), row.get("gridTotalAreaM2"), row.get("validAreaRatio")
        if _is_num(gv) and _is_num(gt) and gt > 0:
            if not _is_num(ratio) or rel_diff(ratio, gv / gt) > RTOL:
                errors.append(f"validAreaRatio != gridValidAreaM2/gridTotalAreaM2 at {key}")
        area_sum, area_rows = 0.0, 0
        for lc in row.get("landCover") or []:
            class_rows += 1
            if sorted(lc.keys()) != LC_KEYS:
                errors.append(f"landCover structure mismatch at {key}")
                break
            ca, cp, ci = lc.get("classValidAreaM2"), lc.get("prod_tC_yr"), lc.get("intensity_kg_m2_yr")
            if _is_num(ca) and ca > 0:
                area_sum += ca
                area_rows += 1
                if not _is_num(cp) or not _is_num(ci):
                    errors.append(f"valid area but missing production at {key}")
                elif rel_diff(cp, ci * ca / 1000.0) > RTOL:
                    errors.append(f"land-cover prod != intensity x area/1000 at {key}")
            elif cp is not None or ci is not None:
                errors.append(f"no valid area but production present at {key}")
        if area_rows and _is_num(gv) and rel_diff(area_sum, gv) > RTOL:
            errors.append(f"land-cover area sum != gridValidAreaM2 at {key}")
    if class_rows and class_rows != EXPECTED_CLASS_ROWS:
        errors.append(f"observed class rows {class_rows} != {EXPECTED_CLASS_ROWS}")
    return errors


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args(argv)

    if args.selftest:
        cases = []

        def case(name, ok):
            cases.append({"name": name, "ok": bool(ok)})

        base = derive()
        case("derive produces 816 cell-years", len(base["cellYears"]) == EXPECTED_CELL_YEARS)
        case("derive produces 1523 class rows", base["observedClassRows"] == EXPECTED_CLASS_ROWS)
        case("structure valid", not validate_structure(base))
        case("deterministic serialization", serialized(base) == serialized(derive()))

        case("canonical_bits integers are not floats", canonical_bits({"a": 1}) == canonical_bits({"a": 1.0}))
        case("canonical_bits numbers are bit strings", canonical_bits(1) == "#" + struct.pack(">d", 1.0).hex())
        case("canonical_bits strings are ascii escaped", canonical_bits("柠") == json.dumps("柠", ensure_ascii=True))
        case("canonical_bits sorts keys", canonical_bits({"b": 1, "a": 2}) == canonical_bits({"a": 2, "b": 1}))
        case("canonical_bits rejects non finite", _raises(lambda: canonical_bits(float("nan"))))
        case("content digest stable", content_sha(base) == content_sha(derive()))
        tampered = json.loads(json.dumps(base))
        tampered["attributionStatus"] = "REMOVAL"
        case("declaring REMOVAL rejected", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["cellYears"]["cell_0020|2001"]["prod_tC_yr"] = "not-a-number"
        case("non numeric value rejected", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["observedCellYears"] = 800
        case("missing cell-year count rejected", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        del tampered["cellYears"]["cell_0020|2001"]
        case("deleted cell-year key rejected", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["cellYears"]["cell_0020|2001"]["prod_tC_yr"] += 100
        case("edited value breaks relation and digest", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["cellYears"]["cell_0020|2001"]["prod_tC_yr"] += 100
        tampered["bundleContentSha256"] = content_sha(tampered)
        case("coordinated rewrite still breaks relation check", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["units"]["prod_tC_yr"] = ["tCO2e", "claimed credit"]
        case("unit rewrite rejected", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["methodology"]["formula"] = "C = A x B"
        case("methodology rewrite rejected", bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        zero_row = None
        for _cy in tampered["cellYears"].values():
            for lc in _cy["landCover"]:
                if lc["classValidAreaM2"] == 0.0:
                    zero_row = lc
                    break
            if zero_row is not None:
                break
        if zero_row is not None:
            zero_row["prod_tC_yr"] = 0.0
        case("zero-area row carrying a value rejected", zero_row is not None and bool(validate_structure(tampered)))
        tampered = json.loads(json.dumps(base))
        tampered["cellYears"]["cell_0020|2001"]["landCover"].pop(0)
        case("missing class area rejected (no silent zero)", bool(validate_structure(tampered)))
        pin = derive_pin(base, serialized(base))
        case("pin registers bundle file digest", pin["bundleFileSha256"] == sha256_bytes(serialized(base).encode("utf-8")))
        case("pin content digest equals bundle digest", pin["bundleContentSha256"] == base["bundleContentSha256"])
        case("pin is deterministic", serialized_pin(pin) == serialized_pin(derive_pin(derive(), serialized(derive()))))

        failed = sum(1 for c in cases if not c["ok"])
        print(json.dumps({"ok": failed == 0, "passed": len(cases) - failed,
                          "total": len(cases), "failed": failed, "checks": cases},
                         ensure_ascii=False))
        return 1 if failed else 0

    try:
        bundle = derive()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1

    text = serialized(bundle)
    pin = derive_pin(bundle, text)
    pin_text = serialized_pin(pin)

    if args.build:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text, encoding="utf-8", newline="\n")
        PIN.write_text(pin_text, encoding="utf-8", newline="\n")
        print(json.dumps({"ok": True, "built": str(OUT.relative_to(ROOT)),
                          "bytes": OUT.stat().st_size,
                          "bundleSha256": sha256_bytes(OUT.read_bytes()),
                          "contentSha256": bundle["bundleContentSha256"],
                          "pin": str(PIN.relative_to(ROOT)),
                          "pinSha256": sha256_bytes(PIN.read_bytes())},
                         ensure_ascii=False))
        return 0


    errors = []
    if not OUT.is_file():
        print(json.dumps({"ok": False, "error": "bundle missing; run --build"}, ensure_ascii=False))
        return 1
    on_disk_text = OUT.read_text(encoding="utf-8")
    on_disk = json.loads(on_disk_text)
    errors.extend(validate_structure(on_disk))
    if on_disk_text != text:
        errors.append("on-disk bundle does not re-derive byte-identically from current source artifacts")
    if not PIN.is_file():
        errors.append("pin missing; run --build")
    else:
        pin_on_disk_text = PIN.read_text(encoding="utf-8")
        if pin_on_disk_text != pin_text:
            errors.append("on-disk pin does not re-derive from current bundle")
    print(json.dumps({
        "ok": not errors,
        "checked": 1 if not errors else 0,
        "cellYears": on_disk.get("observedCellYears"),
        "classRows": on_disk.get("observedClassRows"),
        "bundleSha256": sha256_bytes(OUT.read_bytes()),
        "contentSha256": on_disk.get("bundleContentSha256"),
        "pinSha256": sha256_bytes(PIN.read_bytes()) if PIN.is_file() else None,
        "sourceIntegralSha256": on_disk.get("generatedFrom", {}).get("productionIntegral", {}).get("sha256"),
        "errors": errors,
    }, ensure_ascii=False))
    return 1 if errors else 0


def _raises(fn) -> bool:
    try:
        fn()
        return False
    except Exception:
        return True


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    raise SystemExit(main())
