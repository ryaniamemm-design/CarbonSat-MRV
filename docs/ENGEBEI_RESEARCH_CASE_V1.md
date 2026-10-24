# 恩格贝独立研究案例 · 契约 v1.0

模块：`CarbonSat-EngebeiResearchCaseModule` · 契约版本 **v1.0**（2026-10-16）
案例 ID：`engebei_paper_window_v1`
范围版本：`engebei-research-window-v1`
方法版本：`CarbonSat-NPP-Production-Integral-Engebei-v0.1`

> 本契约是**本轮冻结口径**。落盘后即按此实现；实现与契约冲突处**以契约 §3–§7 为准**，如需偏离必须显式记录并升版本。
> **本案例只是「有真实公开来源的研究窗口 + 其上的模型 NPP 碳生产量」**，不是项目边界、不是治理小班、不产生碳量或信用量。

---

## §1 研究对象：四种对象必须分开（A1）

| 对象 | 含义 | 本案例的立场 |
|---|---|---|
| **恩格贝镇** | 行政区划单元 | **不使用**。行政区划矢量不等于治理对象 |
| **恩格贝生态示范区** | 管理主体所辖示范区域 | **未取得**正式矢量；仅作背景与管理线索 |
| **论文研究区** | 公开论文中报告的研究范围 | **本案例采用的对象**（且仅取其**报告经纬范围**） |
| **实际治理项目 / 小班** | 具体地块边界 | **未取得**。**不得**由前三者反推 |

**禁止**：把这四种对象自动视为同一区域；仅凭 POI、镇中心坐标、面积报道或示意图反推正式边界。

## §2 范围来源与性质（A2/A3）

### 2.1 选定的范围

**恩格贝相关论文报告范围研究窗口**（矩形）：

```
W = 109.288888889°E   S = 40.308333333°N
E = 109.466666667°E   N = 40.438888889°N
```

来源：IEEE Access 论文 DOI `10.1109/ACCESS.2023.3255879`（作者版）报告研究范围为
`109°17′20″–109°28′00″E、40°18′30″–40°26′20″N`，论文自报约 **200 km²**。

**统一标注（页面与导出件必须逐字出现）**：

> 恩格贝相关论文报告范围研究窗口，非官方项目边界，非治理小班边界。

### 2.2 度分秒换算复核（六项检查，逐项留档）

| # | 检查项 | 结果 |
|---|---|---|
| 1 | 原文坐标及度分秒转换 | 109°17′20″ = 109 + 17/60 + 20/3600 = **109.288888889**；109°28′00″ = **109.466666667**；40°18′30″ = **40.308333333**；40°26′20″ = **40.438888889**（由脚本重算，见 `verify_engebei_case.js`） |
| 2 | 经度 / 纬度顺序 | 按原文「先经后纬」：109.29…–109.47… 为经度、40.31…–40.44… 为纬度；**W<E 且 S<N**，不交换 |
| 3 | 坐标系 | 论文未给 CRS；本案例按 **WGS84 地理坐标**（度）解释，计算时统一投到 `SR-ORG:6974`（见 §3） |
| 4 | 范围是否闭合、是否有效 | 四点闭合矩形；`W<E`、`S<N`、均在合法经纬范围内（脚本 fail-closed 校验，见 §6 反例 1） |
| 5 | 报告面积与所选窗口面积是否同口径 | **不是同一口径，保留差异**：论文自报 ≈ **200 km²**；本窗口按 WGS84 椭球测地面积推算 ≈ **218 km²**（量级一致、差 ≈ 9%）。**不自行"纠正到合理值"**，两者并列留档，标注**待核**（论文的 200 km² 可能对应其实际研究区形状而非外接矩形） |
| 6 | 与既有 34 格的空间关系 | 既有 34 格包围盒 = `[107.72, 40.07, 109.18, 40.53]`；本窗口西界 109.288889 > 109.18 ⇒ **相交数 = 0**（包围盒筛查，非矢量的拓扑核验）。**这是本案例必须独立建流的直接依据** |

### 2.3 来源登记（A3，逐项字段）

