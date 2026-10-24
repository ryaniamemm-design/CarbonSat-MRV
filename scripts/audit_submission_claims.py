


from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys

TOOL = "audit_submission_claims"
VERSION = "1.1.0"


SENT_BREAK = ".。;；!?！？"

COMMA = ",，"

CONTINUATIONS = ("including", "such as", "e.g", "i.e", "namely", "含", "包括", "例如", "即")

CONTRAST = (" but ", " however ", " yet ", " whereas ", " 但", " 然而 ", " 不过")

NEG_RE = re.compile(
    r"(?:\bnot\b|\bno\b|\bnever\b|\bcannot\b|\bcan't\b|\bwithout\b|\bnone\b"
    r"|不(?!仅)|\b未\b|未|非(?!常)|无|禁止|绝不|不得|不算|不构成|不是|不足以|尚未)",
    re.IGNORECASE,
)


RULES = [

    dict(id="CHAIN-FULL-BUNDLE", sev="BLOCK",
         pat=r"(?:merk\w*\s*root|whole bundle|full bundle|entire bundle|整包|全量证据)[^。.\n]{0,90}"
             r"(?:registered|anchored|on[- ]?chain|上链|已存证|已登记)",
         why="链上只有 1 条记录的 3 项元数据；整包/Merkle 根未上链"),
    dict(id="CHAIN-FULL-BUNDLE-REV", sev="BLOCK",
         pat=r"(?:registered|anchored|on[- ]?chain|上链)[^。.\n]{0,90}"
             r"(?:merk\w*\s*root|whole bundle|full bundle|entire bundle|整包)",
         why="同上，语序相反"),
    dict(id="CHAIN-AUTHORSHIP", sev="BLOCK",
         pat=r"(?:authorship|团队名册|作者权|版权)[^。.\n]{0,80}(?:on[- ]?chain|registered|上链|已登记)",
         why="不新增公共交易；作者权/版权未上链"),
    dict(id="CHAIN-DEPLOYED", sev="BLOCK",
         pat=r"(?:已部署|成功部署|deployed)\s*(?:to|到)?\s*(?:the\s*)?(?:sepolia|testnet|mainnet|测试网)",
         why="不再部署；只承认 1 条历史登记"),
    dict(id="CHAIN-FAKE-HASH", sev="BLOCK",
         pat=r"0x[0-9a-fA-F]{2,}\s*(?:\.{2,3}|…|\u2026)\s*[0-9a-fA-F]{2,}",
         why="双边截断哈希（`0x7a3f...e291`）＝占位或伪造；对外文稿一律写全值"),
    dict(id="HASH-ELLIPSIS", sev="BLOCK",

         pat=r"\b(?:0x|sha256:)?[0-9a-f]{8,64}\s*(?:…|\u2026|\.\.\.)",
         validate="has_alpha_hex",
         why="任何摘要都写全值；`0xb3cd7107…` / `sha256:xxxxxxxx…` 式省略值无法对外核验"),

    dict(id="CHAIN-SIMULATED-AS-REAL", sev="BLOCK",
         pat=r"(?:on[- ]?chain\s+record|registeredHash|blockchain\s+overlap|链上已有记录)"
             r"[^。.\n]{0,100}(?:blocked|block\b|rejected|拦截|被阻止)",
         why="演示里的重叠检测是模拟的，且真实设计是 flag 不是 block；不得写成已发生的链上事实"),
    dict(id="CHAIN-SIMULATED-AS-REAL-REV", sev="BLOCK",
         pat=r"(?:automatically\s+blocked|自动拦截)[^。.\n]{0,70}"
             r"(?:registration|登记记录|on[- ]?chain|链上)",
         why="同上，语序相反"),


    dict(id="CARBON-CREDIT", sev="BLOCK",
         pat=r"(?:carbon\s+credits?|碳信用|信用量|credit\s+issuance|success\s+fee)",
         why="不产生也不声称碳信用/信用量"),
    dict(id="CARBON-SINK-CLAIM", sev="BLOCK",
         pat=r"(?:net\s+carbon\s+sink|carbon\s+sink\s+(?:increase|gain|potential\s+of)|碳汇量|碳增汇|固碳量)",
         why="NPP 是模型值，不等于碳汇"),
    dict(id="CARBON-TCO2E", sev="BLOCK",
         pat=r"(?:tCO2e|tCO₂e|CO2e)",
         why="本项目不折算 CO2e（除归因门禁内部显式 ×44/12）"),
    dict(id="PROJECT-BOUNDARY", sev="BLOCK",
         pat=r"(?:34\s*(?:cells|格)|footprint\s+cells?)[^。.\n]{0,40}"
             r"(?:project\s+boundary|项目边界|小班边界)",
         why="34 格是分析窗口/离散足迹集，不是项目边界"),
    dict(id="PROJECT-BOUNDARY-REV", sev="BLOCK",
         pat=r"(?:project\s+boundary|项目边界|小班边界)[^。.\n]{0,40}(?:34\s*(?:cells|格))",
         why="同上，语序相反"),


    dict(id="AI-ACCURACY", sev="BLOCK",
         pat=r"(?:accuracy|precision|recall|\bF1\b|detection\s+rate|检出率|准确率|精度)",
         why="无真实标签，不报任何 P/R/F1/检出率/精度（含裸用 accuracy 一词）"),
    dict(id="AI-LABEL", sev="BLOCK",
         pat=r"\bAI\b[^。.\n]{0,30}(?:generated|report|analysis|assisted|powered|evidence)",
         why="Template-generated summaries must be described as rule-derived or template-generated."),
    dict(id="FIELD-VALIDATED", sev="BLOCK",
         pat=r"(?:field[-\s]?validated|cross[-\s]?validated|ground[-\s]?truth|实测精度|地面验证|样地验证)",
         why="没有地面样地数据，也没有做过交叉验证"),


    dict(id="ENDORSEMENT", sev="BLOCK",
         pat=r"(?:pilot|试点|LOI|MOU|letter\s+of\s+intent|意向)(?:[^。\n]|\n(?!\n)){0,60}"
             r"(?:has\s+expressed|expressed\s+(?:\w+\s+)?interest|已表达|签署|signed|partner)",
         why="无书面记录不得声称第三方合作意向/试点/签约"),


    dict(id="ENDORSEMENT-INTEREST", sev="BLOCK",
         pat=r"(?:\b(?:has|have|had)\s+expressed\s+(?:\w+\s+){0,3}interest"
             r"|已表达[^。]{0,10}意向|表达了?[^。]{0,6}合作意向)",
         why="无书面记录不得声称第三方已表达合作/试点意向"),
    dict(id="ENDORSEMENT-REV", sev="BLOCK",
         pat=r"(?:has\s+expressed|expressed\s+(?:\w+\s+)?interest|signed\s+(?:a\s+)?(?:letter|LOI)|"
             r"已表达|已签署|已达成)(?:[^。\n]|\n(?!\n)){0,60}"
             r"(?:pilot|试点|LOI|MOU|letter\s+of\s+intent|意向|partner)",
         why="同上，语序相反（自然英文常把 pilot 放在句尾/下一行）"),

    dict(id="TRACK-WRONG", sev="BLOCK",
         pat=r"Track\s*1\b|碳市场与排放透明",
         why="本项目参赛赛道为 Track 4 — Climate Data & Environmental Monitoring"),


    dict(id="REQ-SCOPE", sev="BLOCK", required=True,
         pat=r"(?:not\s+claimed|what\s+is\s+not|does\s+not\s+claim|不作声称|不声称|不主张|"
             r"not\s+a\s+carbon|no\s+field\s+validation|no\s+usability)",
         why="对外文稿必须有明确的「不声称」清单"),
    dict(id="REQ-ONCHAIN-SCOPE", sev="BLOCK", required=True,
         pat=r"(?:one\s+(?:historical\s+)?(?:descriptive\s+)?record|single\s+record|1\s*条|一条记录)",
         why="对外文稿必须写明链上只有 1 条记录"),
    dict(id="REQ-UPSTREAM-SCOPE", sev="WARN", required=True,
         pat=r"(?:9\s*(?:of|/)\s*840|9\s*个\s*对象年)",
         why="提到上游复现时必须带 9/840 口径"),
]


