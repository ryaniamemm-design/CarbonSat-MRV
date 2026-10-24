# 恩格贝独立研究案例 · 验收说明（R40，2026-10-16）

验收标识：`CarbonSat-EngebeiCase-Acceptance-2026-10-16-v1.0`
模块：**CarbonSat-EngebeiResearchCaseModule-v1.0**（清单 `MODULE_MANIFEST_v1.0.json` = `bf4831537412d5a6fdccc3e5017b2f34074c39b8b29136ef0a5b562b9f9d4688`，18 文件）
契约：`docs/ENGEBEI_RESEARCH_CASE_V1.md`（v1.0）· 交付简报：`BRIEF.md`（8 问）

> **全部数字为本机实跑**（`exit code` 与输出均如实记录），**不沿用旧日志的版本号或测试计数**。

## 1. 本轮实测（逐项）

| 检查 | 命令 | 结果 |
|---|---|---|
| 数据流离线自检 | `python scripts/engebei_npp_integral.py --selftest` | **35/35 通过**，exit **0** |
| 独立复算 + 反例 | `node scripts/verify_engebei_case.js` | **29/29 通过**，exit **0** |
| 模块清单核验 | `python scripts/verify_engebei_module.py --verify` | **18/18 ok**，exit **0** |
| 模块清单自检 | `python scripts/verify_engebei_module.py --selftest` | **26/26 通过**，exit **0** |
| 页面回归 | `node …/hardhat … test test/engebei_case.test.js` | **23 passing**，exit **0** |
| 真实浏览器（本机 Edge） | `node scripts/browser_engebei_drive.js` | **60/60 PASS**，exit **0**，10 张截图，外部请求 **0**，钱包 **0** |
| 默认离线门禁（全仓） | `powershell -File scripts\run_all_gates.ps1` | **35/35 PASS**，`WithChain=False`，失败项 `[]` |
| 全量 Hardhat | `node …/hardhat test` | **267 passing**，exit **0** |
| 冻结六源 | `freeze_web_verify.py --verify` | **6/6 一致** |
| 四个模块清单 | 各自 `--verify` | 台账 **7/7** · 单地块 **12/12** · 估算 **19/19** · 恩格贝 **18/18** |

## 2. 交付状态（三种状态显式区分）

**`COMPLETE`（完整案例）**：24/24 年**全部取得且计算成功**；窗口覆盖状态逐条明确；单位链与范围绑定复算通过。
**但 `COMPLETE` 只描述"取数与计算完成"**，不等于整窗被有效产品值覆盖 —— **24 年全部为 `PARTIAL_COVERAGE`**。

## 3. 版本与清单

| 模块 | 版本 | 清单 SHA256 | `--verify` |
|---|---|---|---|
| 恩格贝研究案例（新） | `CarbonSat-EngebeiResearchCaseModule-v1.0` | `bf4831537412d5a6fdccc3e5017b2f34074c39b8b29136ef0a5b562b9f9d4688` | 18/18 |
| 单地块证据登记 | `…-v1.10` → **`…-v1.11`** | `34bef58f49aea33781e8671703526388a1064b71239261395bc7c6489bcfe275` | 12/12 |
| 估算模块 | `…-v1.5` → **`…-v1.6`** | `2b432223e5010fe06fd4935f038b983fdf53c44debffc244b6a5651d0129c4df` | 19/19 |
| 变化台账 | `…-v1.2`（**不变**） | `ac2e1bbdc4986ec8…`（未动） | 7/7 |

旧清单与旧验收原文全部保留（`ACCEPTANCE_v1.7…v1.10.md`、`archive_v1.1…archive_v1.5/`）。
**两次"定稿前生成→判 drift→定稿后重签"** 已如实记录（三模块版本此前均未验收/未公布，故未新开版本号）。

## 4. 保护件（本轮前后逐项核对，均未变）

科研 CSV `065d5d8f…` · A2 `b80ca8ec…` · 既有 bundle `090ef7a9…` / pin `79004d48…` · `web/records.json` `8d029815…` ·
`web/current_pack.json` `e6d1e6e8…` · 冻结六源 6/6 · D3 ZIP `7072b41d…` / 凭条 `ac50534d…` · `audit/one_record_anchor/*`。
**不变量**：9 主张（逐条 `registrable=false`）/ **0 REMOVAL** / `insufficient_evidence` / **816 − 9 UNLINKED**。
**0 新增公共交易**、未读私钥、未跑 GEE 之外的新训练/新模型；**未做 D4、未刷新历史链上报告与截图**。