每项关键来源必须记录：标题、作者或发布机构、日期、准确 URL 或 DOI、访问日期、原文位置或页码、取得程度（已取得全文 / 官方转载 / 摘要 / 二手材料）、本轮**实际使用了什么**、它能支持**与不能支持**什么。
下载文件在许可允许时保存原件与 SHA256；**无法取得全文则明确标注，不得写成已全文核查**。

完整来源清单见 `audit/engebei_research_case_2026-10-16/SOURCES.json`（本轮随实现一并登记）。

### 2.4 范围能成立就继续开发

范围有公开来源、可复算、可标注性质 ⇒ **继续开发**。**不因缺少项目权属材料而停止公开研究主线**；但**不得**据此开展项目级资格判断、治理归因或信用核算。

## §3 时间、产品、单位、掩膜与积分（B2）

| 项 | 值 |
|---|---|
| 时间范围 | **2001–2024**（24 年） |
| 产品 | `MODIS/061/MOD17A3HGF`（NASA MOD17A3HGF v6.1），波段 **`Npp`** |
| 缩放 | `NPP_SCALE = 0.0001` ⇒ kg C·m⁻²·yr⁻¹（不盲抄旧报告简称，按产品波段定义） |
| 有效值掩膜 `engebei_npp_valid_mask` | 原始 DN ∈ **[-30000, 32700]**；**排除** NASA C6.1 七特殊填充码 **32761–32767**；**保留**范围内的**零值与负值** |
| 投影与尺度 | `crs = SR-ORG:6974`、`scale = 500`、`bestEffort = false`（计数、面积、积分同网格） |
| 积分方式 | `integral_kgC_yr = Σ_pixels( NPP_scaled × pixelArea )` over `engebei_npp_valid_mask`；`prod_tC_yr = integral_kgC_yr / 1000` |
| 单位 | **tC/yr**，**模型年度 NPP 碳生产量** |

**明确禁止（B2）**
1. 像元计数 × 固定 250000 m² 代替逐像元测地面积；
2. NPP 累加推算碳储量；
3. NPP 直接折算碳信用或 tCO₂e；
4. 缺测填 0；
5. 仅取区域有效部分之和冒充全部区域生产量（**结果名称必须反映其范围**）。

## §4 三个「面积」与三个「状态」不得混用（B4）

**三个面积量（并列输出，不可混）**

| 字段 | 含义 |
|---|---|
| `geomAreaM2` | 窗口矢量测地面积 |
| `gridAreaM2` | 窗口内**全部**栅格像元面积和（`pixelArea` 求和） |
| `gridValidAreaM2` | 窗口内**有效掩膜**栅格面积和 |
| `validAreaRatio` | `gridValidAreaM2 / gridAreaM2` —— **栅格有效面积比例**（**不称**逐年观测质量，**不称** QC 掩膜损失） |

**三件事必须分开陈述（B4）**
1. **24 个年份是否全部取得**（数据获取）；
2. **每年计算是否成功**（计算状态）；
3. **每年窗口内有多少面积存在有效产品值**（`gridValidAreaM2` / `validAreaRatio`）。

> **取得 24 年结果 ≠ 窗口每年均被有效产品值覆盖**；**固定掩膜 ≠ 逐年观测质量**。
> 若某年只有部分有效面积，结果名称必须体现「**该年有效产品足迹上的碳生产量**」，**不得**声称覆盖全部研究窗口。

## §5 缺测与失败语义（fail-closed）

| 情形 | 语义 |
|---|---|
| `validPixels == 0`（全掩膜或填充码） | 该格年 `prod_tC_yr = null`、`missing = true`、`missingReason` 记原因；**绝不填 0** |
| 年度合计 | 仅当该年**所有年份字段可用**时给出；任一年缺失/非有限 ⇒ **该年合计为 null**，**不输出部分和** |
| `prod_tC_yr` 或 `integral_kgC_yr` 为空 / NaN / ±Inf | **INCOMPLETE**（fail-closed） |
| `missing = true` 却仍带数值 | **INCOMPLETE**（矛盾行不得计入） |
| `missingReason` 与 `missing` 不一致 | **INCOMPLETE** |
| 年份重复 / 年份遗漏 / 年份越界 | **INCOMPLETE** |
| 单位链不一致（`prod ≠ integral/1000` 超容差） | **INCOMPLETE** |
| 有效面积为 0 却给出生产量 | **拒绝**（反例 5） |
| 暂时性网络故障 | 记 `FETCH_ERROR` 并**有限重试**；**不得**记为产品缺测（反例 13） |
| 认证失败 / 持续失败 | 记 `AUTH_ERROR` / `PERSISTENT_FAILURE`，**留档并继续其他不依赖在线取数的工作**；**不得补造结果或宣称全量完成** |