ALLOWED_ADDRESSES = {
    "0x248efe2e5579613d47e9abe743d7528fbece3c88",
}


def _has_alpha_hex(s: str) -> bool:

    return bool(re.search(r"[a-f]", s, re.IGNORECASE))


VALIDATORS = {"has_alpha_hex": _has_alpha_hex}


def _compile(rules):
    out = []
    for r in rules:
        try:
            out.append((r, re.compile(r["pat"], re.IGNORECASE)))
        except re.error as e:
            print(f"[FATAL] 规则 {r['id']} 正则无法编译：{e}", file=sys.stderr)
            sys.exit(1)
    return out


def _clause_head(lines: list[str], i: int, start: int) -> str:

    head = lines[i][:start]
    if start < 40 and i:
        prev = lines[i - 1].rstrip()

        if prev and prev[-1] not in SENT_BREAK:
            head = prev + " " + head


    idx = max(head.rfind(c) for c in SENT_BREAK)
    head = head[idx + 1:]


    while True:
        j = max(head.rfind(c) for c in COMMA)
        if j < 0:
            break
        tail = head[j + 1:].strip().lower()
        if tail.startswith(CONTINUATIONS):
            head = head[:j]
            continue
        head = head[j + 1:]
        break


    low = head.lower()
    for w in CONTRAST:
        k = low.rfind(w)
        if k >= 0:
            head = head[k + len(w):]
            low = head.lower()

    return head[-70:]


