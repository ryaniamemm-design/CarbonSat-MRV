# 地上生物量碳储量情景试算 v0.2（P1 契约）

模块验收版本：CarbonSat-AgbScenario-**v0.2**（原 v0.1 已归档，见 `audit/estimation_fix_2026-10-13/`）。
契约版本：`CarbonSat-AgbScenario-v0.2`；规则/协议 `CarbonSat-AgbScenarioRules-v0.2`；包 `CarbonSat-AgbScenarioPackage-v0.2`。

本文件是 **先写契约、再实现** 的契约部分。它定义一个**独立的、可复算的**地上生物量（AGB）碳储量**情景试算**，把"缺参数时输出补资料任务、有参数时输出带假设标签的条件结果"变成可操作页面。

## 1. 对象与量纲（唯一允许的计算式）

```
C_AGB [tC] = A_ha [ha] × B [t 干物质/ha] × f_C [无量纲]
```

- **A**：选定范围内的**水平面积**（ha），必须登记口径与来源。
- **B**：该**物种 / 植被类型、龄组、区域、时点**条件下的**地上干生物量密度**（t 干物质/ha）。**鲜重、地下量、生产力（t·ha⁻¹·yr⁻¹）或累计生长量不得混用。**
- **f_C**：干物质**碳质量分数**（无量纲），必须显式给出值、来源与适用性。**不写死未经核查的默认值。**

### 只纳入与明确未纳入

| 纳入 | 明确"未纳入/未评估"（不得按 0 伪装已处理） |
|---|---|
| 地上活生物量碳库（AGB） | 土壤有机碳、地下生物量、死木、枯落物、**木竹产品**、基准线、泄漏、非持久性、额外性 |

`excludedPools` 随结果与导出**始终显示**。

## 2. 与 P0 的硬隔离

**禁止**用以下方式代替库存：NPP 累加、`NPP × 碳分数`、`FVC × 任意系数`。
禁止恢复占位系数 `AGB_K=73.5`。
P0（年度 NPP，tC/yr，流量）与 P1（AGB 库存，tC）**页面分开、单位分列、不得相加或混称**。

## 3. 参数来源登记（每个参数一条）

| 字段 | 说明 |
|---|---|
| `parameterId` | 参数主键，唯一 |
| `value` | 数值 |
| `unit` | 单位（B：`tDM/ha` 或 `kgDM/m2`；f_C：`dimensionless`） |
| `sourceType` | `MEASURED` / `LITERATURE` / `LOCAL_SURVEY` / `DEFAULT_TABLE` / `USER_ASSUMPTION` / `SYNTHETIC` |
| `sourceReference` | 原始文件 / DOI / 标准号（**必填**才能进资料支持模式） |
| `pageOrTable` | 页码或表号 |
| `region` | 适用地区 |
| `species` | 适用物种 / 植被类型 |
| `ageClass` | 适用龄组 |
| `applicableYear` | 适用年份 / 时段 |
| `basis` | 取值依据（一句话） |
| `applicabilityStatus` | 见下表 |

### applicabilityStatus（四级，**不得混同**）

| 值 | 含义 | 可否进"资料支持的条件性试算" |
|---|---|---|
| `MEASURED_LOCAL` | 有实际测量资料（本区/本地） | 可 |
| `LITERATURE_PENDING_APPLICABILITY` | 有文献出处，但**适用性待核** | 可（**输出必须带"适用性待核"提示**） |
| `USER_ASSUMPTION` | 用户显式假设 | 否（转 `USER_SCENARIO` 模式，始终显示 `USER_ASSUMPTION`） |
| `SYNTHETIC` | 纯合成测试 | 否（仅 `SYNTHETIC` 模式） |

**不能仅因有链接就显示"适用性已验证"。** `applicabilityStatus` 为 `UNKNOWN` 或缺 `sourceReference` ⇒ 该参数视为**不完整**。

## 4. 三种模式（互斥）

