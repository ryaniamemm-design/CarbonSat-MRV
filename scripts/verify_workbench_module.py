


import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "audit/workbench_v1_2026-10-19/MODULE_MANIFEST_S7.json"
VERSION = "CarbonSat-ResearchWorkbench-Publication-S7"
SCOPE = ("Read-only research workbench over existing products; not anchored by the scientific pack "
         "or public chain, and does not define any project boundary. The evidence registry binds "
         "historical conclusions to product identity only and executes no recomputation")
FILES = (
    "web/workbench_core.js",
    "web/workbench.html",
    "web/workbench.css",
    "web/workbench.js",
    "scripts/verify_workbench.js",
    "scripts/verify_workbench_module.py",
    "scripts/browser_workbench_drive.js",
    "scripts/build_workbench_evidence_registry.js",
    "scripts/workbench_shots.js",
    "web/workbench_evidence_registry.json",
    "test/workbench.test.js",
    "docs/WORKBENCH_V1.md",
    "web/ui_en.js",
    "web/changes.html",
    "web/changes.css",
    "web/changes.js",
    "docs/CHANGE_LEDGER_V1.md",
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(data) -> list:
    errors = []
    if not isinstance(data, dict) or set(data) != {"moduleVersion", "generatedAtUTC", "scope", "files"}:
        return ["root keys invalid"]
    if data["moduleVersion"] != VERSION or data["scope"] != SCOPE:
        errors.append("version/scope mismatch")
    if not isinstance(data["generatedAtUTC"], str) or not data["generatedAtUTC"]:
        errors.append("missing timestamp")
    if not isinstance(data["files"], list):
        return errors + ["files not array"]
    paths = []
    for row in data["files"]:
        if not isinstance(row, dict) or set(row) != {"path", "bytes", "sha256"}:
            errors.append("file entry keys invalid")
            continue
        if not isinstance(row["path"], str) or row["path"] not in FILES:
            errors.append("unauthorized path")
        else:
            paths.append(row["path"])
        if not isinstance(row["bytes"], int) or isinstance(row["bytes"], bool) or row["bytes"] < 0:
            errors.append("invalid byte count")
        if not isinstance(row["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", row["sha256"]):
            errors.append("invalid SHA256")
    if len(data["files"]) != len(FILES) or len(set(paths)) != len(paths) or set(paths) != set(FILES):
        errors.append(f"path set must cover exactly all {len(FILES)} files")
    return errors


def generated() -> dict:
    return {"moduleVersion": VERSION, "generatedAtUTC": datetime.now(timezone.utc).isoformat(),
            "scope": SCOPE,
            "files": [{"path": p, "bytes": (ROOT / p).stat().st_size, "sha256": sha(ROOT / p)} for p in FILES]}


def selftest() -> int:
    original = generated()
    cases = []

    def case(name, change=None, expected=False, replace=False):
        x = json.loads(json.dumps(original))
        if change:
            result = change(x)
            if replace:
                x = result
        ok = (not validate(x)) == expected
        cases.append({"name": name, "ok": ok})

    case("valid exact manifest", expected=True)
    case("empty files", lambda x: x.update(files=[]))
    case("one missing", lambda x: x["files"].pop())
    case("extra file", lambda x: x["files"].append({"path": "extra", "bytes": 1, "sha256": "a" * 64}))
    case("duplicate path", lambda x: x["files"].__setitem__(1, x["files"][0].copy()))
    case("missing sha", lambda x: x["files"][0].pop("sha256"))
    case("uppercase sha", lambda x: x["files"][0].update(sha256="A" * 64))
    case("wrong version", lambda x: x.update(moduleVersion="CarbonSat-ResearchWorkbench-v1.3"))
    case("previous v1.1 manifest rejected", lambda x: x.update(moduleVersion="CarbonSat-ResearchWorkbench-v1.1"))
    case("v1.0 version string rejected", lambda x: x.update(moduleVersion="CarbonSat-ResearchWorkbench-v1.0"))
    case("v0.9 version string rejected", lambda x: x.update(moduleVersion="CarbonSat-ResearchWorkbench-v0.9"))
    case("claim on chain", lambda x: x.update(scope="publicly anchored"))
    case("claim to define a project boundary", lambda x: x.update(scope="defines the project boundary"))
    case("path traversal", lambda x: x["files"][0].update(path="../private"))
    case("invalid root", lambda x: [], replace=True)
    case("missing files", lambda x: x.pop("files"))
    case("false bytes", lambda x: x["files"][0].update(bytes=False))
    case("swapped for frozen source", lambda x: x["files"][0].update(path="web/e2e_core.js"))
    case("scientific bundle smuggled in", lambda x: x["files"][0].update(path="web/npp_estimate_bundle.json"))
    case("contract doc dropped", lambda x: x.update(files=[r for r in x["files"] if r["path"] != "docs/WORKBENCH_V1.md"]))
    case("adapter renamed to a boundary-sounding file", lambda x: [r.update(path="web/project_boundary.js") for r in x["files"] if r["path"] == "web/workbench_core.js"])
    case("empty path", lambda x: x["files"][0].update(path=""))
    case("files not array", lambda x: x.update(files={}))
    case("independent verifier dropped", lambda x: x.update(files=[r for r in x["files"] if r["path"] != "scripts/verify_workbench.js"]))
    case("evidence registry dropped", lambda x: x.update(files=[r for r in x["files"] if r["path"] != "web/workbench_evidence_registry.json"]))
    case("evidence registry swapped for the scientific bundle", lambda x: [r.update(path="web/npp_estimate_bundle.json") for r in x["files"] if r["path"] == "web/workbench_evidence_registry.json"])
    case("registry builder dropped", lambda x: x.update(files=[r for r in x["files"] if r["path"] != "scripts/build_workbench_evidence_registry.js"]))
    failed = sum(not x["ok"] for x in cases)
    print(json.dumps({"ok": failed == 0, "passed": len(cases) - failed, "total": len(cases),
                      "failed": failed, "checks": cases}, ensure_ascii=False))
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--freeze", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()
    try:
        if args.selftest:
            return selftest()
        if args.freeze:
            data = generated()
            if validate(data):
                raise ValueError("generated manifest invalid")
            MANIFEST.parent.mkdir(parents=True, exist_ok=True)
            with MANIFEST.open("x", encoding="utf-8", newline="\n") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                f.write("\n")
            print(json.dumps({"ok": True, "files": len(FILES), "manifestSha256": sha(MANIFEST)}))
            return 0
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
        errors = validate(data)
        if not errors:
            for row in data["files"]:
                p = ROOT / row["path"]
                if not p.is_file() or p.stat().st_size != row["bytes"] or sha(p) != row["sha256"]:
                    errors.append(row["path"] + ": missing/drift")
        print(json.dumps({"ok": not errors, "checked": len(FILES) if not errors else 0, "errors": errors},
                         ensure_ascii=False))
        return 1 if errors else 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
