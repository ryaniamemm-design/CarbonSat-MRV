# 验收记录 · 研究工作台 v1.0（R43 / 2026-10-19）

**结论：首版可运行并通过验证。** 39/39 离线门禁通过（退出码 0），独立复算 39/39、真实浏览器 49/49、
单元测试 26 passing；保护件全部未变；0 新增交易、0 部署、0 私钥读取。

访问地址：`http://127.0.0.1:<port>/web/workbench.html`（本地静态服务根 = `72h-spike`）。

---

## 1. 交付件与最终哈希（sha256 前 16 位，全量见清单）

| 文件 | 字节 | sha256[:16] |
| --- | --- | --- |
| `web/workbench_core.js` | 33690 | `fc8b7b29a0f4ba62` |
| `web/workbench.html` | 5440 | `6b6661e194836dcb` |
| `web/workbench.css` | 14206 | `62ea3f57b13c1268` |
| `web/workbench.js` | 44552 | `a286380daf0f6114` |
| `docs/WORKBENCH_V1.md` | 11545 | `cb20f2b2f6b3a210` |
| `test/workbench.test.js` | 13701 | `318ac79dfddcdc4a` |
| `scripts/verify_workbench.js` | 19246 | `bee802ff036f2e95` |
| `scripts/browser_workbench_drive.js` | 27879 | `8ad3db4230d830b2` |
| `scripts/verify_workbench_module.py` | 7400 | `d2f35e23c1becbc8` |
| **`audit/workbench_v1_2026-10-19/MODULE_MANIFEST_v1.0.json`** | 1723 | **`b7725d6b952d49de`** |

同轮升版的四个既有模块清单：

| 清单 | 文件数 | sha256[:16] |
| --- | --- | --- |
| `audit/change_ledger_v1_2026-10-15/MODULE_MANIFEST_v1.3.json` | 7 | `36a0713b8d4bee50` |
| `audit/parcel_intake_upgrade/MODULE_MANIFEST_v1.14.json` | 12 | `a3c034db1fbdc479` |
| `audit/estimation_upgrade/MODULE_MANIFEST_v1.9.json` | 19 | `6311fa12a62d7724` |
| `audit/engebei_research_case_2026-10-16/MODULE_MANIFEST_v1.3.json` | 18 | `e2f76f709dfd1198` |

旧清单（v1.13 / v1.8 / v1.2 / v1.2）与旧验收原文**全部保留**。

---

## 2. 九项功能与对应证据

| 要求 | 落地 | 证据 |
| --- | --- | --- |
| 新独立入口 `web/workbench.html`，保留已有页面 | 新增 4 文件；`entry.html` 增加工作台卡片；旧页面全部保留 | `CHANGES.md` §1–2 |
| 顶部=产品名+案例+年份+版本与核验状态 | 顶栏四段 | 截图 `01` / `05` |
| 左列表+搜索 / 中地图+范围+图例 / 右指标+面积+范围性质+来源 | 三栏 grid | 截图 `01` |
| 底部=年度序列 + 明细/台账/任务入口 | 底栏 | 截图 `01` |
| A：地图↔列表、年份↔指标/明细/序列、点序列反更年份、进台账不失定位 | 全部双向 | 驱动 49/49；截图 `02` / `03` / `04` |
| B：切案例全量同步；显示窗口性质；保留 PARTIAL_COVERAGE；台账禁用并说明 | 全部 | 截图 `05` / `06` |
| 两案例不自动合计/排名/当同一项目 | 代码层无合计 API；`CANNOT_SAY` 明写 | 单测"两案例不可合计" |
| 来源五层 + 不能代替什么 + 引用报告注明版本范围 | `sourcePanel` 五层 | 单测 2 例 |
| 数据与地图契约 8 条（C1–C8） | 见契约 §2 | `docs/WORKBENCH_V1.md` |
| 失败关闭（非法/错 pin/缺 pin/缺数据/加载失败/底图失败） | 全部显式 | 驱动 5 组；截图 `07` / `08` |
| 离线可用、无 CDN、无密钥 | 零第三方 JS；唯一可选 OSM 瓦片 | `DEPENDENCIES.md` |
| 独立复算（两案例、单位链、覆盖比例） | `verify_workbench.js` 自带解析与算术 | 39/39 |
| 反例 ≥9 类 | 见 §4 | 全部覆盖 |
| 真实浏览器验证 | Edge 152 headless + CDP | 49/49，9 截图 |
| 版本与保护范围 | 5 个清单 | §1 |

