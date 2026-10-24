# 变化台账与复核任务导出 · v1.0 实现契约

模块：**`CarbonSat-ChangeLedgerModule-v1.0`**
实现文件：`web/change_core.js`（核心）、`web/changes.html` + `web/changes.js`（页面）、`scripts/verify_change_ledger.js`（独立复算 + 反例）、`test/change_ledger.test.js`（回归）
契约标识：`CarbonSat-ChangeLedger-Contract-2026-10-15-R39`
日期：2026-10-15。状态：**已实现并验证**（本轮不再是设计稿）。

配套设计稿（本轮按本契约修正，冲突处以本契约为准）：`audit/next_phase_design_2026-10-15/`。
独立审查意见（**未改动**）：`audit/next_phase_design_review_2026-10-15/REVIEW.md`。

---

## 0. 本契约解决什么：审查意见逐项裁决

`REVIEW.md` 提出 4 条 P1 + 2 条 P2。**逐条裁决如下，设计稿中与下表冲突的表述以本表为准。**

| # | 审查意见 | 本轮裁决（写进实现） |
|---|---|---|
| P1-1 | 已存在 v1.7，不能重新以 v1.7 覆盖升级 | **确认**。实际模块版本：单地块 **v1.7**、估算 **v1.2**。本轮触及其受管文件 ⇒ 单地块升 **v1.8**、估算升 **v1.3**；旧清单与旧验收原文**全部保留**，不覆盖 |
| P1-2 | 试用题 T2 错误禁止 2012 与 2013 比较 | **确认并改题**：era2 = 2012–2024，**2012→2013 属同一 era**。T2 拆为两问：①2011→2012 为何被当前规则阻断；②2012→2013 在其他检查满足时可作**何种描述**。**不预设"传感器原因"** |
| P1-3 | 数值面积容差不是足迹同一性的证明 | **确认**。面积容差分列为 `areaRelation`（**数值一致性**），与 `footprintIdentity`（**恒 `UNVERIFIED`**）**分列**。四条可比性维度：产品/版本/单位/投影与统计方法一致性、数值完整性、面积关系、**实际有效足迹身份依据** |
| P1-4 | 时间戳与确定性要求冲突 | **确认**。`generatedAtUTC` 只进**事件封套**，**不进稳定内容摘要**；任务过期判断绑定**实际使用的源产物版本**（源 CSV + A2 + 派生 bundle 文件/内容摘要 + pin），不只用旧证据包哈希 |
| P2-5 | "永久不可声称精度"与可用性指标禁令过度 | **确认**。改为"**当前无匹配真值 ⇒ 不得声称精度/准确率；将来取得匹配真值并按验证方案实施后再评估**"。可用性试用**允许**记录人数 / 完成数 / 耗时 / 求助次数 / 误解事件；禁用的只是把它们当作科学精度或检出率 |
| P2-6 | 试用脚本与自摘要语义 | **确认**。自摘要只说明**内部一致**；与独立已发布摘要或外部期望值比对才能识别**相对该版本的改动**。**自摘要一致不得表述为"来源真实"或"内容从未被改动"**。禁词检查只作**补充**，类型/来源/声明字段为**权威** |

---

## 1. 首版范围（实现什么、不实现什么）

### 1.1 首版实现（本轮）

```
① 定位原记录        → ② 同格同 era 相邻年整格指标差异 → ③ 条目级来源与局限 → ④ 复核任务导出
```

| 环节 | 首版实现 |
|---|---|
| ① 定位原记录 | 由 `(cellId, year)` 在**已核验**的派生 bundle 中定位格年，返回记录定位块（格心、era、可用性、`sourceRef`） |
| ② 差异 | **同一 `cellId`、同一 era、相邻两年**的整格指标 `prod_tC_yr`（tC/yr）之差；四条可比性维度逐条判定 |
| ③ 来源与局限 | 条目级 `boundaryNote`：`canSay[]` / `cannotSay[]` / `caveats` / `footprintIdentity` / 未纳入碳库 / 未评估要素 |
| ④ 任务导出 | 变化条目 → 复核任务清单（确定性排序 + 去重合并 + 稳定摘要 + 事件封套分离） |

### 1.2 首版明确**不做**（后置，本轮不实现）

- **跨格对比**（`SPATIAL_CONTRAST`）——**后置**；首版一条都不产生。
- **按地类变化的排序 / 优先级**——**后置**；首版只并排列出地类构成（描述性），**不排序、不解读**。
- 倍增序列（相邻年之外的年距）、趋势拟合、增长率、显著性、外推、插值、成图。
- 变化面积等易引向碳量的派生量。
- 与 816 条记录 / 9 条主张 / A2 叶集的任何链接。
- 分析窗口派生脚本（`build_analysis_window.py`）——**未实现**，本契约不含。

> 后置项**不是**"以后自动开启"：每项都必须先改契约、再实现、再反例验证。

---

## 2. 数据地基与来源绑定（`sourceRef`）

首版**不新增数据、不重跑 GEE**。唯一数据来源是既有派生 bundle（其自身由既有源 CSV + A2 派生）。