def _negated(text: str) -> bool:
    return bool(NEG_RE.search(text))


def scan_text(text: str, path: str, compiled) -> list[dict]:
    lines = text.splitlines()
    hits: list[dict] = []

    for rule, rx in compiled:
        if rule.get("required"):
            continue
        validate = VALIDATORS.get(rule.get("validate", ""), None)
        for i, line in enumerate(lines):
            for m in rx.finditer(line):
                if validate and not validate(m.group(0)):
                    continue


                scope = _clause_head(lines, i, m.start()) + m.group(0)
                if _negated(scope):
                    continue
                hits.append(dict(
                    rule=rule["id"], severity=rule["sev"], file=path, line=i + 1,
                    excerpt=m.group(0)[:120], why=rule["why"],
                ))


    allowed = {a.lower() for a in ALLOWED_ADDRESSES}
    for i, line in enumerate(lines):
        for m in re.finditer(r"0x[0-9a-fA-F]{40}\b", line):
            addr = m.group(0)
            if addr.lower() not in allowed:
                hits.append(dict(
                    rule="CHAIN-UNKNOWN-ADDRESS", severity="BLOCK", file=path, line=i + 1,
                    excerpt=addr, why="出现未在册的合约地址（本包只有 EvidenceAnchor 一个）",
                ))

    return hits


def check_required(unit_text: str, label: str, compiled) -> list[dict]:

    out = []
    for rule, rx in compiled:
        if not rule.get("required"):
            continue
        if not rx.search(unit_text):
            out.append(dict(
                rule=rule["id"], severity=rule["sev"], file=label, line=0,
                excerpt="(缺失)", why=rule["why"] + " —— 该扫描单元内未检出",
            ))
    return out


def default_targets() -> list[str]:

    for cand in ("release/overlay/README.md", "README.md", "submission"):
        if os.path.exists(cand):
            return [cand]
    return ["submission"]

PROSE_EXT = (".md", ".markdown", ".txt")


def collect_units(paths: list[str]) -> list[tuple[str, list[str]]]:


    units: list[tuple[str, list[str]]] = []
    loose: list[str] = []
    for p in paths:
        if os.path.isdir(p):
            files: list[str] = []
            for root, _dirs, names in os.walk(p):
                for n in sorted(names):
                    if n.lower().endswith(PROSE_EXT):
                        files.append(os.path.join(root, n))
            units.append((p, files))
        elif os.path.isfile(p):
            loose.append(p)
        else:
            loose.append(p)
    if loose:
        units.append((" + ".join(os.path.basename(x) for x in loose), loose))
    return units