---

## 3. 门禁实跑（`scripts/run_all_gates.ps1`）

```
统计 : 39 项（core=39 / chain=0 / full=0）
门禁汇总：通过 39 / 39    失败 0
报告：audit/gates/last_run.json（verdict=pass，withChain=false）
```

- 进程退出码 **0**（`-NoProcessExit` 下由汇总判定；不带动该开关时失败即 exit 1）。
- 首次运行曾 **38/39**：`变化台账模块 · --selftest` 期望串仍写 `20/20`，实际为 `21/21`（本轮新增了一条
  版本串反例）。按红线"期望串必须与实际输出逐字一致"，改为 `21/21` 后重跑得 39/39。
  期间发现 `run_all_gates.ps1` 属三个模块清单的受管文件 ⇒ 删除本轮刚生成、尚未被任何记录引用的
  三个清单并重新冻结（同一版本号，**不是覆盖历史版本**），再重跑确认全绿。
- 单门禁墙钟上限 300 s；本轮最慢为 mocha 台账 112.7 s、全量测试 128.2 s、台账独立复算 61.1 s。

---

## 4. 反例覆盖（用户点名的 9 类，逐条对应）

| # | 反例 | 对应检查 | 结果 |
| --- | --- | --- | --- |
| 1 | 案例切换后残留旧指标/来源 | 驱动"不残留 A 的数值（无 4,258 / cell_0020）"；独立验证"切换案例后旧对象不可定位" | PASS |
| 2 | 快速连续切换导致异步串案 | 驱动"快速 B→A 切换后最终仍是 A（迟到结果被丢弃）" `stale=1` | PASS |
| 3 | 无效对象或年份 | 独立验证"未知对象 / 未知年份 / 跨案例台账 / 非法参数 ⇒ 全部拒绝" | PASS |
| 4 | null 被转 0 | 独立验证"null 不被转为 0（明细与序列均为 null）" + "合法 0 保留为 0" | PASS |
| 5 | 错 pin / 缺 pin | 驱动两条 + 独立验证两条（错 pin ⇒ 拒绝；缺 pin ⇒ `PIN_ABSENT`，不冒充已核对发布件） | PASS |
| 6 | 篡改数据并重算自摘要后仍应被拒 | 驱动"非法 bundle（篡改后重签自摘要）⇒ 拒绝"；独立验证"篡改面积比例 / 篡改生产量 重签 ⇒ 拒绝" | PASS |
| 7 | 恩格贝部分覆盖被误标整窗 | 独立验证"把部分覆盖改标为整窗覆盖并重签 ⇒ 拒绝" | PASS |
| 8 | 跨 2012 差值请求 | 独立验证"无跨 2012 差值出口：API 无 delta/growth，序列按段切开，文案明确禁止" | PASS |
| 9 | 在线底图失败而核心功能仍可用 | 驱动"底图失败：状态为 failed / 核心查看仍可用（34 框 + 指标仍在）" | PASS |

补充反例：分享参数非法/多余参数被拒、定位参数不进台账摘要、清单 fail-open 反例 22 例。

---

## 5. 真实浏览器验证（软件验证，**不是**真人可用性试用）

```
browser : Edg/152.0.4191.53（headless=new + CDP）
checks  : 49/49 PASS
shots   : 9（audit/workbench_v1_2026-10-19/browser_runs/2026-10-19T09-12-55-414Z/shots/）
交易    : 0 笔公共交易、0 次钱包请求
外部请求: 仅 tile.openstreetmap.org（主动开启底图时）12 条，其余 0
控制台  : 0 未捕获异常、0 error 级日志
小屏    : 1366×768 下关键控件与按钮全部在视口内
```

截图清单：`01 首屏_案例A` / `02 年份与序列联动` / `03 台账入口与定位参数` / `04 台账页_定位保留` /
`05 案例B_窗口与部分覆盖` / `06 案例B_台账入口禁用` / `07 非法输入被拒并保留上一份` / `08 底图失败核心仍可用` /
`09 小屏1366x768`。