| 层 | 路径 | 绑定字段 |
|---|---|---|
| 派生 bundle（读入口） | `web/npp_estimate_bundle.json` | `bundleFileSha256`、`bundleContentSha256Declared`、`bundleContentSha256Recomputed`、`bundleSchemaVersion`、`generatorVersion` |
| 已发布摘要 | `web/npp_estimate_bundle.pin.json` | `pinStatus`、`pinBundleFileSha256`、`pinBundleContentSha256` |
| 源产物（生产量） | `data/npp_annual_production_integral.csv` | `sha256` |
| 源产物（A2 地类流） | `evidence/a2_landcover_valid_footprint.json` | `sha256` |
| 方法学声明 | bundle `methodology` | `method_version`、`lc_method_version`、`product`、`lcProduct`、`mask`、`crs`、`scale` |
| 规模声明 | bundle | `expectedCellYears` / `observedCellYears` / `expectedClassRows` / `observedClassRows` |
| 断点 | bundle | `eraBoundaryYear` = 2012 |

**`sourceRefSha256`** = `sha256('CarbonSat-MRV|npp-change-source-ref|v1\n' + canonicalBits(sourceRef))`。

> **纪律**：`sourceRef` **必须由实际载入的字节/内容派生**，不得手打。取不到 pin ⇒ 如实记 `PIN_ABSENT`，**不回填、不推断**。
> **纪律**：任务与条目的过期判定**绑定 `sourceRefSha256`**（覆盖源 CSV 与 A2），**不得**只依赖证据包 `wholeBundlePackSha256`（它不覆盖本模块的新数据）。

---

## 3. 可比性门禁（四条，分列，不互相代替）

一条相邻年差异只有**同时**满足下列四条才标 `comparable = true`；任一条不满足 ⇒ **`delta = null`**（**绝不静默相减**）、标 `NOT_COMPARABLE`、**列出未满足项**、**不进入任何排序**。

| 维度 | 字段 | 判据 | 失败语义 |
|---|---|---|---|
| ① 产品/版本/单位/投影与统计方法一致性 | `productAndMethodConsistency` | bundle 级 `methodology` 与权威镜像**逐字相同**；两格年同 `metric`、同单位；bundle 内**无逐行方法字段**（如实记为 `perRowMethodFieldsPresentInBundle=false`，并注明由命令行 `--verify` 逐行核验源 CSV） | 不一致 ⇒ 不可比 |
| ② 数值完整性 | `numericCompleteness` | 两格年均 `usable`（`missing=false`、`missingReason` ∈ {'', 'ok'}、`prod_tC_yr` 与 `integral_kgC_yr` 均有限） | 任一不可用 ⇒ 不可比 |
| ③ 面积关系 | `areaRelation` | `relDiff(gridValidAreaM2)` ≤ `RTOL_NUMERIC`、`relDiff(gridTotalAreaM2)` ≤ `RTOL_NUMERIC`、`validAreaRatio` 与面积列闭合 | 超阈 ⇒ 不可比 |
| ④ 实际有效足迹身份依据 | `footprintIdentity` | **首版恒 `status='UNVERIFIED'`** | **不影响 `comparable`**，但**恒写入局限**，见 §4 |

### 3.1 关于 `RTOL_NUMERIC = 1e-9`（**审查意见 P1-3 的直接落地**）

```
RTOL_NUMERIC 的语义 = NUMERIC_CONSISTENCY_ONLY
```

- 它**只**表示"两个格年的面积**数值**一致到 1e-9 相对差"，与既有 `RTOL=1e-9` 同源；
- 它**不是**"面积相近便可比"的科学阈值；
- **反例**：有效区域分别为同格的东半部与西半部，面积**可以相等而位置不同**。
- 因此：**`areaRelation.ok = true` 不得被读作"同一像元足迹"**，**不得**据此声称"同一植被的纯强度变化"。

### 3.2 足迹同一性如何处置（**不要求重跑 GEE**）

- 首版**不读取像元掩膜 / 影像**、**不重跑 GEE**、**不新增在线获取**；
- 因此 `footprintIdentity` **恒为 `UNVERIFIED`**，并在 `caveats` 与 `cannotSay` 中**显式保留该限制**；
- 生成一条 `NEED_MATERIAL` 复核任务：**索取两年有效像元掩膜或等效足迹依据**；
- 可描述的与不可描述的**分列**：

| 可以说 | 不可以说 |
|---|---|
| "该格既有产品**积分值**在该分时段内由 X 变为 Y（tC/yr）" | "两年有效像元为**同一批像元**" |
| "两条记录同格、同 era、相邻年、同指标同单位" | "这是**同一植被的纯强度变化**" |
| "面积**数值**一致到 1e-9（数值一致性）" | "有效足迹**已核实一致**" |

### 3.3 地类构成（**审查意见 P1-3 后半段**）

- 地类构成**不同本身是描述性变化**，可以**并列显示**面积、占比与产品值；
- **禁止**把构成差异**自动解释**为：同一植被的单位面积生产力变化 / 真实土地转化 / 治理效果；
- 首版**不做地类变化排序**（后置）；条目中只写 `compositionComparison`（描述）+ `landCoverCompositionChanged` 布尔。

---

## 4. 条目级 `boundaryNote`（与条目绑定、随导出走）