## §6 数据流、来源绑定与导出范围（B1/D）

**独立性（B1）——禁止**
- 把现有 34 格改名为恩格贝；
- 把现有 816 条记录复制后换标签；
- 把恩格贝结果**自动链接**到 9 条主张；
- 让新产物进入旧证据包文件集合、意外改变历史包哈希。

**允许**：复用已验收的**计算逻辑**，但必须保留新案例**自己的范围与来源承诺**。

**数据流**

```
（只读）GEE MODIS/061/MOD17A3HGF
   → scripts/engebei_npp_integral.py  (--probe / --run)
   → data/engebei/engebei_npp_annual_integral.csv      （逐格年原始导出，含取数状态）
   → scripts/build_engebei_bundle.py
   → web/engebei_bundle.json + web/engebei_bundle.pin.json   （页面只读产物 + 已发布摘要 pin）
   → web/engebei.html / engebei.js / engebei_core.js          （浏览器内重算 + 导出）
```

**四层来源证明（互不代替，D）**

| 层 | 含义 | 本案例 |
|---|---|---|
| ① | 内部结构、关系与摘要一致 | 浏览器/CLI 重算条目与全表摘要 |
| ② | 与**独立发布摘要或可信期望值**一致 | `engebei_bundle.pin.json`（脚本派生，**禁手打哈希**） |
| ③ | 从**本地源文件**独立复算 | `scripts/verify_engebei_case.js` 直接读 CSV 独立复算（**不复用生产函数**） |
| ④ | 原始来源真实性及科学精度验证 | **本案例不做**，恒记「未核验」 |

**稳定摘要不含运行时间**；运行事件（时间戳）放在独立封套。
**缺字段、非法值、单位冲突、年份遗漏、来源错配必须失败关闭**；**自摘要重算后仍须核对语义与关系**，不能只判断哈希是否自洽。

**导出范围**：研究窗口及窗口来源、实际输入与产物版本、计算参数与方法版本、当前导出的年度记录与选择范围、必要局限与禁止结论。**不含**碳量、信用量、治理归因。

**本轮不做**：不增加公共链交易、不接入新 Merkle 叶集、不使用 IPFS。

## §7 可以声称 / 不能声称

**可以声称**
- 「本窗口是**恩格贝相关论文报告范围研究窗口**，非官方项目边界、非治理小班边界」；
- 「在**该窗口的有效产品足迹上**，MOD17 模型给出的**年度 NPP 碳生产量**为 X tC/yr（某年）」；
- 「该年为模型值；有效面积比例为 Y」。

**不能声称（一律禁止）**
- 碳汇 / 碳增汇 / 净碳汇 / 碳储量 / 碳信用 / 碳减排；
- 治理成效、治理归因、「谁增汇更多」；
- 精度、误差、准确率、检出率、置信区间；
- 本文窗口 = 恩格贝镇 / 示范区 / 治理项目 / 小班边界；
- 「整包已上链」「已完成外部验证」「已完成科学精度验证」；
- 跨 2012 的差分 / 增长率 / 整体趋势 / 「恢复幅度」（2012 附近**同步结构性断点、成因未证实**，须**按分析时段分段**）；
- 把面积数值相等读作**有效像元位置一致**（足迹同一性恒 `UNVERIFIED`）。

**案例间比较的边界（C4）**：允许用户**分别查看**两个案例；**本轮不开展**两案例总量排名、治理成效比较或「谁增汇更多」。不同范围面积不同，**总量大小不能直接解释为生态表现优劣**。

## §8 三种交付状态（必须显式区分）

