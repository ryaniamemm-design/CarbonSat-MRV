# 估算模块验收记录（P0 已有 NPP 估算结果入口 · P1 独立 AGB 碳储量情景试算）

验收标识：CarbonSat-Estimation-Acceptance-2026-10-13-v1.1。
模块版本：**CarbonSat-EstimationModules-v1.1**（初版 v1.0 清单保留）。契约先行，再实现，独立验证后留档。
范围：`docs/research/WORKBUDDY_ESTIMATION_UPGRADE_PLAN_2026-10-13.md` 定义的 P0 与 P1。

## 1. 新增了什么决策能力

| 模块 | 以前做不到的事 | 现在能做的判断 |
|---|---|---|
| **P0 已有 NPP 估算结果入口** | 只能直接读 `data/npp_annual_production_integral.csv` 与 A2 JSON 源码，无法判断"这个数能不能用" | 按**格 / 年 / 地类**把既有 MOD17 模型 NPP 产量摊开；**现场从产物重算来源哈希**；某年若缺任一格年 ⇒ 该年合计**置空**并列出缺哪格（失败关闭，绝不用剩余格求和冒充）；地类无有效足迹显示"无有效产品值"（不是真零） |
| **P1 独立 AGB 碳储量情景试算 v0.1** | 无法把"面积 × 生物量密度 × 含碳率"变成一个可追溯、可核验、会随输入失效的情景 | 在**明确假设**下算出 AGB 单一碳库情景（tC）；逐参数标注**来源等级**（实测/文献/用户假设）与**适用性**；缺参数只输出**补资料任务**、不编数值；改动任一参数**立即作废旧核验结论**；候选是**情景范围**而不是置信区间；包可下载、导入、由独立 CLI 重算 |

两个模块**互相独立**，也都与 816 条 NPP 记录、9 条碳主张**不自动链接**；**不存在** "NPP 累加得到库存" 或 "占位 FVC 系数推算库存" 的代码路径（由 `forbiddenScan` + 反例测试断言）。

## 2. 最小验收 9 项 · 承诺 → 实现 → 证据

| # | 承诺 | 实现位置 | 实测证据 |
|---|---|---|---|
| 1 | 单位换算正确 | `agb_core.js#normalizeB`（kgDM/m² → ×10 转 tDM/ha）、`normalizeFC`；P0 侧 `kgToT`/`m2ToHa` | `agb_independent_check.py` 手算向量 V3（1.0 ha × 0.48 kgDM/m² × 0.47 = 2.256 tC）与 Node 核心**逐例一致**；32/32 |
| 2 | 非法值被拒 | `validateRecord`（负数/非有限/未知单位/非法面积来源） | 独立实现 8 组非法向量 + 包自检 30/30 中 `非法碳分数被拒`、`非有限面积被拒` |
| 3 | 防混用（生产力冒充库存密度） | 单位白名单 `ALLOWED_B_UNITS=['tDM/ha','kgDM/m2']`；含 `/yr` 的单位直接判非法 | 真实浏览器 `P1 错误单位（生产力冒充库存密度）被拒` **PASS**；`verify_agb_package.js --selftest` 反例 |
| 4 | 重叠/分层面积处理 | `areaInfo`：分层面积未声明"已做覆盖与重叠核查"时**不得求和成全地块** | 包自检与浏览器路径断言；页面显式提示 |
| 5 | 占位/零宽不被提升为齐备 | `placeholderWarnings`（只作**非阻断**提示）、`visibleText()` 去零宽后判空 | 包自检 `SYNTHETIC 记录含占位提示但不提升为真实`；浏览器 SYNTHETIC 路径 PASS |
| 6 | 模板无法产出 REMOVAL / 外推 | 冻结 `BOUNDARY`（`creditIssuance=false`、`netSequestrationClaim=false`、`baselineAssessed=false`、`publiclyAnchored=false`）+ `forbiddenScan`（REMOVAL/CREDIT/GOVERNANCE_INCREMENT/tCO2e） | 构建含禁用词即抛出；`verify_agb_package.js` 30/30；浏览器 `P0 导出不含合计、未上链、无信用量` PASS |
| 7 | 改参数清空旧结果 | 页面 `clearVerdict()` + 重算 | 浏览器 `P1 改参数清空旧核验结论`、`P1 改参数改变情景摘要`、`P1 改参数立即更新结果`（4.8→9.6 tDM/ha ⇒ 28.2→56.4 tC）均 PASS |
| 8 | 共享核心 + **独立第二实现**一致 | Node 核心 `agb_core.js` / `npp_entry_core.js`；Python/独立算术 `agb_independent_check.py` | 独立实现 **32/32 / exit 0**（5 组手算向量 + 8 组非法 + 与 Node 核心逐例对照） |
| 9 | 真实浏览器 4 条路径 | `scripts/browser_estimation_drive.js`（真实 Edge + CDP + 临时回环服务 + 独立 profile） | **44/44 / exit 0**；P0 两条（正常格年 / 缺格年失败关闭）、P1 两条（空白缺参 → 补资料任务 / SYNTHETIC 端到端 + 篡改与错误单位被拒） |