```jsonc
{
  "claimClass": "DESCRIPTIVE_NPP_ONLY",
  "attributionStatus": "insufficient_evidence",
  "forbiddenOutputs": ["REMOVAL", "GOVERNANCE_INCREMENT", "CARBON_CREDIT", "tCO2e"],
  "carbonQuantificationStatus": "NOT_PERFORMED",
  "registrationReady": false,
  "publiclyAnchored": false,
  "unassessedElements": ["BASELINE", "LEAKAGE", "NON_PERMANENCE", "ADDITIONALITY"],
  "notIncludedPools": ["SOC", "BGB", "DEADWOOD", "LITTER", "HWP"],
  "caveats": {
    "crossEra": false,                     // 首版恒 false（跨 era 条目被拒，不产出条目）
    "areaNumericRelDiff": 0.0,             // 数值一致性，不是足迹同一性
    "areaToleranceMeaning": "NUMERIC_CONSISTENCY_ONLY",
    "footprintIdentity": "UNVERIFIED",     // 恒
    "landCoverCompositionChanged": false,
    "modelStructuralBias": "UNASSESSED",
    "groundTruth": "NONE",
    "absoluteAccuracy": "NOT_VERIFIED"
  },
  "canSay": ["…"],
  "cannotSay": ["…"]
}
```

**未纳入碳库（`notIncludedPools`）** 与 **未评估的核算/资格要素（`unassessedElements`）** **必须分列**（IPCC 2006 Vol.4 §2.2.1），不得混作"碳库"。

**抗洗要求**：`boundaryNote` 参与 `entrySha256` 与 `taskId` 的派生 ⇒ **改语义必然改摘要**；重签摘要**不能**删除语义标签（`verifyChangeLedger` 会重算比对）。

---

## 5. 三件摘要：稳定内容 vs 运行事件（**审查意见 P1-4 的直接落地**）

### 5.1 三种摘要，永不互相代替

| 摘要 | 覆盖 | 含时间戳？ | 用途 |
|---|---|---|---|
| `entrySha256` | 单条变化条目的**稳定内容**（不含任何时间） | **否** | 条目身份 |
| `ledgerSha256` / `taskListSha256` | 台账 / 任务清单的**稳定内容** | **否** | 清单身份 |
| `stableDigest` | 导出封套中的 `stable` 部分 | **否** | **跨时刻可复现的唯一承诺** |
| （事件）`event.generatedAtUTC` | 运行事件 | **是** | **只在事件封套**，**不进任何稳定摘要** |

### 5.2 确定性承诺的**准确边界**

- **承诺**：同一输入（同一 `sourceRef` + 同一选择 + 同一 `rtol`）两次运行 ⇒ `stable` 部分**逐字节相同**、`stableDigest` **完全相同**；
- **不承诺**：含 `event.generatedAtUTC` 的**完整导出文件**跨时刻字节一致（时间戳**必然**不同）；
- 因此：**比较两个导出件是否同一份产物，必须比 `stableDigest`，不能比文件字节**。

### 5.3 `taskId` 的派生（**不得**含时间/随机）

```
taskId = 'local-sha256:' + sha256(
  'CarbonSat-MRV|npp-review-task|v1\n' + canonicalBits({
    schemaVersion, taskType, cellId, era, metric, metricUnit,
    caveats: [...sorted], triggeredByChangeEntryShas: [...sorted],
    sourceRefSha256, boundaryNoteSha256
  })
)
```

- **同一份稳定内容 ⇒ 同一 `taskId`**；换个时刻重新生成 ⇒ `taskId` **不变**；
- 去重键 = `(cellId, taskType, era, 排序后的 caveats 签名)`；合并时**累计** `triggeredByChangeEntryShas` 与 `count`；
- 去重**按稳定内容**进行 ⇒ 两次运行去重结果一致。

### 5.4 任务过期判定绑定什么

任务携带 `sourceRefSha256`。载入任务时与**当前** `sourceRefSha256` 比对：

| 比对结果 | 显示 |
|---|---|
| 相同 | "**与当前源产物版本一致**"（**注意**：这只说明版本相同，**不是**"来源真实"） |
| 不同 | "**版本过期**"：该任务依据的源产物版本已不是当前版本，**结论不得静默套用** |

> 覆盖范围包含**源 CSV 与 A2**（`sourceRef` 四件），**不只**旧证据包 `wholeBundlePackSha256`。

---

## 6. 自摘要语义（**审查意见 P2-6 的直接落地**）

| 正确表述 | 禁止表述 |
|---|---|
| "自摘要**只**说明内部一致" | "自摘要一致 ⇒ **来源真实**" |
| "与**独立已发布摘要**或**外部期望值**比对，才能识别**相对该版本的改动**" | "摘要一致 ⇒ **内容从未被改动**" |
| "③ 源文件逐项复算：**未核验**（本页不读源 CSV）" | "本页已核验源文件" |
| 类型 / 来源 / 声明字段为**权威**；禁词检查为**补充** | "措辞检查通过 ⇒ 语义合格" |

**禁词检查只是补充**（例如"非项目边界"这类**说明性**文本本身包含"项目边界"字样）。权威判据是显式字段：`entryType`、`comparable`、`footprintIdentity.status`、`claimClass`、`attributionStatus`。