| 状态 | 判据 | 允许的对外表述 | 不允许 |
|---|---|---|---|
| **`COMPLETE`（完整案例）** | 24/24 年**全部取得且计算成功**；窗口覆盖状态逐条明确；单位链与范围绑定复算通过 | 可给年度序列与逐年有效面积比例 | 不得省略「模型值 / 研究窗口 / 有效足迹」限定 |
| **`PARTIAL`（部分成功）** | 部分年份取得或计算成功，其余记为 `FETCH_ERROR` / `AUTH_ERROR` / `PERSISTENT_FAILURE` | 只能逐条列出**已成功年份**的数值与状态 | **不得**声称全量完成、不得插值补造、不得把失败年填 0 |
| **`FAILED`（失败）** | 认证不可用 / 持续故障 / 关键口径无法核实 | 只交付**可运行入口 + 计算脚本 + 明确的待取数状态 + 恢复命令** | **不得**写成「恩格贝数据接入完成」 |

> 本轮交付状态以 `data/engebei/engebei_fetch_status.json` 与验收文档为准，**不预设、不美化**。

## §9 版本与升版纪律

- 新案例**独立版本化**（`CarbonSat-EngebeiResearchCaseModule-v1.0`，独立文件清单）。
- 改动共享受管文件（`web/entry.html`、`scripts/check_web_syntax.js`、`scripts/run_all_gates.ps1`）时，按**实际影响**升级单地块与估算模块并**保留旧清单**；**变化台账清单不含这些文件 ⇒ 不升版**。
- **受管文件全部定稿后再生成清单**，不反复先签后改。
- 不制作 D4，不刷新历史链上报告与截图。

---

# 附：v1.1 修订契约（2026-10-16，按独立限定审阅 REPORT 的四组 P1 修正）

> 触发：`audit/engebei_independent_review_2026-10-16/REVIEW.md`（**原件与探针未改动**，另存 `original_evidence/`）。
> 该审阅**未发现 P0**，确认「恩格贝已经实际接入」、正常 CSV 与数据包一致；只提出四组 P1 ——
> 非法内容**重签摘要后**仍能通过内部语义与关系核验（10 个独立非法输入被接受）。
> **以上 v1.0 正文原文保留**；与本节冲突处**以本节为准**。模块版本 **v1.0 → v1.1**；旧清单
> `MODULE_MANIFEST_v1.0.json` 与 v1.0 验收原文**保留不覆盖**。
> **读法**：「正常数值算得对」与「非法导入必被拒」是两件事；v1.0 只做到了前者。

## E1. 版本与协议（v1.1）

| 项 | v1.0 | v1.1 |
|---|---|---|
| 数据包 schema | `CarbonSat-EngebeiCaseBundle-v1.0` | `…-v1.1` |
| 导出 schema | `CarbonSat-EngebeiCaseExport-v1.0` | `…-v1.1` |
| pin schema | `CarbonSat-EngebeiCaseBundlePin-v1.0` | `…-v1.1` |
| 模块版本 | `CarbonSat-EngebeiResearchCaseModule-v1.0` | `…-v1.1` |
| 数据包稳定摘要域 | `…|engebei-bundle|v1\n` | `…|v2\n` |
| 导出稳定摘要域 | `…|engebei-export-stable|v1\n` | `…|v2\n` |
| **窗口哈希域** | `…|engebei-window|v1\n` | **保持 `v1`（不改）** |

**窗口哈希域故意不升版**：`data/engebei/engebei_npp_annual_integral.csv` 的 `windowSha256` 列是
**本轮明文要求保持不变**的科研产物；窗口承诺（caseId / 窗口版本 / 四至 / CRS / 标注 / 性质）本轮**一字未改**，
故窗口哈希必须逐位不变。升版仅限于**可变产物**（bundle / 导出件）。

v1.0 产物在 v1.1 核验下一律报「版本不符」（预期，不是回归）。

## E2. P1-1：数值与元数据必须按状态真正核验

v1.0 多处只在「值有限」时才核对，缺字段被当作「跳过」，于是 `null` 有效面积、比例与面积不符、
行内投影/尺度与顶层方法矛盾、交付年份数组与 24 条记录矛盾**都能通过**。v1.1：