**其中 `04` 暴露了一个既有布局缺陷**（定位块 9 组键值挤进单个单行 `.kv`，右侧来源栏连带被压到约 10px）。
用 `probe_layout.js` 定位根因后按"逐行 `.kv`"修复，重跑截图确认恢复。

---

## 6. 保护件不变（逐项核对）

| 项 | 状态 |
| --- | --- |
| `data/npp_annual_production_integral.csv`（`065d5d8f…`） | 未改，门禁 #17 通过 |
| `web/npp_estimate_bundle.json`（`090ef7a9…`）+ pin（`79004d48…`） | 未改，门禁 #17 / #33 通过 |
| `web/engebei_bundle.json` + pin + `data/engebei/*` | 未改，门禁 #29 / #30 通过 |
| 816 条 NPP 记录 / 9 条主张 / A2 流 | 未改，门禁 #7 / #8 通过 |
| 冻结六件 | 未改，门禁 #1 `--verify` 6/6 |
| D3 三件 | 未改，门禁 #16 保护基线通过 |
| Sepolia 单条登记 | 未动，**未跑** `-WithChain`（默认排除），0 交易 |
| 受保护快照 62 条 | 门禁 #3 `结论 = ok` |

---

## 7. 本轮明确未验证

- 真实用户可用性试用：**未执行**（未招募、未采集、未由模型代演）。
- 模型真实异常检出性能、GEE 上游源真实性、足迹同一性、地面精度、2012 断点成因、恩格贝出版定稿：**均未验证**。
- 工作台**未**接入旧科学包 `packSha256`、**未**上链；本地 Merkle 验证 ≠ 公共链锚定。
- 底图仅做地理参考，**不参与**任何数值或核验；断网时底图不可用但核心查看可用。

---

## 8. 复现命令（全部在 `72h-spike` 下）

```bash
# 1) 起本地静态服务后打开
python -m http.server 8080        # 然后访问 http://127.0.0.1:8080/web/workbench.html

# 2) 独立复算（不调用生产核心算期望值）
node scripts/verify_workbench.js

# 3) 单元测试
node node_modules/hardhat/internal/cli/cli.js test test/workbench.test.js

# 4) 真实浏览器驱动（需本机 Edge）
node scripts/browser_workbench_drive.js

# 5) 清单核验
python scripts/verify_workbench_module.py --verify

# 6) 全量离线门禁
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_all_gates.ps1 -NoProcessExit
```

---

# 验收 · 研究工作台 v1.1（R44 / 2026-10-19）

> 本轮 = 修复独立审阅的 1 × P1 + 2 × P2 + 界面升级。
> **判定标准未因视觉调整放宽**；原探针 `probe.js` 未改动，修复结果另存 `probe_after_fix.js` / `results_after_fix.json`。

## 1. 计数（全部现跑）

| 项目 | 结果 | 命令 |
| --- | --- | --- |
| 一键离线门禁 | **40 / 40**（exit 0，`WithChain=False`） | `run_all_gates.ps1 -NoProcessExit` |
| 工作台回归测试 | **41 passing** | `hardhat test test/workbench.test.js` |
| 工作台独立复算 + 反例 | **50 / 50 通过** | `node scripts/verify_workbench.js` |
| 真实浏览器驱动 | **60 / 60 PASS**（0 异常、0 error 日志、0 交易、0 钱包） | `node scripts/browser_workbench_drive.js` |
| 证据登记重算比对 | `{"ok":true,"checked":2,"diffs":[]}` | `node scripts/build_workbench_evidence_registry.js --verify` |
| 模块清单核验 | 工作台 **12/12**；单地块 12/12；估算 19/19；恩格贝 18/18 | `verify_*_module.py --verify` |
| 清单自检 | 工作台 **26/26**；单地块 14/14；估算 21/21；恩格贝 **30/30** | `verify_*_module.py --selftest` |
| 页面语法 | **16/16** | `node scripts/check_web_syntax.js` |
| 全量测试（合约 + 集成 + 页面流程） | **331 passing**（exit 0，2m） | `hardhat test` |

## 2. 三项审阅问题的修复证据

### P1-1 · 历史复算证据必须绑定当前产物身份
- **修复前**（`results.json`）：新源 + 改值 + 重签 + 无 pin ⇒ `internalAccepted=true`、
  `local.ok=true`、`local.verdict="通过"`、`upstream.ok=true` —— 旧结论被继承。