---

## 7. 红线（首版与后续通用）

1. 不声称碳汇 / 碳增汇 / 碳减排 / 碳信用；不输出信用量、不给 tCO₂e。
2. 不把变化（时间或空间）判为**治理归因**；不写因果。
3. **不跨 2012** 做差分、增长、趋势或外推 —— 跨 era 条目**拒绝**（不是警告）。
4. 不把 34 格 / 分析窗口称为**项目边界**。
5. 不把 NPP 累加 / NPP × 碳分数 / FVC × 系数当作库存。
6. 不声称"已核验来源真实性"；**自摘要一致 ≠ 来源真实 ≠ 内容从未被改动**。
7. **当前无匹配真值 ⇒ 不得声称精度 / 准确率 / 检出率**；将来取得匹配真值并按验证方案实施后再评估。
8. 不把变化清单接进 9 条主张或 A2 叶集；`registrable` / REMOVAL / `attributionStatus` **不因生成任何数量的任务而改变**。
9. 失败关闭：缺格年、重复格年、NaN/Inf、单位或方法不一致、跨 era ⇒ **不出值**（不得填 0、不得用剩余项求和）。
10. 不部署、不登记、不新增公共交易、不读私钥、不联系外部人员。

---

## 8. 验收清单（本轮逐条实测，证据见验收文档）

| # | 验收项 | 期望行为 |
|---|---|---|
| 1 | 确定性 | 同一输入两次 ⇒ `stable` 逐字节相同、`stableDigest` 相同 |
| 2 | 时间戳分离 | 改 `generatedAtUTC` ⇒ 文件字节变、`stableDigest` **不变**、`taskId` **不变** |
| 3 | 独立复算 | `verify_change_ledger.js` 从**源 CSV** 重算差值，与核心输出**逐条相符** |
| 4 | 跨 era 反例 | 2011→2012 ⇒ **被拒**（进 `refused[]`，不出条目） |
| 5 | 缺 / 重复格年 | 删除或复制格年 ⇒ 该条不出值 / 结构核验失败 |
| 6 | NaN / Inf | 置为 `NaN`/`Infinity` ⇒ 该格年不可用，条目标 `NOT_COMPARABLE` 且 `delta=null` |
| 7 | 单位 / 方法不一致 | 改单位声明或方法学声明 ⇒ bundle 核验失败，拒绝 |
| 8 | 伪造相等面积但缺足迹依据 | 令面积数值相等 ⇒ `areaRelation.ok=true`，但 `footprintIdentity` **仍 `UNVERIFIED`** 且 `cannotSay` 保留该限制 |
| 9 | 源摘要改变 | 改 bundle 中源 CSV 摘要（重签内容摘要）⇒ 与 pin / 源文件不符即被拒 |
| 10 | 重签自摘要后改语义 | 改 `boundaryNote` 并重签 `entrySha256` ⇒ 语义标签仍须存在；改 `claimClass` 等 ⇒ 拒绝 |
| 11 | 任务重复与时间戳 | 同因重复触发 ⇒ 合并为一条并累计；改时间戳 ⇒ `taskId` 不变 |
| 12 | 红线回归 | 生成任意数量任务后 `registrable=false`、REMOVAL 计数 0、`attributionStatus='insufficient_evidence'` 不变 |
| 13 | 不变量 | 816 记录 / 9 主张 / 科研 CSV 哈希 / 冻结六件 / D3 三件 / 链上产物 mtime **均未变** |
| 14 | 真实浏览器 | 真实 Edge 无头下四面板可用、失败关闭生效、无外部请求、钱包请求 0 |

---

## 9. 版本影响面（按**实际**受管文件影响）

| 受影响模块 | 触及的受管文件 | 处理 |
|---|---|---|
| **单地块证据登记模块**（v1.7） | `web/entry.html`、`scripts/check_web_syntax.js`、`scripts/run_all_gates.ps1` | 显式升 **v1.8**；旧清单保留；旧验收原文另存 `audit/parcel_intake_upgrade/ACCEPTANCE_v1.7.md` |
| **估算模块**（v1.2） | `web/entry.html`、`scripts/check_web_syntax.js`、`scripts/run_all_gates.ps1` | 显式升 **v1.3**；旧清单保留；旧验收原文另存 `audit/estimation_fix_2026-10-13/archive_v1.2/` |
| **变化台账模块**（新增） | `web/change_core.js`、`web/changes.html`、`web/changes.js`、`scripts/verify_change_ledger.js`、`test/change_ledger.test.js`、`docs/CHANGE_LEDGER_V1.md` | 新开独立清单 **v1.0**（不在旧 42 文件包内、不受 `packSha256`/Sepolia 保护） |
| **冻结六件 / D3 三件 / 816 记录 / 9 主张 / 科研 CSV** | — | **不得改动** |

> 变化台账核心**复用** `NppEntryCore` 的 `verifyBundle` 与 `canonicalBits`：**不重复实现**结构核验，避免两套实现漂移。

---

## 10. 尚不能声称的（首版特有）