补充断言（同一次浏览器运行）：`无外部服务请求、无公共 RPC`、`真实浏览器控制台错误为零`、`P1 钱包请求为零`、`项目入口包含两个估算模块链接`。

## 3. 实跑结果（以实际退出码为准）

| 检查 | 结果 | 证据 |
|---|---|---|
| NPP 估算清单构建/核验 | `--build` ok；`--verify` `{"ok": true, "cellYears": 816, "classRows": 1523}` / exit 0；`--selftest` **7/7** / exit 0 | `scripts/build_npp_estimate_bundle.py` |
| AGB 情景包自检 | **30/30** / exit 0 | `scripts/verify_agb_package.js --selftest` |
| AGB 独立第二实现 | **32/32** / exit 0 | `scripts/agb_independent_check.py` |
| 两模块 Mocha | **29 passing** / exit 0 | `test/estimation_modules.test.js` |
| 真实 Edge 浏览器 | **44/44** / exit 0 | `browser_result.json`、`browser_runs/<时间>/{result.json,shots/,downloads/}` |
| 估算模块清单 | `--freeze` 新建；`--verify` **18/18** / exit 0；`--selftest` **14/14** / exit 0 | `audit/estimation_upgrade/MODULE_MANIFEST_v1.1.json` |
| 默认离线门禁（全仓） | **26/26 / exit 0（WithChain=False，verdict=PASS）** | `audit/gates/last_run.json`（2026-10-13T19:53:53） |
| 全量 Hardhat | **170 passing** / exit 0 | 本地 Hardhat CLI 实跑 |
| 红线复核 | 冻结六源 6/6；受保护快照 62 条 ok；`verify_evidence.py` **7/7 / exit 0**；`packSha256=9a3f24ea…`、`methodHash=aba68c85…`；源 CSV `065d5d8f…`；保护基线 68 项无漂移 | 同上报告与对应脚本 |

清单 SHA256：**v1.1 = `2e2b75124194beb2177af839ce66929954908148cc23f5f324e7e985e5aeb693`**；v1.0 = `eb0b3e35f7eb0b90ddad31ababd2a5413dc8b14fade987670968cd97fdb6a908`（保留）。
派生产物：`web/npp_estimate_bundle.json`（738 839 B，`bundleSha256=432bab740a4d81b3c40e2f7227a9ffa7dc047115a354608cba8dc2de3244eaf5`，来源 `sourceIntegralSha256=065d5d8f…`）。

## 4. 哪些结果"有资料支持"，哪些是"假设"

**有资料支持（可由本仓库产物重算）**
- 816 个格年的 MOD17 模型年度 NPP 碳生产量，以及 1 523 行地类 × 有效足迹分解 —— 来源是本地 CSV 与 A2 JSON，哈希可现场重算并与冻结值对上（`065d5d8f…`）。
- 34 个离散采样格在某年**是否完整**（完整才给合计；2001 年 82 018 … 2024 年 147 850 tC/yr，**仅描述性**）。
- 2012 年作为**传感器世代断点**的标注位置 —— 只是标注，**成因未解决**。

**属于假设 / 用户输入（不是本仓库的实测）**
- P1 的**面积、生物量密度（B）、含碳率（f_C）**：本仓库**没有任何真实地块参数**。因此页面上那个 `28.2 tC`（12.5 ha × 4.8 tDM/ha × 0.47）**只是软件流程自检向量**（标签 `SYNTHETIC`），**不是任何真实地块的碳储量**，也不对应库布其。
- 参数"来源等级"由用户声明（实测 / 文献 / 用户假设）；系统**不鉴定**该声明是否属实。
- 敏感性表是**情景范围**（低/参考/高参数组合），**不是**置信区间、不是误差分布，未做 Monte Carlo。

**明确排除的算法（红线）**
- 不把 NPP 累加、NPP×碳分数、FVC×任意系数当作库存；不输出 tCO2e、REMOVAL、核证减排量；不做时间外推；不把 34 格当作项目边界。