- **修复后**（`results_after_fix.json`，本轮已按最终代码重跑）：同一输入 ⇒
  `internalAccepted=true` 但 `local.ok=false` / `state=warn` / `verdict="未取得证据登记"` / `raw=NO_REGISTRY`，
  `upstream.ok=false` / `state=warn` / `verdict="未取得上游抽样记录"`。
  即：**内部自洽不再顺带把历史结论标成通过**；探针没有载入登记，因此只能得到"未取得"，不会得到"通过"。
- 载入登记后（浏览器实测）：当前发布件 ⇒ `APPLICABLE`、local 层 `info` + "历史报告适用于当前产物"；
  反例①②⇒ `NOT_APPLICABLE` + "历史报告存在，未确认适用于当前产物"，且上游层**即使对象年在 9 个抽样内也不给通过色**。
- 正反对照 5 组全部落在测试与独立验证里（见 `test/workbench.test.js` 8 例、`verify_workbench.js` 11 项）。

### P2-1 · pin 四态
`results_after_fix.json` 中 5 种非法输入全部 `accepted:false`：
`{broken JSON` ⇒ 不是合法 JSON；`null` / `false` / `0` ⇒ 结构非法（null / boolean / number）；
`{}` ⇒ 核验未通过（缺字段）。
浏览器驱动对同样 4 种输入逐一断言 `ok:false` 且 banner 带原因。
`FETCH_FAILED` 路径实测：`案例 A 载入被拒绝。网络获取失败：Failed to fetch`。

### P2-2 · 缺测表述
`actualCaseA`：`rows=816, nullProduction=0, nullIntegral=0, missing=0, zeroValidAreaClassRows=23`，
与新表述（"816 个整格年均有生产量；23 条地类行保留 null"）一致。

## 3. 视觉验收（人工逐张查看）

- 7 张同条件前后对照见 `audit/workbench_visual_2026-10-19/`（`SHOTS.md` 逐张说明）。
- 两档窗口均无纵向滚动、无文字截断（`overflow = []`）；地图 1440×900 = 802×440、1366×768 = 728×319。
- 台账页定位块与来源证明栏未复发上一轮被压扁的问题（`06_ledger_locate_1440x900.png`）。

## 4. 本轮额外发现并修复的缺陷（门禁自身 fail-open）

新增「证据登记 `--verify`」门禁首次实跑时**打印了 PASS 但并未真正匹配**：
期望串里 `[]` 未转义 ⇒ `$out -match $g.Expect` 抛 `未终止的 [] 集合` ⇒ 赋值未发生 ⇒
`$matched` 保留初始值 `$true`。已修两处并再升一版（见 `CHANGES.md` §4）：

1. 期望串改为与实际输出逐字一致的 `"ok":true,"checked":2,"diffs":\[\]`；
2. 匹配包进 `try/catch`，正则非法 ⇒ **判定为不匹配**并把原因写入失败说明。

失败关闭对照（同一 `$out` 与同一段判定代码）：

```
BROKEN_PATTERN matched=False err=正在分析""ok": true, "checked": 2, "diffs":…
FIXED_PATTERN  matched=True  err=
```

修复后门禁汇总 `通过 40 / 40 失败 0`，且第 33 项 `matched: true`（`audit/gates/last_run.json`）。

### 关于探针输出里的 `manifest` 段

`results_after_fix.json` 的 `manifest` 段对照的是 **v1.0 清单**，本轮已升 v1.1，
因此它把 9 个受管文件都标成 `matches:false` —— 这是**版本已经升过**的预期表现，不是漂移失败。
当前有效性以 `python scripts/verify_workbench_module.py --verify`（12/12）为准。

## 5. 仍然存在的限制（不得由本页结论推出）

- 可用性试用**未执行**；浏览器驱动与截图均为**软件验证**。
- 上游仍只覆盖 **9 个对象年**（840 个中的 9 个）；其余 831 个未复算 ⇒ 不得称全量已复现。
- 足迹同一性、地面精度、治理因果、2012 断点成因、恩格贝出版定稿与项目矢量：**均未验证**。
- 两案例仍是**描述性 NPP 模型值**，不构成碳汇/碳信用/减排主张；`registrable` 恒 false、REMOVAL 恒 0。
- 视觉只覆盖 7 个固定状态；缩放/拖拽、底图开关、键盘顺序、屏幕阅读器未做对照。