1. **首版不产生跨格对比**，因此**不能**回答"哪一格变化更大"。
2. **首版不排序**，因此"第一条"**不代表**"最值得看"——排序属后置项。
3. **足迹同一性未核实** ⇒ 不能声称同格差异是"同一植被的纯强度变化"。
4. **模型结构性偏差未评估**、**无地面真值** ⇒ 不能声称绝对精度或误差。
5. 变化条目**不构成**碳汇、碳量、信用量或治理归因；`registrable` 恒 `false`。
6. 自摘要一致**不证明**来源真实，也**不证明**内容从未被改动。

---

# 附：v1.1 修订契约（2026-10-15，按独立复核 REVIEW.md 的三组 P1 修正）

> 触发：`audit/change_ledger_independent_review_2026-10-15/REVIEW.md`（**原件与原始探针未改动**，另存 `original_evidence/`）。
> **以上 v1.0 正文原文保留**；与本节冲突处**以本节为准**。模块版本 **v1.0 → v1.1**；旧清单 `MODULE_MANIFEST_v1.0.json` 与旧验收原文**保留不覆盖**。
>
> 复核结论的读法：**"正常数据算对"与"非法导入必被拒"是两件事**。v1.0 只做到了前者——7 个非法输入全部被接受（漏检）。

## A1. 版本与协议（v1.1）

| 项 | v1.0 | v1.1 |
|---|---|---|
| 台账 schema | `CarbonSat-NppChangeLedger-v1.0` | `...-v1.1` |
| 条目 schema | `CarbonSat-NppChangeEntry-v1.0` | `...-v1.1` |
| 任务清单 schema | `CarbonSat-NppReviewTaskList-v1.0` | `...-v1.1` |
| 导出 schema | `CarbonSat-NppChangeTaskExport-v1.0` | `...-v1.1` |
| 生成器版本 | `npp-change-ledger-v1.0` | `npp-change-ledger-v1.1` |
| 摘要域 | `…|…|v1\n` | `…|…|v2\n`（7 个域全部升 v2） |

内容净变化 ⇒ 台账/任务/导出摘要值必然改变。**v1.0 产物按 v1.1 核验一律报"版本不符"**（这是预期的，不是回归）。

## A2. P1-1：台账结构与语义必须被真正核验

v1.0 只重算自摘要，故**空表、自相矛盾条目、删掉必备局限后重签**都能通过。v1.1 新增：

1. **固定键集**：台账/条目/任务/导出件均为**精确键集**——缺键与多键都拒（`未知字段` 与 `缺字段` 分别报错）。
2. **固定声明**：`definition` / `scopeNote` / `orderingNote` / `limitations` / `metric` / `metricUnit` / `metricLabel` / `ordering` / `eraBoundaryYear` / `rtolNumeric` / `rtolSemantics` 必须与常量**逐字相等**；`limitations` **整体不得删减**（复核反例③）。
3. **显式选择范围绑定** `ledger.scope = { cellIds, eras }`：
   - `cellIds` 必须**非空、已排序、无重复**的字符串数组；`eras` ⊆ {1,2} 且已排序无重复。
   - **据 scope 推导应有的年对主键集合**：`{(cellId, y, y+1) | cellId ∈ scope.cellIds, era ∈ scope.eras, (y,y+1) ∈ adjacentPairs(era)}`。
   - **据此推导应有拒收集合**：每个 `cellId` 恰好一条跨期对 `(2011→2012)` 的 `CROSS_ERA_REFUSED`。
   - **`entries` 键 ∪ `refused`（年对形键）必须恰好等于推导集合**，且两者**互不相交**（同一年对不得既出条目又被拒）。
   - 所有的 `counts` 由数组**实测导出**再比对声明值；`counts` 键集亦固定。
   - **不把 748 写死**：748 = 34 格 × 22 对，由 scope 推出；scope 变小则期望值随之变小（**子集合法，清空不合法**）。
4. **相邻整年强制**：`yearFrom`/`yearTo` 必须是**整数**且 `yearTo === yearFrom + 1`，且 `eraOf(yearFrom) === eraOf(yearTo) === entry.era`。
5. **状态互相一致**（复核反例④）：
   - `comparable === (failedGates.length === 0)`；`failedGates` 必须**恰好**等于失败门禁码集合（无多余、无缺失）；
   - 每个门禁 `.ok === false` ⇔ 对应码 ∈ `failedGates`（`PRODUCT_METHOD_INCONSISTENT` / `NUMERIC_INCOMPLETE` / `AREA_RELATION_OUT_OF_TOLERANCE`）；
   - `deltaComputed === comparable`；`comparable === false ⇒ delta_tC_yr === null`（不得静默相减）；`comparable === true ⇒ from/to/delta 均有限`；
   - `entryType === comparable ? TEMPORAL_CHANGE_ADJACENT_YEARS : TEMPORAL_CHANGE_NOT_COMPARABLE`。
6. **`boundaryNote` 必须等于按该条目自身状态重算的结果**（语义要求，与自摘要无关）：必备边界常量逐字段相等；`caveats` 键值固定；`canSay`/`cannotSay` **必须含全部必备限制语句**（治理归因/碳汇/碳量信用量/绝对精度；足迹未核实时的"同一批像元""纯强度变化"；不可比时的"不称其为变化"；构成变化时的对应限制）。
7. **若有可信当前 bundle**（`verifyLedger(ledger, {bundle, pin, fileSha256})`）：按该 bundle **重算整表**并要求逐条相等；无该上下文时**不得**声称"已从源数值核验"。