1. **按状态规定必填类型、有限值与取值域**：
   - **正常有效行**（`computeStatus = OK` 且 `missing = false`）：`prod_tC_yr` / `integral_kgC_yr` 有限；
     `geomAreaM2`、`gridAreaM2`、`gridValidAreaM2` **均为有限正数**；`gridValidAreaM2 ≤ gridAreaM2`；
     `validPixels` 为**正整数**；`validAreaRatio` 有限且 `0 < ratio ≤ 1`；`nppRawMean` 有限；
     `nppNegPixels` 为**非负整数且 ≤ validPixels**。
   - **`OK` 但 `missing = true`**：`prod_tC_yr` / `integral_kgC_yr` 必须为 `null`；
     `validPixels` 必须为 `null` 或 `0`；覆盖状态必须为 `NO_VALID_PIXELS`。
   - **取数失败行**（`FETCH_ERROR` / `AUTH_ERROR` / `PERSISTENT_FAILURE`）：`prod_tC_yr`、`integral_kgC_yr`
     及**全部栅格派生量**（`gridAreaM2` / `gridValidAreaM2` / `validAreaRatio` / `validPixels` /
     `nppRawMean` / `nppNegPixels`）必须为 `null`（**不得部分补造**）；`missing` 必须 `true`；
     `missingReason` 非空；覆盖状态只能为 `NO_VALID_PIXELS` 或 `UNKNOWN`。
     `geomAreaM2` 是矢量属性，允许为 `null` 或有限正数。
   - **不得以补零解决缺项**；缺字段 / 类型不符 / 越界一律拒。
2. **面积比例由面积重算**：`validAreaRatio` 必须等于 `gridValidAreaM2 / gridAreaM2`（`RTOL_NUMERIC = 1e-9`，
   仅数值一致性口径）。比例与面积矛盾 ⇒ 拒。
3. **逐项核对记录与方法的参数**：`records[*].product / mask / crs / scale / method_version` 必须分别等于
   `methodology.productVersion / maskName / crs / pixelScaleM / methodVersion`；
   `methodology` 本身必须等于**权威常量表**（产品集合、版本、波段、比例因子、掩膜名、有效值域、CRS、
   像元尺度、积分式、单位、方法版本、era 断点、容差语义）。行内改投影或尺度而顶层不变 ⇒ 拒。
4. **交付年份集合与计数从记录重建**：`delivery.yearsOk` / `yearsFailed` / `totalYears` 必须**逐项等于**
   由 `records[*].computeStatus` 重建的结果；`delivery.state` 仍按既有规则重建比对。
5. 覆盖状态、`counts.*` 继续由记录**实测导出**后比对（v1.0 已有，保留并加严类型）。

## E3. P1-2：必要局限必须是版本化固定声明，不能只做关键词

v1.0 把「必备语句」实现成「关键词出现即通过」，于是**用关键词串替换整套声明**仍通过，且
**正向越界结论（已签发碳信用 / 已完成科学精度验证 / 整包已上链）写进 `canSay`** 也通过。v1.1：

1. **版本化固定声明**：`boundary.declarationVersion` 必须等于 `engebei-boundary-declaration-v1.1`；
   `canSay` / `cannotSay` / `limitations` / `forbiddenOutputs` 必须与该版本下的**固定声明逐条、逐字相等**
   （顺序也一致）。**删减、改写、替换为关键词串一律拒**，与是否重签摘要无关。
2. **结构化能力标志交叉核对**：`claimClass = DESCRIPTIVE_NPP_ONLY`、`attributionStatus = insufficient_evidence`、
   `registrable = false`、`removalCount = 0`、`claimsLinked = false`、`evidenceRecordsLinked = false`、
   `footprintIdentity = UNVERIFIED` 逐项固定。
3. **禁述扫描只作补充，且必须扫到声明本体**：对 `canSay` / `cannotSay` / `limitations` **逐句**扫描
   正向禁述词面（碳汇 / 碳增汇 / 净碳汇 / 碳储量 / 碳信用 / 碳减排 / tCO2e / 准确率 / 精度 / 误差 /
   检出率 / 置信区间 / REMOVAL / 增汇 / 上链）；若某句**不含任何否定/限制标记**却出现这些词面 ⇒ 拒。
   （既有的动态文本扫描保留，并**修正为扫描原文**——v1.0 误用规范化后的转义串，专有名词被 `\uXXXX`
   转义 ⇒ 该扫描实际从未命中中文词面。）