| 模式 | 触发 | 输出 | 导出标签 |
|---|---|---|---|
| `DATA_SUPPORTED` | A 由几何派生（带摘要）**且** B、f_C 均含 `sourceReference`、`applicabilityStatus ∈ {MEASURED_LOCAL, LITERATURE_PENDING_APPLICABILITY}`、单位合法 | 条件结果 `conditional:true`，列出哪些参数"适用性待核" | `DATA_SUPPORTED_*` |
| `USER_SCENARIO` | 用户显式填写假设（B / f_C 任一为 `USER_ASSUMPTION`） | 情景结果，**始终**带 `USER_ASSUMPTION` 标签 | `USER_ASSUMPTION` |
| `SYNTHETIC` | 内置演示向量 | 演示结果，**始终**带 `SYNTHETIC` | `SYNTHETIC` |

- **必要面积与参数来源不完整 ⇒ 不出任何模式结果**，只输出**具体补资料任务**（见 §7）。**资料登记本身不等于真实性通过。**
- `USER_SCENARIO` / `SYNTHETIC` **不能**转为真实项目估计，**不能**删除标签后导出（包核验会拒）。
- **无合适本地参数时停止该模式**：不由 LLM 编造、不外推森林参数到沙柳/草地。

## 5. 面积（A）

- 可来自**外部 GIS 计算**，但必须登记：**几何摘要（sha256）、CRS、面积算法、单位、计算对象、文件出处**。
- **手工面积不能冒充已由几何核验**：`manual:true` ⇒ `verified:false`，并显示提示。
- 若**分层**（`areaLayers`）：逐层求和，**必须**声明覆盖与重叠核查（`overlapChecked:true`）且各层 `layerId` 唯一；否则**不得静默求和成全地块**。
- 若在本模块内由几何自动算面积：须用**经核查的测地面积算法**并独立对照；**不得**用经纬度 shoelace 或未经验证的浏览器近似面积。（v0.1 **不实现**自动测地面积，只接受登记值或外部计算结果。）

## 6. 敏感性与下一步建议（随估算一起交付）

- 用户可填**低 / 参考 / 高**参数组合（B、f_C），显示**条件结果**；三个组合须各自合理。
- **单参数扰动**：对每个参数分别取低/高、其余保持参考，显示变化量，指出**哪个参数影响最大**。
- 术语只称"**情景范围 / 参数敏感性**"，**非**置信区间、误差界或总不确定度。
- **不加入**随机分布或 Monte Carlo。
- 补测建议结合**参数来源等级 + 适用性缺口 + 敏感性**；**不能**把"影响最大"说成"测它最省钱"。
- 实际误差、区间覆盖率、治理因果效果**均保留未验证**；**不能**把情景范围窄称为高精度。

## 7. 缺项输出（禁止编数值）

参数不完整时输出**具体任务**，例如：
`补充 <参数> 的适用物种/龄组` / `补充 <参数> 的原始出处（DOI/页码）` / `登记面积几何摘要与 CRS` / `明确面积分层覆盖与重叠核查` / `确认 B 为干重、非鲜重或生产力` / `确认 f_C 单位与取值区间`。
任务**不含**任何估计值。

## 8. 校验规则（失败关闭）

1. `kg ↔ t`、`m² ↔ ha` 按**显式单位**转换；把错误单位改写并同步重算自摘要仍**拒绝**。
2. 必需值缺失、`NaN`/`Inf`、非法碳分数（≤0 或 >1）、负面积、负生物量密度、全无有效覆盖 ⇒ **不能**输出肯定结果。
3. **合法生物量 0 可保留**并输出 0；**未知缺失不能变 0**。
4. 混用 NPP（tC/yr）与库存（tC）、鲜重与干重、地下量与地上量 ⇒ **阻止**或明确要求正确输入。
5. 分层面积重复/重叠/未声明未分类范围 ⇒ **不得静默求和**。
6. 零宽、`TODO`、幽灵参数出处 ⇒ **不得**晋升为资料支持模式。
7. 改任一参数 ⇒ **立即清空**旧结果与旧核验；下载/导入**保持**来源等级、假设、计算对象与未纳入项；重算自摘要**不能删除**这些语义标签。
8. 共享计算核心与**独立第二计算**一致。
9. `REMOVAL` / `CREDIT` / `已签发量` / `tCO2e` / 库布其全区外推 **不得**由结果模板或导出产生。

## 9. 强制边界