保留：合法零值与负值仍是合法数值（`finite` 判定，不设正数下限）；足迹同一性限制恒随条目走。

## A3. P1-2：任务与台账的引用关系必须真的成立

v1.0 只保证任务与台账**同源**，不验证引用是否解析。v1.1 新增：

1. **清单必须绑定所含台账**：`taskList.ledgerSha256 === ledger.ledgerSha256`（"同源版本"不够）。
2. **每个触发引用必须解析到实际条目**：`triggeredByChangeEntryShas` 中每一项都必须在内含台账 `entries` 中**存在**；**悬空引用一律拒**（复核反例⑤）。
3. **逐条核对格与 era**：解析出的条目 `cellId`/`era` 必须与该任务声明一致。
4. **逐条核对局限对应**：`caveats` 必须等于 `expectedTaskCaveats(entry, taskType)`（REVIEW/DATA = `caveatsOf(entry)`；MATERIAL = `['FOOTPRINT_IDENTITY_UNVERIFIED']`）——**建与验共用同一函数**，不同实现不得各写一份。
5. **合并任务保留"全部"触发条目的来源与局限对应关系**（v1.0 只留了第一条）：
   - 任务新增 `triggers: [{entrySha256, cellId, era, boundaryNoteSha256, caveats}]`，按 `entrySha256` 排序；
   - 每项 `boundaryNoteSha256` 必须等于台账中该条目的 `boundaryNoteSha256`；
   - **移除**单数的 `boundaryNoteSha256` 字段（避免"只看第一条"的误读）；
   - `taskId` 的稳定内容改含 `triggerBoundaryNoteShas`（全部触发的 `entrySha256:boundaryNoteSha256`，排序）⇒ 触发集合被摘要是锁住的。
6. **非法重复拒绝**：`triggeredByChangeEntryShas` 内部不得重复；`triggers` 的 `entrySha256` 集合必须与之一一对应；`taskId` 不得重复；`count === triggeredByChangeEntryShas.length`。
7. **任务类型与条目状态对应**：可比条目 ⇒ `REVIEW` + `MATERIAL`；不可比条目 ⇒ `DATA_ISSUE_PENDING`。

## A4. P1-3：来源块与 pin 状态不得由导入件自报

v1.0 直接回显导入件里的 `publishedPin.status`，并把顶层 `sourceRef` 当作可信。v1.1 新增：

1. **顶层 `sourceRef` 必须独立重算并与内含台账一致**：`stable.sourceRef` 与 `stable.ledger.sourceRef` **逐字段相等**；`stable.sourceRefSha256` 必须等于 `sourceRefSha256(stable.sourceRef)`，且与台账、任务清单的 `sourceRefSha256` 三者一致。任何一处不符 ⇒ 拒。
2. **pin 状态区分"包内声明"与"本次独立评估"**：
   - `declared` = 包内 `stable.sourceRef.publishedPin.status`（**只作为声明转述**）；
   - `evaluated` = **仅在调用方独立提供可信 pin**（`opts.pin`）时计算，比对 `pin.bundleContentSha256` ↔ 包内重算的内容摘要、`pin.bundleFileSha256` ↔ 包内文件字节摘要；
   - **无独立可信 pin / 无当前已核验上下文** ⇒ `evaluated = 'NOT_EVALUATED'`，provenance② 只能显示"**未评估（仅包内声明：…）**"，**不得**照抄 `MATCHED` 作为本次核验结论；
   - 独立评估为 `MISMATCHED` ⇒ **拒**（该件内容与调用方可信 pin 不符）。
3. **上下文不足时的措辞**：`sourceAuthenticityVerified` 恒 `false`；③ 源文件逐项复算恒 `NOT_LOADED`（由 `scripts/verify_change_ledger.js` 独立复算，本页不读源 CSV）。

## A5. 自检预期的更正（复核指出 v1.0 自检本身有错）

v1.0 的"反例 2"把**删除必备局限语句 + 重签**当作"内部自洽、通过"的**预期**，与 §4"重签摘要不能删除语义标签"矛盾。v1.1：

- **反例 2 拆为两条**：
  - **2a（已更正）**：删除必备 `cannotSay` 语句并重签条目/边界/台账摘要 ⇒ **必须被拒**（必备局限是语义要求，与自摘要无关）。
  - **2b（另行演示）**：用**合法但不同**的产物（把 scope 收窄为单格）并**完整重签** ⇒ 内部自洽且**核验通过**，但其 `stableDigest` 与全量件不同 ⇒ **自洽 + 合法 ≠ 同一产物**；识别"相对已发布版本是否被改动"仍须与**独立已发布摘要/外部期望值**比对。这一条同时证明"计数由 scope 推导、不硬编码 748"。
- 新增**"重算摘要后仍非法"**反例组：非相邻年、空表、门禁↔状态矛盾、悬空任务引用、错配台账、自报 pin ——**全部在重签之后仍然被拒**，且拒绝原因必须是**语义或关联错误**，不能只是"摘要未同步"。