4. **无独立 pin 时也必须拒绝内部越界内容** —— 边界语义判定与 ② 层无关。

## E4. P1-3：可信 pin 必须齐备且身份对应

v1.0 把「摘要是否存在」当可选条件，条件未触发就落入 MATCHED 分支，于是
**只有 schemaVersion 的空 pin** 与**caseId / windowSha256 被换成别的对象**的 pin 都报 MATCHED。v1.1：

1. **pin 精确键集**：`schemaVersion`、`caseId`、`bundlePath`、`bundleFileSha256`、`stableDigest`、
   `windowSha256`、`csvSha256`、`deliveryState`、`generatedAtUTC`、`generator`、`note`、`pinSha256`；
   缺键 / 多键 ⇒ 该 pin **判为不完整**（`NOT_EVALUATED` + 错误），**绝不 MATCHED**。
2. **版本与格式**：`schemaVersion` 必须等于 pin schema；`stableDigest` / `windowSha256` / `pinSha256`
   必须是 `local-sha256:` + 64 位十六进制；`bundleFileSha256` / `csvSha256` 必须是 64 位十六进制。
3. **身份对应**：`pin.caseId` 必须等于本案例 ID；`pin.windowSha256` 必须等于本包窗口哈希；
   `pin.csvSha256` 必须等于本包 `sourceRef.csvSha256`；`pin.deliveryState` 必须等于本包 `delivery.state`。
   任一不符 ⇒ `MISMATCHED` 且拒。
4. **必需摘要对应**：`pin.stableDigest` 必须等于本包**重算**的稳定摘要；缺该摘要 ⇒ 不得 MATCHED。
5. **内容匹配与文件字节匹配分列报告**：`contentMatch`（案例身份 + 窗口 + 内容摘要 + 源 CSV 摘要）
   与 `fileBytesMatch`（`pin.bundleFileSha256` ↔ 调用方提供的文件字节摘要）**分别给出**；
   只有二者可比且一致时才声称「内容 + 文件字节」均匹配；文件字节未提供/不可比时明确记为**未比对**。
6. `provenance` ② 层状态文字必须反映上述区分（不允许出现「MATCHED」而后文又说未比对文件的歧义）。

## E5. P1-4：导出外层身份必须与内含数据包绑定

v1.0 的 `verifyExport` 只核验内含 bundle 自洽，不核对外层 `stable.caseId` / `stable.windowSha256`；
`stalenessOf` 也只比外层窗口摘要，于是**外层身份与内含包矛盾**、**内含窗口被改而外层保持旧窗口摘要**
都通过，甚至传入真实当前窗口摘要仍报 `same = true`。v1.1：

1. **导出根 / stable 精确键集**（已有，保留）。
2. **外层身份逐项对内核对**：`stable.schemaVersion` = 导出 schema；`stable.caseId` = 内含 `bundle.caseId`；
   `stable.windowSha256` = 内含 `bundle.windowSha256`；不符 ⇒ 拒。
3. **当前版本判断绑定实际源产物身份**：`verifyExport` / `stalenessOf` 接受当前上下文
   `{ windowSha256, csvSha256, stableDigest }`，并**与内含 bundle 的对应字段**比较（不再只信外层窗口摘要）。
4. **「同窗口」与「同一来源产物版本」分开报告**：即使窗口一致，若源 CSV 摘要或内容摘要不同，也必须
   分别说明，**不得**把「同窗口」称为「同一来源产物版本」。

## E6. 来源补记：公开作者版本（区分作者接受稿与出版定稿）

独立审阅联网打开 ResearchGate 论文页面，取得该 DOI 对应的**作者接受稿（accepted author version）**
网页全文文本，其 II.A（Study Area）确载 `109°17′20″–109°28′00″E；40°18′30″–40°26′20″N`，约 200 km²。
链接（检索/访问日期 2026-10-16）：

`https://www.researchgate.net/publication/369152366_Research_on_the_Establishment_of_Carbon_Inversion_Model_in_Engebei_Ecological_Demonstration_Area_of_the_Kubuqi_Desert_Based_on_Remote_Sensing_Data`