PROBES: dict[str, dict[str, list[str]]] = {
    "CHAIN-FULL-BUNDLE": {
        "bad": ["The Merkle root of the whole bundle is anchored on-chain."],
        "good": ["The bundle stays off-chain; one record is anchored."],
    },
    "CHAIN-FULL-BUNDLE-REV": {
        "bad": ["Anchored on-chain: the entire bundle digest was registered in 2025."],
        "good": ["Only one record is anchored. The bundle is not on-chain."],
    },
    "CHAIN-AUTHORSHIP": {
        "bad": ["The authorship of this repository is registered on-chain."],
        "good": ["Authorship is not registered on-chain and no new transaction is sent."],
    },
    "CHAIN-DEPLOYED": {
        "bad": ["The contract was deployed to Sepolia in September."],
        "good": ["The contract was deployed in September 2025 and no further deployment is planned."],
    },
    "CHAIN-FAKE-HASH": {
        "bad": ["The demo shows `0x7a3f...e291` as an existing registration."],
        "good": ["packHash `0xb3cd7107866918846f3a99f04350c037f046ae7864e7c045f8b0108c2cc75402` is anchored."],
    },
    "HASH-ELLIPSIS": {
        "bad": ["The bundle digest `sha256:d2c2300e…` is reproducible.",
                "The record hash is `0xb3cd7107…` in the summary table."],
        "good": ["The bundle digest `sha256:d2c2300efc57411307b1d156df49ae027838adb3451fb1fd490147d0399f2014` is reproducible."],
    },
    "CHAIN-SIMULATED-AS-REAL": {
        "bad": ["The on-chain record shows Project Alpha and blockchain overlap detection blocked the registration."],
        "good": ["The overlap screen is simulated: it flags a registration, it does not block it."],
    },
    "CHAIN-SIMULATED-AS-REAL-REV": {
        "bad": ["It was automatically blocked because of the on-chain record."],
        "good": ["Nothing is automatically blocked; the screen only flags the entry."],
    },
    "CARBON-CREDIT": {
        "bad": ["We can issue carbon credits against the measured NPP."],
        "good": ["We do not issue carbon credits, and no credit is implied."],
    },
    "CARBON-SINK-CLAIM": {
        "bad": ["This quantifies the carbon sink increase of the study area."],
        "good": ["NPP is not a carbon sink and no sink increase is claimed."],
    },
    "CARBON-TCO2E": {
        "bad": ["The result is 12,345 tCO2e per year."],
        "good": ["We do not convert the result to tCO2e."],
    },
    "PROJECT-BOUNDARY": {
        "bad": ["The 34 cells define the project boundary."],
        "good": ["The 34 cells are not a project boundary; they are a monitoring footprint."],
    },
    "PROJECT-BOUNDARY-REV": {
        "bad": ["The project boundary is exactly the 34 cells."],
        "good": ["No project boundary is asserted, and the 34 cells are a footprint set."],
    },
    "AI-ACCURACY": {
        "bad": ["Detection rate: 5.0% across 816 cell-years."],
        "good": ["We publish no accuracy figure because there is no labelled reference."],
    },
    "AI-LABEL": {
        "bad": ["The AI-generated evidence report is attached."],
        "good": ["The summary is template-generated, not AI-generated."],
    },
    "FIELD-VALIDATED": {
        "bad": ["Field-validated accuracy of 0.87 was achieved on 23 ground-truth plots."],
        "good": ["No field validation was performed and no ground-truth plots exist."],
    },
    "ENDORSEMENT": {
        "bad": ["Our pilot partner has expressed interest in 2027."],
        "good": ["No pilot is agreed and no partner has expressed interest in writing."],
    },
    "ENDORSEMENT-REV": {
        "bad": ["The CAF research group has expressed preliminary interest in a 2027 pilot."],
        "good": ["No third party has expressed interest, and there is no pilot."],
    },
    "ENDORSEMENT-INTEREST": {
        "bad": ["A research team at the Chinese Academy of Forestry has expressed preliminary interest"],
        "good": ["No third party has expressed interest in writing."],
    },
    "TRACK-WRONG": {
        "bad": ["Submitted to Track 1 — carbon markets and emissions transparency."],
        "good": ["Submitted to Track 4 — Climate Data & Environmental Monitoring."],
    },
    "CHAIN-UNKNOWN-ADDRESS": {
        "bad": ["Contract 0x1111111111111111111111111111111111111111 is used."],
        "good": ["Contract 0x248EFE2E5579613d47e9Abe743d7528fBECE3c88 is used."],
    },
}


REQUIRED_PROBE = dict(
    complete=(
        "## What is not claimed\n"
        "We make no claim beyond these numbers. Exactly one historical descriptive record is\n"
        "anchored; the remaining 831 object-years were not re-run (9 of 840 checked).\n"
    ),
    empty="We did some analysis of the data.\n",
)