## A6. 验收（本轮实测）

1. 复核的**原始 7 个非法输入全部被拒**（`observed.ok === false` 或 fail-closed 抛错），原因对应语义/关联。
2. 正常件：748 条可比差值 + 34 条拒收 + 172 项任务 / 1496 次触发**保持不变**；合法零值与负值仍合法；足迹同一性仍恒 `UNVERIFIED`。
3. 新增反例：**重签后仍非法**必须仍被拒；自检中"允许删必备局限"的预期**已纠正**。
4. 真实浏览器：导入正常件与非法件，核对提示与**状态失效**处理（被拒后保留上一份已核验台账、不采用被拒内容）。
5. 显式升版 + 保留旧清单；共享模块按**实际受管文件**影响升版（见验收文档）。
6. 科研 CSV、A2、既有 bundle/pin、816 记录、9 主张、模型、冻结六件、D3 与历史登记**不变**；不发交易、不读私钥；**不由模型代演真人试用**。

---

# 附：v1.2 修订契约（2026-10-16，按限定复验 REVIEW.md 的「任务完整性」P1 修正）

> 触发：`audit/change_ledger_followup_review_2026-10-16/REVIEW.md`（**原件与探针未改动**，另存 `original_evidence/`）。
> 该复验**确认原七例已闭合**（不多推翻），只提出一组新 P1：**核验器只验证"现有任务引用合法"，未验证"应有任务及触发是否完整"** ——
> 清空全部任务、清空某任务触发、删掉一整条任务、从合并任务里删掉一个触发（**同步下调计数并重算摘要**）四例仍可通过。
> **以上 v1.0 / v1.1 正文原文保留**；与本节冲突处**以本节为准**。模块版本 **v1.1 → v1.2**；旧清单 `MODULE_MANIFEST_v1.1.json` 与旧验收原文**保留不覆盖**。

## B1. 版本与协议（v1.2）

| 项 | v1.1 | v1.2 |
|---|---|---|
| 台账 / 条目 / 任务清单 / 导出 schema | `…-v1.1` | `…-v1.2` |
| 生成器版本 | `npp-change-ledger-v1.1` | `npp-change-ledger-v1.2` |
| 摘要域 | `…|…|v2\n` | `…|…|v3\n`（7 个域全部升 v3） |

**数据结构未新增字段**（本轮只加强核验），但版本串与摘要域**一并升版**：任何 v1.1 产物在 v1.2 核验下一律报"版本不符"，避免两版产物混淆。

## B2. 定位：完整规则派生清单（本轮**不**新增任务筛选功能）

- 当前任务的语义明确为：**「所附台账按其既有规则派生出的完整复核任务清单」**。
- 本版**不新增**任务筛选 / 部分导出 / 任务范围声明功能；也**不**把"删掉若干任务"解释为"合法的已标注子集"。
- 台账自身的**合法 scope 子集**（例如单格 era1 ⇒ 10 条差异）与"删掉该台账应生成的任务"是**两件事**：前者产生**相应完整**的任务子集并通过；后者一律拒绝。
- 若将来确需支持部分任务导出，必须**显式声明筛选范围**并单独升版（届时"应有集合"改由该范围推导）。**本版不做。**

## B3. 规则派生集合与精确比对

1. **规则派生的 `(entrySha256, taskType)` 集合**由台账条目状态推导（与生成端**共用同一函数**）：
   - 可比条目 ⇒ `INSUFFICIENT_EVIDENCE`（REVIEW）**与** `NEED_MATERIAL`（MATERIAL）各一条；
   - 不可比条目 ⇒ `DATA_ISSUE_PENDING`（DATA）一条。
2. 实际任务清单**展开后的触发集合**（每个任务的每个触发 × 该任务类型）必须与上述集合**精确相等**：
   - **缺项**（应有而未被任何任务触发）⇒ 拒，报「任务覆盖缺失」；
   - **多项**（出现规则派生集合之外的 `(条目, 类型)`）⇒ 拒；
   - **重复**（同一 `(条目, 类型)` 出现在多条任务）⇒ 拒。
3. **每条任务的触发集合必须非空**（`count ≥ 1` 且 `triggers[]` 非空）——只拒绝"空清单"拦不住"少一条任务／少一个触发"。

## B4. 去重分组与合并结果必须与规则一致

- 分组键 = `(cellId, taskType, era, caveatSig(caveats))`；其中 `caveats` 由 `expectedTaskCaveats(entry, taskType)` 决定（**生成与核验共用**）。
- **分组键集合**必须与规则派生的任务集合**精确一致**：多一个分组键（非法分组）或少一个分组键（合并结果不完整）都拒。
- 合并任务的**触发集合**及其 `triggers[]` 里的边界声明对应关系，必须与该分组键下规则派生的条目集合逐条一致。

## B5. 计数由规则派生集合实测导出（不硬编码）

- `counts.tasks` / `counts.byType` / `counts.totalTriggers` 一律由**规则派生集合**实测得出后比对；**不得硬编码 172 或 1496**。
- 合法台账子集（单格 era1 / era2 / 两段）必须生成**相应完整**的任务子集并通过 —— 这是"没有把 172/1496 变成普遍门槛"的实测证据。
- 导出核验结果新增 **`taskCoverage`** 字段（`expectedTriggers` / `actualTriggers` / `missing` / `extra` / `duplicate` / `complete`），供页面与调用方直接说明**任务覆盖是否完整、缺了什么**。