## 5. 仍未验证的科学性能（不得当作精度）

- **NPP 本身的绝对精度**：MOD17A3HGF 是**模型值**，非实测通量；本仓库无地面真值 ⇒ 未与实测比对，不能给出偏差或不确定度。
- **碳储量的真实误差与区间覆盖率**：未验证；`28.2 tC` 之类数字不具备精度含义。
- **治理因果效果 / 额外性**：未评估（`attributionStatus=not_assessed`、`baselineAssessed=false`）。
- **库布其项目的方法学适用性与项目边界**：项目方五类真实资料（边界、开工日、措施与物种、土地及减排量权属、治理前土地证据）**尚未取得**；不得据本模块推进到碳信用。
- **2012 断点成因**：未解决，仅作标注。
- **异常复核模型**：无真实标签 ⇒ 不报任何 P/R/F1；分数只影响复核顺序。

## 6. 本轮发现并修复的缺陷（均为实测复现）

| # | 缺陷 | 复现 | 修复 |
|---|---|---|---|
| 1 | 一键门禁在 Windows PowerShell 5.1 宿主上**全 26 项 exit 999**（「无法对 Null 数组进行索引」） | 直接执行 `scripts/run_all_gates.ps1` | 改为父进程设 `PYTHONIOENCODING`/`PYTHONUTF8`，不再触碰 `ProcessStartInfo.EnvironmentVariables` |
| 2 | 即使加空值守卫、**仅读取**该属性，子进程也会以**空环境**启动 ⇒ Node abort（CSPRNG 自检，exit 134），表现为"只有 node 门禁全红" | 探针脚本对照实验（不触碰 exit 0 / 只读 exit 134） | 同上；修复后全量 Hardhat 170 passing |
| 3 | 4 条新增门禁期望串与实际 JSON 输出不匹配 ⇒ **恒失败** | 门禁实跑（exit 0 仍判 FAIL） | 按实际输出匹配（`"passed": 7, "total": 7`；Node 多行 JSON 用 `"passed": 30` / `"passed": 32`） |
| 4 | P1 页 sticky 侧栏高于视口时，底部「下载与核验」面板**滚不进视野**（`scrollIntoView` 在 sticky 容器上不收敛），结论无法显示 | 真实浏览器首轮 **43/44**：`截图结论可见 P1_04_import_ok` FAIL；探针实测 `innerHeight=1008`、`docH=2885`、元素被钉在 `rectTop≈1323` | `.sidebar` 限高 `calc(100vh - 28px)` + 内部滚动；修订后 **44/44**，并已实际查看 `P1_04_import_ok.png` 确认结论块可见 |
| 5 | P0 页侧栏同样潜在（约 850 px，小屏会被钉住） | 同上机制 | 一并对两页应用同一处理 |

失败运行目录 `browser_runs/2026-10-13T11-34-51-392Z/` **原样保留**，未弱化任何断言；修复后 `browser_runs/2026-10-13T11-38-18-008Z/`（页修复）与最后一次运行（v1.1 标签）均在档。

## 7. 版本与边界

- 因 `web/entry.html`、`scripts/check_web_syntax.js`、`scripts/run_all_gates.ps1` 属**单地块模块 v1.3 清单**范围，本轮同步显式升级该模块 **v1.3 → v1.4 → v1.5**（见 `../parcel_intake_upgrade/ACCEPTANCE.md`），其资料登记语义、完整性规则 v1.1、下载包结构未变。
- 估算模块 v1.0 → **v1.1**（清单新建、旧清单保留）。
- 未改 Word；未新增信用签发功能；未改科研数据、模型、冻结六源、D3、历史公共登记与主张门禁；**未发交易、未读私钥**；新模块**未上链**。`docs/` 与 `web/` 新增文件均**不在**旧 42 文件包清单内 ⇒ `packSha256` 不变（已由 `verify_evidence.py` 7/7 复核）。

---

## ⚠️ 本验收已被取代（2026-10-13 之后）

历史代码审查（2026-10-13）发现本模块 v1.1 存在
P1-1…P1-5、P2-1…P2-3 缺陷。**当前口径以 `audit/estimation_fix_2026-10-13/ACCEPTANCE.md`（R37.1，模块 v1.2）为准。**
本文件及其计数**仅代表 v1.1 当时状态**，原文保留、不作修改；旧清单 `MODULE_MANIFEST_v1.1.json` 亦保留，
并在 `audit/estimation_fix_2026-10-13/archive_v1.1/` 另存一份。