def run_self_test(compiled, json_out: str | None = None) -> int:
    rule_ids = [r["id"] for r in RULES if r["sev"] == "BLOCK" and not r.get("required")]
    rule_ids.append("CHAIN-UNKNOWN-ADDRESS")

    probes = []
    failures = []
    for rid in rule_ids:
        if rid not in PROBES:
            probes.append(dict(rule=rid, ok=False, note="缺少探针"))
            failures.append(f"{rid}: 未提供探针")
            continue


        bad_rows = []
        for idx, s in enumerate(PROBES[rid]["bad"]):
            got = [h for h in scan_text(s, "probe:bad", compiled) if h["rule"] == rid]
            bad_rows.append(dict(index=idx, ok=bool(got), actual=[h["rule"] for h in got]))
            if not got:
                failures.append(f"{rid}: 坏句 #{idx} 未命中（死规则/漏检）")
        good_rows = []
        for idx, s in enumerate(PROBES[rid]["good"]):
            got = scan_text(s, "probe:good", compiled)
            good_rows.append(dict(index=idx, ok=not got,
                                  actual=[h["rule"] for h in got]))
            if got:
                failures.append(f"{rid}: 好句 #{idx} 被误报 {sorted({h['rule'] for h in got})}")
        ok = all(r["ok"] for r in bad_rows) and all(r["ok"] for r in good_rows)
        probes.append(dict(rule=rid, ok=ok, bad=bad_rows, good=good_rows))

    print(f"规则探针（{len(rule_ids)} 条 BLOCK 规则；坏句逐条断言、好句逐条断言）")
    for p in probes:
        mark = "OK  " if p["ok"] else "FAIL"
        nb = f"{sum(r['ok'] for r in p['bad'])}/{len(p['bad'])}" if "bad" in p else "-"
        ng = f"{sum(r['ok'] for r in p['good'])}/{len(p['good'])}" if "good" in p else "-"
        detail = ""
        if not p["ok"] and "bad" in p:
            detail = "  " + "; ".join(
                f"bad#{r['index']}->{r['actual']}" for r in p["bad"] if not r["ok"]
            ) + " ".join(f"good#{r['index']}->{r['actual']}" for r in p["good"] if not r["ok"])
        print(f"  [{mark}] {p['rule']:<26} bad {nb}  good {ng}{detail}")


    req_missing = check_required(REQUIRED_PROBE["empty"], "probe:empty", compiled)
    req_ok = check_required(REQUIRED_PROBE["complete"], "probe:complete", compiled)
    req_bad = [h for h in req_missing if h["severity"] == "BLOCK"]
    if not req_bad:
        failures.append("必备段落: 缺项未判失败")
    if req_ok:
        failures.append(f"必备段落: 齐备样本被误报 {[h['rule'] for h in req_ok]}")
    print(f"  [{'OK  ' if req_bad and not req_ok else 'FAIL'}] 必备段落 "
          f"(缺项 {len(req_bad)} BLOCK / 齐备 {len(req_ok)} 误报)")


    sample = os.environ.get("SUBMISSION_EN_README") or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "fixtures",
        "negative_example_SYNTHETIC.md")
    ca = dict(path=sample, blocks=0, rules=[], ok=False)
    if not os.path.isfile(sample):
        print(f"[SELFTEST-FAIL] 找不到反例样本：{sample}", file=sys.stderr)
        failures.append("反例样本缺失")
    else:
        with open(sample, encoding="utf-8") as f:
            text = f.read()
        hits = scan_text(text, sample, compiled)
        blocks = [h for h in hits if h["severity"] == "BLOCK"]
        ids = sorted({h["rule"] for h in blocks})

        need = {"CHAIN-FULL-BUNDLE", "AI-ACCURACY", "FIELD-VALIDATED", "ENDORSEMENT-INTEREST"}
        missing = need - set(ids)
        ca.update(blocks=len(blocks), rules=ids, ok=not missing,
                  missing=sorted(missing))
        print(f"  [{'OK  ' if ca['ok'] else 'FAIL'}] 反例 {os.path.basename(sample)} "
              f"→ BLOCK {len(blocks)} 项，覆盖 {len(ids)} 条规则")
        if missing:
            failures.append(f"反例未抓住：{sorted(missing)}")

    report = dict(tool=TOOL, version=VERSION, probes=probes,
                  required=dict(missing_blocks=len(req_bad), false_positive=len(req_ok)),
                  counterexample=ca, failures=failures,
                  verdict="FAIL" if failures else "PASS")
    if json_out:
        os.makedirs(os.path.dirname(json_out) or ".", exist_ok=True)
        with open(json_out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"报告：{json_out}")

    if failures:
        for f in failures:
            print(f"[SELFTEST-FAIL] {f}", file=sys.stderr)
        return 3
    print(f"[SELFTEST-PASS] 已列测试样本全部通过（{len(rule_ids)} 条规则 / "
          f"反例 BLOCK {ca['blocks']} 项）。这不等于覆盖所有同义表达，最终稿仍需人工逐句复核。")
    return 0