## B6. 验收（本轮实测）

1. 复验提出的**四个遗漏反例在同步重算摘要后全部被拒**，错误指向**缺失覆盖 / 空触发 / 非法分组**（不是"摘要未同步"）。
2. **原七例继续拒绝**；正常 **748 条差值 / 34 条拒收 / 172 项任务 / 1496 次触发**保持正确。
3. **合法台账子集**（单格 era1 / era2 / 两段）产生相应完整任务子集并通过。
4. 真实浏览器**文件导入验证**：导入被删任务的清单时，提示须**说明任务覆盖缺失**（而非仅"摘要不符"）。
5. 显式升台账版本并保留 v1.1 清单；共享模块按**实际受管文件**影响升版。
6. 科研 CSV、A2、既有 bundle/pin、816 记录、9 主张、模型、冻结六件、D3 与历史登记**不变**；不发交易、不读私钥；**真实参与者试用继续标"未执行"**。

---

## C. v1.3 修订段（2026-10-19）：外部定位参数

> 本节是**追加修订**，以上 v1.0–v1.2 正文原文保留。冲突处以本节为准。

### C1 背景

集成研究工作台（`web/workbench.html`）需要提供「进入该对象已有变化台账」的路径。原页面只能通过下拉框手工选择，
**没有**可携带定位信息的入口；若按钮只做页面跳转，进入后对象选择会丢失 —— 这是必须消除的缺陷，而不是可以接受的近似。

### C2 语义（只做定位，不建立第二条计算链）

1. 页面接受 `?cell=<cellId>&era=<1|2>&year=<YYYY>` 三个参数，**仅此三个**。
2. 参数**只承载定位信息**：不接受数据、来源摘要、核验结论或任何可覆盖台账结果的值；未知参数一律拒绝。
3. 定位后，台账**仍由本页按既有规则独立重算并核验**（`buildLedger` / `verifyLedger` / `buildTaskList`），
   不复用来源页的任何数值或结论。
4. 参数**不进入**任何摘要域：`sourceRef`、`ledgerSha256`、任务清单与导出件均不因定位方式不同而变化。

### C3 失败关闭

| 情形 | 行为 |
|---|---|
| 未知 `cell` | 拒绝，报「未知格」，回退到默认定位（首格 / era / 2012） |
| 未知或非法 `year` | 拒绝，报「未知年份」/「年份格式非法」 |
| `era` 不在 `{1,2}` | 拒绝，报「未知时段」 |
| `era` 与 `year` 不一致（如 `era=2&year=2008`） | 拒绝，报「时段与年份不一致」 |
| 出现其它参数 | 拒绝，报「不支持的参数」 |

拒绝时**必须**在页面上写出拒绝原因与回退后的实际定位；**不得**静默忽略参数、也不得显示成"定位成功"。
参数全部合法时，页面同样写出一条「已按链接定位」的提示，说明台账仍独立重算。

### C4 实现与接口

- `web/change_core.js` 新增纯函数 `parseLocateParams(search, {cells, years, eras})` → `{ok, present, applied, cellId, era, year, rejected[]}`；
  `LOCATE_PARAMS` 导出声明的参数集。
- `web/changes.js` 新增 `applyLocateFromUrl()`，**仅在首次成功载入台账后**应用一次；后续手动导入文件不再套用 URL 参数。
  `window.__changes.applyLocate(search?)` 供验证驱动调用。
- **不改**任何差异计算、门禁、任务派生或导出规则。

### C5 验收（实测见 `audit/workbench_v1_2026-10-19/ACCEPTANCE.md`）

1. 从工作台点「在变化台账中定位此研究格」后，台账页选中格 / era / 年与工作台一致。
2. 手工构造非法参数（未知格、跨段组合、多余参数）⇒ 页面显示拒绝原因并回退，**不**显示成功态。
3. 定位与否，`ledgerSha256` 与任务清单计数完全一致（参数不进入摘要）。


## D. 台账呈现 v1.4（2026-10-23）

英文演示与样式升级，仅修改 changes.html / changes.js 并新增 changes.css，复用 ui_en.js。核心 change_core.js、NppEntryCore、科学 bundle/pin、台账/任务/导出 schema、摘要域和既有核验规则保持原样。UI v1.4 不表示导出协议升版。

英文界面保留定位、相邻年条目、拒收集合、四维门禁、逐条 canSay/cannotSay 限制、完整规则派生任务导出、现场重算及导入检查。原始固定声明与诊断在标识为原文的折叠区保留，下载 JSON 不翻译、不重签。任务表显示当前格的条目，导出始终为全量规则派生清单；部分导出仍不支持。输入被拒时不采用新内容，明确报告上一份已核验台账是否仍在显示。

本轮呈现文件同时纳入工作台 v1.2 的 17 文件清单；独立的台账 UI v1.4 清单另存 audit/ui_refresh_2026-10-23/。旧契约段和历史验收原文保留，不将英文翻译当作科学采信升级。