- **已取得**：公开网页**作者接受稿全文文本**（页面自述 "accepted… author's version… not fully edited"）。
- **未取得**：**出版定稿 PDF**（DOI 入口本次工具访问失败）⇒ **不得**声称出版定稿已取得。
- **不改研究窗口性质**：本窗口仍为「论文报告范围研究窗口，非官方项目边界，非治理小班边界」；
  矩形面积**不等于**论文不规则研究区面积；**不产生** NPP 真值；**不提供**正式项目矢量。
- 登记落点：`sourceRef.paperKind`、`sourceRef.paperAccessLevel`、`sourceRef.paperAuthorVersionUrl`、
  `sourceRef.paperVersionNote`。

## E7. 验收（本轮实测）

1. 复验提出的 **10 个非法输入在同步重算摘要后全部被拒**，原因指向**语义或关系**（不是「摘要未同步」）。
2. **正常件**与**合法零值/负值**对照仍被接受；`validAreaRatio ≈ 0.9311618297166796`、
   `prod` 2001 = `13318.372381792975`、2024 = `30780.13401430004` **逐值不变**。
3. **可信 pin 正反例**：齐备 pin ⇒ `MATCHED`（并分列内容/文件字节）；空摘要 pin ⇒ 不得 MATCHED；
   身份错配 pin ⇒ `MISMATCHED` 且拒。
4. **直接核验非法导入件**：把重签后的非法导出件/非法数据包**绕过构建端**直接交给生产核验器 ⇒ 仍拒。
5. **真实浏览器**导入正常件与非法件，页面提示与**状态失效**处理正确。
6. **不改**科研 CSV 与 24 年数值（CSV SHA256 `e842bfc2…` 不变）。
7. 显式升恩格贝模块版本并保留 v1.0 清单；共享模块按**实际受管文件**影响升版。
8. 旧 34 格、816 记录、9 主张、模型、冻结件、D3 与历史链上登记**不变**；**不发交易、不读私钥**。

---

# 附：v1.2 修订契约（2026-10-16，前置基础加固轮 · 自述字段固定声明）

> 触发：前置基础加固轮的**来源绑定与导出完整性**独立探针
> `audit/preparatory_hardening_2026-10-16/probe_selfdeclared_fields.js`（结果 `selfdeclared_fields_probe.json`）。
> **v1.1 正文原文保留**；与本节冲突处**以本节为准**。模块版本 **v1.1 → v1.2**；旧清单
> `MODULE_MANIFEST_v1.0.json`、`MODULE_MANIFEST_v1.1.json` 与 v1.0/v1.1 验收原文**保留不覆盖**。

## E8. 缺口：自述字段不被核验，且污染随导出件外流

v1.1 已把「**必要局限**」升级为版本化固定声明（`boundary`，E3），并把数值、元数据、pin、导出外层身份
逐项纳入核验（E2/E4/E5）。但数据包与导出件中还有**一整类叙述字段**从不参与核验，构建端也**原样带出**：

| 字段 | 落点 | v1.1 行为 |
|---|---|---|
| `caseTitle` | bundle 顶层 | 不核验，原样带出 |
| `generatedBy` | bundle 顶层 | 不核验，原样带出 |
| `selfDigestNote` | bundle 顶层 / 导出件 | 不核验，原样带出 |
| `scopeNote` | bundle 顶层 / 导出件 | 不核验，原样带出 |
| `provenance`（4 层）| bundle 顶层 / 导出件 | 不核验，原样带出 |

**独立探针实测（6 例，同步重签摘要后）**：

1. `provenance` ④ 层状态改写为「已核验（外部权威版本比对通过）」⇒ **接受**；
2. `provenance` ① / ② / ③ 三层全部改写为「已通过」⇒ **接受**；
3. `selfDigestNote` 写成「本包已与外部权威版本逐字节比对并通过」⇒ **接受**；
4. `scopeNote` 写成「本包已上链」⇒ **接受**；
5. `caseTitle` 改写 ⇒ **接受**；
6. `generatedBy` 改写 ⇒ **接受**。

更严重的是：**被污染的自述字段随导出件外流**——把改写后的数据包塞进导出件，`verifyExport` 仍报
`exportAccepted: true`（探针 `exportCarriesUncheckedNote`）。这与 E3 的教训**同类**：**「字段存在 ≠ 语义有效」**；
只冻结「局限」而放任「自述」⇒ 编号越高、越像结论的字段反而无人把守。