`claimClass=DESCRIPTIVE_AGB_STOCK_SCENARIO`；`attributionStatus=not_assessed`；
`forbiddenOutputs=[REMOVAL, GOVERNANCE_INCREMENT, CARBON_CREDIT, tCO2e]`；
`netSequestrationClaim=false`；`creditIssuance=false`；`baselineAssessed=false`；`publiclyAnchored=false`。

## 10. 本地命令

```powershell
node scripts/verify_agb_package.js --selftest
node scripts/verify_agb_package.js --package path/to/agb-scenario.json
.venv-ee/Scripts/python.exe scripts/agb_independent_check.py     # 独立第二计算交叉核验
npx hardhat test test/estimation_modules.test.js
node scripts/browser_estimation_drive.js
```

预览：`http://127.0.0.1:8777/web/agb_scenario.html`。

---

## 附：v0.2 变更记录 —— 按 独立审查 P1-2…P1-5 / P2-1 / P2-3 收紧

> 触发：`historical estimation review (2026-10-13)`（原探针与原始输出未改动）。
> **仍未验证**：碳储量实际误差、区间覆盖率、治理因果效果一律未验证；本模块无任何真实地块参数。

1. **未知分层面积不得默认 0（P1-2）**。任一层 `areaHa` 为 null / 非法 ⇒ **不出全范围面积与结果**
   （阻断任务 `AREA_LAYER_INCOMPLETE`）；层之和与声明总面积不闭合 ⇒ `AREA_NOT_CLOSED`；
   未声明覆盖/重叠核查 ⇒ `AREA_OVERLAP_UNCHECKED`。`overlapChecked` 是**用户申报**，不证明 GIS 拓扑。
2. **真值表 + 来源等级一致性（P1-3）**。显式 `truthTableMode()` 与 `compute()` 同源可复算；
   必需字段 `REQUIRED_PARAM_FIELDS`（出处/页码/适用年/地区/物种/龄组/依据）缺一即阻断 DATA_SUPPORTED；
   `SOURCE_LEVEL_COMPAT` 保证来源类型与适用性等级互不矛盾（不返回 `NO_RESULT`）；
   任一为 SYNTHETIC 一律**不得**进入真实结果；USER_ASSUMPTION 降级为 `USER_SCENARIO` 并保留标签；
   UNKNOWN 不算完成；仅有文献出处 ⇒ 只称"已登记、适用性待核"。
3. **解析/计算失败必须清空旧结果（P1-4）**。结构、解析、计算任一失败即清空结果、敏感性、任务、摘要与旧缓存；
   导入期间表单被改动则忽略该次导入（异步竞争守卫）。**不得**导出陈旧结果。
4. **登记 ≠ 几何核验（P1-5）**。`areaProvenanceRegistered`（登记状态）与 `geometryAreaVerified`（**恒为 false**）
   分离；不再有"几何核验通过"式命名。数据支持模式要求文件出处 + 参数化面积方法；
   只有真正读取几何并独立重算比对才可称已核验 —— 用户勾选框不构成程序核验事实。
5. **倒置范围不再冠名低/高（P2-1）**。低/高顺序不成立 ⇒ `sensitivity.available=false` + 任务 `B_ORDER/FC_ORDER`，
   参考值本身不受影响仍单列；若三组合相关或非单调，须显式命名情景 A/B/C 并说明组合依据。
6. **HTML 注入（P2-2）**。所有动态文本经 `esc()` 转义；外部数据不得被当作标记解释。
7. **科学与状态文案（P2-3）**：`EXCLUDED_POOLS`（SOC/BGB/DEADWOOD/LITTER/HWP，未纳入碳库）与
   `UNASSESSED_ELEMENTS`（BASELINE/LEAKAGE/NON_PERMANENCE/ADDITIONALITY，未评估的信用核算/资格要素）
   **必须分列**（依据 IPCC 2006 第 4 卷 §2.2.1：基准线/泄漏/额外性不是碳库）。
8. **`NO_RESULT` 也必须带明确范围判定**（`sensitivity.available === false`），不得因"该分支不计算"而缺字段。
9. 摘要域升为 `CarbonSat-MRV|agb-scenario|v2\n` / `CarbonSat-MRV|agb-package|v2\n`。

**对外边界不变**：只算 AGB 单一碳库、不含信用量、未上链、不改变科研数据/模型/冻结件/D3/链上登记。