## 5. 契约要求逐条对照

| 契约要求 | 落点 |
|---|---|
| A1 四种对象分开、不相互反推（A1） | `WINDOW_DECISION.md` §1；页面面板 1；`entries` 卡片；bundle `window.statute` |
| A2 按证据可得性选范围 + 六项复核（A2） | `WINDOW_DECISION.md` §2；`engebei_window_spec.json`；`verify_engebei_case.js` A7 与 selftest |
| A3 来源登记（标题/作者/日期/DOI/访问日期/取得程度/实际用途/能支持与不能支持） | `SOURCES.json`（含 3 项 `unresolved`） |
| B1 独立目录/caseId/产物，不得改名/复制/自动链接/进旧包 | 独立 `data/engebei/**`、`caseId=engebei_paper_window_v1`；bundle `boundary.claimsLinked=false`/`evidenceRecordsLinked=false` |
| B2 产品/单位/掩膜/积分与五项禁止 | 契约 §3；`engebei_npp_integral.py` 常量；反例 5/7/14 |
| B3 先小样本再全量 + 可补缺失 + 有限重试 + 失败留档不补造 | `--probe` → `--run`（可续跑、按年落盘）；`engebei_fetch_log.json` |
| B4 必要字段 + 三件事分开 + 名称反映范围 | CSV 23 列；`computeStatus`/`validCoverageStatus`；面板 2/5 与反例 14 |
| C1 入口区分两案例、不混总和 | `web/entry.html#engebeiCaseEntry`；浏览器检查组 11 |
| C2 首屏五问 | 浏览器检查组 1（逐问断言） |
| C3 年份选择/年度表/序列图/面积与覆盖/来源摘要/下载核验 + 分段限制 + 指标一致 | 面板 3–6；浏览器检查组 2–4 |
| C4 比较边界（不排名/不比增汇） | 契约 §7；面板 1 与 `BRIEF.md`；卡片"不能回答什么" |
| C5 状态管理（失效/不部分采用/写明保留哪一份） | `engebei.js#adopt/rejectImport/clearDerived`；浏览器检查组 8–9 |
| D 独立清单与导出、四层来源、稳定摘要不含时间戳、失败关闭 | `MODULE_MANIFEST_v1.0.json`；`buildExport`/`verifyExport`；反例 8/10/13 |
| E 14 项反例 + 独立单位/算术复算 + 范围面积独立核对 + 抽样交叉核算 + 真实浏览器下载与重导入 + 失败提示可见 + 原模块回归与保护件核对 | `COUNTEREXAMPLES.md`、`INDEPENDENT_RECOMPUTE.md`、`BROWSER_VERIFICATION.md`、门禁 35/35 |
| F 独立版本化 + 共享文件按实际影响升版 + 定稿后签清单 + 更新根指针 + 不做 D4 + 试用材料另存仍标未执行 | §3 上表；根 `CURRENT_STATE.md`；`audit/usability_trial_2026-10-16/TASK_CARD_v1.1.md`/`RECORD_SHEET_v1.1.md` |

## 6. 未完成清单（明确写出，不掩盖）

1. **论文全文未取得**（付费墙）⇒ 研究范围坐标取自 2026-10-13 的登记值，**标"待核"**；DOI 已解析确认标题/作者/期刊/IEEE 文档号，但**未做全文核查**。
2. **正式项目 / 治理小班矢量未取得** ⇒ 不做项目级资格判断、治理归因、信用核算；**不得**把本窗口当项目边界。
3. **论文自报 ≈200 km² 与本窗外接矩形 ≈218.88 km² 口径不同**（差 9.4%）⇒ 差异保留、待核，**未**自行纠正。
4. **模型精度 / 足迹同一性 / GEE 原始来源真实性 / 治理因果**：**一律未验证**。
5. **案例间排名与比较未做**（不同范围面积不同，总量不可比）。
6. **AGB、碳信用、跨区域排名、AI 训练**：本轮**未扩建**（按授权范围）。
7. **真实参与者可用性试用：未执行**（未招募、未采集、**未由模型代演**）；材料另存 v1.1 且仍标未执行。
8. **门禁墙钟上限**由 120 s 调整为 300 s（本机台账回归实测需 ~145 s）—— **判定口径未变**，已记入脚本表头与 `WORK_LOG.md` §7。
9. 本轮**未重跑** `-WithChain`（会刷新历史链上报告）；**未做 D4**、未刷新历史报告与截图。