def rule_inventory() -> list[dict]:
    out = []
    for r in RULES:
        out.append(dict(id=r["id"], severity=r["sev"], required=bool(r.get("required")),
                        pattern_sha256=hashlib.sha256(r["pat"].encode()).hexdigest()[:16],
                        why=r["why"]))
    out.append(dict(id="CHAIN-UNKNOWN-ADDRESS", severity="BLOCK", required=False,
                    pattern_sha256="(allowlist)", why="40 位合约地址白名单校验"))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--path", nargs="*", help="要扫的文件/目录（默认 submission）")
    ap.add_argument("--json", help="机读报告输出路径")
    ap.add_argument("--self-test", action="store_true", help="反例 + 规则探针自检")
    ap.add_argument("--list-rules", action="store_true", help="打印规则清单")
    args = ap.parse_args()

    compiled = _compile(RULES)

    if args.list_rules:
        for r in rule_inventory():
            tag = "required" if r["required"] else "match  "
            print(f"{r['severity']:<6} {tag} {r['id']:<28} {r['pattern_sha256']}")
        print(f"共 {len(RULES)} 条内容规则 + 1 条地址白名单；版本 {VERSION}")
        return 0

    if args.self_test:
        return run_self_test(compiled, args.json)

    units = collect_units(args.path or default_targets())

    all_hits: list[dict] = []
    scanned: list[str] = []
    unit_report: list[dict] = []
    for label, files in units:
        text_parts: list[str] = []
        unit_hits: list[dict] = []
        for f in files:
            try:
                with open(f, encoding="utf-8") as fh:
                    text = fh.read()
            except (OSError, UnicodeDecodeError) as e:
                all_hits.append(dict(rule="UNREADABLE", severity="BLOCK", file=f, line=0,
                                     excerpt=type(e).__name__,
                                     why="无法读取/解码，按失败关闭计违规"))
                continue
            scanned.append(f)
            text_parts.append(text)
            unit_hits.extend(scan_text(text, f, compiled))

        req_hits = check_required("\n".join(text_parts), label, compiled)
        all_hits.extend(unit_hits)
        all_hits.extend(req_hits)
        unit_report.append(dict(unit=label, files=len(text_parts),
                                blocks=sum(1 for h in unit_hits + req_hits
                                           if h["severity"] == "BLOCK")))

    blocks = [h for h in all_hits if h["severity"] == "BLOCK"]
    warns = [h for h in all_hits if h["severity"] == "WARN"]

    print(f"扫描 {len(scanned)} 个文件 / {len(units)} 个单元；"
          f"BLOCK {len(blocks)} / WARN {len(warns)}")
    for h in blocks:
        print(f"  [BLOCK] {h['file']}:{h['line']} · {h['rule']} · {h['excerpt'][:70]}")
        print(f"          → {h['why']}")
    for h in warns:
        print(f"  [WARN ] {h['file']}:{h['line']} · {h['rule']} · {h['excerpt'][:70]}")

    if args.json:
        os.makedirs(os.path.dirname(args.json) or ".", exist_ok=True)
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(dict(tool=TOOL, version=VERSION, units=unit_report,
                           scanned=scanned, blocks=blocks, warns=warns,
                           rules=rule_inventory(),
                           verdict="FAIL" if blocks else "PASS"), fh,
                      ensure_ascii=False, indent=2)
        print(f"报告：{args.json}")

    return 1 if blocks else 0


if __name__ == "__main__":
    sys.exit(main())