## E9. 修复：自述字段也是版本化固定声明

`web/engebei_core.js` 新增 **`engebei-provenance-declaration-v1.2`** 固定声明，对下列内容**逐字比对**：

1. `caseTitle` = `恩格贝研究案例（论文报告范围研究窗口）`；
2. `generatedBy` = `scripts/build_engebei_bundle.py`；
3. `selfDigestNote`、`scopeNote` 逐字等于 v1.2 固定串（不得出现"已核验/已上链/已与外部权威版本比对"等越界措辞）；
4. `provenance` 必须恰为 **4 层**，每层**精确键集** `{level, name, status}`，`level`/`name` 逐字相等，
   `status` 按 `canonicalBits` **逐位相等**——**不得**把 ④（原始来源真实性与科学精度）写成"已核验"。

核验函数 `verifySelfDescription(bundle, errors)` 在 `verifyBundle` 内于 `verifyBoundary(...)` 之后调用；
`build_engebei_bundle.py` 使用**同一组常量**（`CASE_TITLE` / `SELF_DIGEST_NOTE` / `SCOPE_NOTE` / `PROVENANCE`），
`check()` 的比对键集扩充为
`(schemaVersion, caseTitle, generatedBy, selfDigestNote, scopeNote, provenance, windowSha256, sourceRef, records, counts, delivery)`。

## E10. 版本与协议（v1.2）

| 项 | v1.1 | v1.2 |
|---|---|---|
| 数据包 schema | `CarbonSat-EngebeiCaseBundle-v1.1` | `…-v1.2` |
| 导出 schema | `CarbonSat-EngebeiCaseExport-v1.1` | `…-v1.2` |
| pin schema | `CarbonSat-EngebeiCaseBundlePin-v1.1` | `…-v1.2` |
| 模块版本 | `CarbonSat-EngebeiResearchCaseModule-v1.1` | `…-v1.2` |
| 数据包摘要域 | `…\|engebei-bundle\|v2\n` | `…\|v3\n` |
| 导出 stable 域 | `…\|engebei-export-stable\|v2\n` | `…\|v3\n` |
| pin 域 | `…\|engebei-pin\|v2\n` | `…\|v3\n` |
| **窗口哈希域** | `…\|engebei-window\|v1\n` | **`…\|v1\n`（故意不变）** |
| 新增固定声明 | — | `engebei-provenance-declaration-v1.2` |

> **窗口哈希域保持 v1 是有意为之**：科研 CSV 内含 `windowSha256` 列，是**已冻结产物**；改域会改变全部
> 记录中的窗口摘要，等同改动科研数值 ⇒ **禁止**。本次只升 bundle / export-stable / pin 三个域。
> v1.0/v1.1 产物在 v1.2 核验下一律报「版本不符」（预期，不是回归）。

## E11. 验收（本轮实测）

1. 新增 `scripts/verify_engebei_case.js` **E 组**（`rejectSelf()`，E1–E8）：正例逐字相等、`provenance` ④ 改写、
   整表改写为 PASS、删一层、`selfDigestNote` 越界、`scopeNote` 越界、`caseTitle`/`generatedBy` 改写、
   **手写导出件**（绕过 `buildExport` 的构建期校验）内含污染自述 ⇒ **全部被拒**。实测 **53/53 PASS**。
2. `test/engebei_case.test.js` 新增「v1.2 · 自述字段固定声明」共 4 个用例（含"无 pin 时也拒"）⇒ 实测 **38 passing**。
3. 重建 `web/engebei_bundle.json` + pin 成功；`stableDigest = local-sha256:a2bbf605…`、
   `bundleFileSha256 = 077a0723…`；**科研 CSV 与 24 年数值逐位不变**（CSV SHA256 `e842bfc2…`、
   `windowSha256` 均未变）。
4. `validate` 键集扩充后，正常件、合法零值/负值对照仍全部通过。
5. 模块受管文件**仍 18 项**（本轮未新增文件，仅改内容）；清单升 `MODULE_MANIFEST_v1.2.json`，旧两版保留。
6. 旧 34 格、816 记录、9 主张、模型、冻结件、D3 与历史链上登记**不变**；**不发交易、不读私钥**。
