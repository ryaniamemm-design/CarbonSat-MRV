# 已有 NPP 估算结果入口（P0 契约）

模块验收版本：CarbonSat-NppEstimateEntry-**v1.2**（原 v1.0/v1.1 已归档，见 `audit/estimation_fix_2026-10-13/`）。
契约版本：`CarbonSat-NppEstimateBundle-v1.1`；导出口径 `CarbonSat-NppEstimateExport-v1.1`；已发布摘要侧车 `CarbonSat-NppEstimateBundlePin-v1.0`。

本文件是 **先写契约、再实现** 的契约部分。它定义一个**只读查看模块**：把已经存在的 R27/R28（逐像元积分）与 R31（A2 地类有效足迹）产物，变成"看得懂、追得到出处、能重算、知道缺什么"的界面。**本模块不产生任何新数值、不重训模型、不重跑 GEE。**

## 1. 这个模块是什么、不是什么

| 是 | 不是 |
|---|---|
| 已有离散足迹的 **MOD17 模型年度 NPP 碳生产量**（tC/yr）的读取与解释入口 | 净碳汇、净生态系统生产力或碳信用 |
| 逐格年、逐地类的事实展示 + 出处展开 + 可复算核验 | 新的估算、新的模型、新的训练 |
| 缺格年时**年度合计保持空**的失败关闭展示 | 忽略缺格年、用剩余格冒充"固定 34 格合计" |
| 地类分解可视化（R31 无有效足迹的类别**保持 null**） | 用"0"冒充"真零"或"无有效观测" |
| 按传感器时段分段查看**原始描述性序列** | 跨 2012 断点的增长箭头 / 增长率 / 治理效果 |

**输出命名（强制）**：「所选离散足迹的 MOD17 模型年度 NPP 碳生产量」。

## 2. 计算对象（不得与 P1 混称）

| 对象 | 单位 | 含义 | 不得写成 |
|---|---|---|---|
| `prod_tC_yr` | tC/yr | 单格单年、在**栅格有效足迹**上的 MOD17 模型 NPP 年度碳生产量 | 碳储量 / 碳汇 / tCO₂e |
| `integral_kgC_yr` | kgC/yr | 同上，未换算成 t 的原值 | — |
| `intensity_kg_m2_yr` | kgC·m⁻²·yr⁻¹ | **流量强度**，分母是该地类的**有效栅格面积** | 单位面积储量 |
| 地类 `prod_tC_yr` | tC/yr | 该格该年该 IGBP 类别的生产量 | — |

**流量（tC/yr）与库存（tC）绝不可相加、不可互换**：本模块只有流量。库存试算在 P1 模块，两者页面分开、单位分列。

## 3. 数据来源（只读）

| 用途 | 文件 | 备注 |
|---|---|---|
| 逐格年生产量与面积 | `data/npp_annual_production_integral.csv` | 816 行 + 表头；R27/R28 产物 |
| 逐格年 × IGBP 类别分解 | `evidence/a2_landcover_valid_footprint.json`（`rows` 1523 条 / `cells` 816 条） | R31 产物；`contentAnchor=local-sha256:43f3235e…` |

两者都是**真实本地产物**，本模块**不改写**它们。生成入口数据包 `web/npp_estimate_bundle.json` 的脚本 `scripts/build_npp_estimate_bundle.py` 从上述两文件**只读**导出，并把两文件的 sha256 记入数据包 `generatedFrom`。

## 4. 单位与换算（显式、可复算）

```
NPP_scaled      [kgC·m⁻²·yr⁻¹] = DN × 0.0001
integral_kgC_yr [kgC·yr⁻¹]     = Σ_pixels ( NPP_scaled × pixelArea[m²] )
prod_tC_yr      [tC·yr⁻¹]      = integral_kgC_yr / 1000
validAreaRatio                 = gridValidAreaM2 / gridTotalAreaM2
```

- `validAreaRatio` 一律称 **栅格有效面积比例**（基于 `npp_valid_mask = DN∈[-30000,32700]`），**不称**"逐年观测质量"或"准确率"。
- 面积**三个量不可混用**：矢量测地 `geomAreaM2`、栅格总 `gridTotalAreaM2`、栅格有效 `gridValidAreaM2`。生产量的分母是**有效栅格面积**，**禁用** `validPixels × 250000`。
- 面积换算 `m2 → ha` 用 `×1e-4`。

## 5. 缺测语义（失败关闭）

- 任一指定格年缺失 / 值为空、None、NaN、±Inf / `missing=True` 却保留数值 / `missingReason` 与 `missing` 不一致 ⇒ 该格年**不可用**。
- **年度合计**（所选离散足迹 34 格的年合计）只要有任一格年不可用，**该年合计 = null**，并列出缺失格；**绝不**用剩余格求和冒充合计，**绝不**填 0。
- 地类行 `classValidAreaM2 == 0` ⇒ 该类别生产量/强度为 **null（无有效产品值）**，**不得写作 0**、不得称"真零"。

## 6. 时序边界

- 传感器时段：2001–2011（era 1）与 2012–2024（era 2），断点在 **2012**，三产品同步、成因未确定。
- 默认**不绘制**跨 2012 的增长箭头 / 增长率 / 治理效果；只能按 era 分段查看**原始描述性序列**。
- 不得外推、不得跨边界、不得给 tCO₂e、不得把 34 格合计当作库布其全区。

## 7. 界面必须回答的问题

一次选择操作（格 + 年）后，页面必须让用户看懂"**这是谁的哪个年份、哪块足迹、算的是什么**"：

1. **身份**：`cellId` / `year` / 生产量口径名 / 单位。
2. **足迹**：格心经纬度 + `格心 ±0.03° 方框`示意几何（**明确标注：示意几何，非治理地块边界**）+ 栅格有效面积。
3. **数值**：`prod_tC_yr`、`integral_kgC_yr`、`gridValidAreaM2`、`gridTotalAreaM2`、`validAreaRatio`，各带单位。
4. **地类分解**：逐 IGBP 类别的有效面积与生产量，无有效足迹的类别显示"无有效产品值"。
5. **出处展开**：数据文件名 + sha256、格年主键、`method_version`、`product` / `mask` / `crs` / `scale`、公式、**未纳入的误差项**。
6. **可复算核验**：本页视图摘要（视图 canoncial 串的 sha256）与数据包自身的哈希，供第三方重算。

## 8. 生成物与核验

- 数据包：`web/npp_estimate_bundle.json`，由 `scripts/build_npp_estimate_bundle.py` 生成，确定性（键排序、LF、无 BOM、无时间戳）。
- 核验：`scripts/build_npp_estimate_bundle.py --verify` **从两个来源文件重新推导**，与已落盘数据包逐字段比对；不一致即 exit 1。
- 视图哈希域：`CarbonSat-MRV|npp-estimate-view|v1\n` + canonical(view)。

## 9. 强制边界（不可由导入数据改为肯定状态）

`claimClass=DESCRIPTIVE_NPP_ONLY`；`attributionStatus=insufficient_evidence`；
`forbiddenOutputs=[REMOVAL, GOVERNANCE_INCREMENT, CARBON_CREDIT, tCO2e]`；
`carbonQuantificationStatus=NOT_PERFORMED`（本模块不产生碳量/信用量）；
`publiclyAnchored=false`；`registrationReady=false`。

## 10. 与旧成果的关系

- 本模块**不写入** `npp_evidence_records.json`、A2 科研流、9 条主张或既有证据包。
- 旧 42 文件 `packSha256` 与 `methodHash` **不因本模块改变**（本模块文件不在该清单内）。
- 本模块有**独立文件清单**（见 `audit/estimation_upgrade/`），**不能**表述为受旧 packSha256 或 Sepolia 保护。
- 共享文件 `web/entry.html`、`scripts/check_web_syntax.js`、`scripts/run_all_gates.ps1` 前移以纳入本模块：这使单地块证据登记模块**显式升为 v1.4**（其自身逻辑未变，旧 v1.3 清单与验收保留）。

## 11. 本地命令

在 `72h-spike/` 下：

```powershell
.venv-ee/Scripts/python.exe scripts/build_npp_estimate_bundle.py --build
.venv-ee/Scripts/python.exe scripts/build_npp_estimate_bundle.py --verify
.venv-ee/Scripts/python.exe scripts/verify_estimation_module.py --verify
node scripts/browser_estimation_drive.js
```

预览：`http://127.0.0.1:8777/web/npp_entry.html`（或 `web/npp_entry.html`）。

---

## 附：v1.1（模块 v1.2）变更记录 —— 按 独立审查 P1-1 / P2-2 收紧

> 触发：`historical estimation review (2026-10-13)`（原探针与原始输出未改动，复跑副本见
> `audit/estimation_fix_2026-10-13/`）。**本模块不产生新数值，本次只收紧核验与留痕。**

1. **内容摘要必须从实际内容重算（P1-1）**。数据包新增 `bundleContentSha256`，域 `CarbonSat-MRV|npp-estimate-bundle-content|v1\n`；
   导出新增 `exportSha256`，域 `CarbonSat-MRV|npp-estimate-export|v1\n`。核验**不得**复用包内声明值，
   必须用实际内容重算再比对。
2. **跨语言逐位一致**：数字按 IEEE-754 **比特串**（`struct.pack('>d')` / `DataView.setFloat64`）参与规范化，
   避免 `1` vs `1.0`、`1e+16` 等打印差异导致 Python 与 JS 摘要不一致。
3. **深度结构 + 关系核验**：键集精确比对、816 格年主键集完整、单位/方法学与权威值比对、
   `prod_tC_yr = integral_kgC_yr/1000`、`validAreaRatio = 有效面积/总面积`、逐类 `prod = intensity×area/1000`、
   地类面积闭合、**零有效面积行必须为 null（不得写成 0）**。容差 `RTOL = 1e-9`（实测最坏偏差 ≤ 6.6e-16）。
4. **三级来源证明互不代替**：① 浏览器内部重算；② 已发布摘要（`web/npp_estimate_bundle.pin.json` 登记
   字节摘要 + 内容摘要）；③ 源文件逐项复算（**本页不具备**，恒记"未核验"）。
   包内自写的 `source.sha256` **不构成**来源真实性证明；自摘要也**不是**外部信任根。
5. **导出前先核验**：未经核验的数据包不得导出；导出内容必须与数据包交叉重算一致。
6. **载入失败关闭（P2-2 相关）**：结构/摘要/pin 任一不过即拒绝该次载入，**绝不**用被拒内容渲染或导出；
   页面明确提示"屏幕仍是上一份已核验快照"。
7. **全部动态文本经 HTML 转义后写入 DOM**；CSP 与"只连本站"限制保持不变。
8. **措辞收紧**：`2012 传感器断点` → `2012 附近存在同步结构性断点，成因未证实；按分析时段分段`；
   不再写"无任何碳量"，改为"只展示已有模型 NPP 碳生产量，不计算净碳汇或信用量"。

**对外边界不变**：只读视图、不新增数值、不含碳量或信用量、未上链、不改变科研数据/模型/冻结件/D3/链上登记。

---

## 附：模块 v1.3 变更记录（2026-10-15）—— 共享文件接线 + 一处由浏览器验证发现的文案缺陷修复

**1. 共享文件（新增变化台账模块所致，非本模块自身改动）**
`web/entry.html`（新增 `#changeLedgerEntry` 区块，P0 卡片原样保留）、`scripts/check_web_syntax.js`（模块 10 → 12，期望串 `语法 OK 12/12`）、
`scripts/run_all_gates.ps1`（新增 4 项变化台账门禁；估算模块回归门禁期望串 62 → **63 passing**）。按纪律显式升 **v1.2 → v1.3**，新建 `MODULE_MANIFEST_v1.3.json`，v1.0–v1.2 清单保留。

**2. `web/npp_entry_core.js#verifyBundle` 文案缺陷修复（披露项：本轮真实浏览器验证发现）**
现象：把 `web/npp_estimate_bundle.json` 的某个数值改掉而不重签（例如 `cellYears['cell_0020|2001'].integral_kgC_yr × 1.5`）后在 `web/changes.html` 载入，
核验**正确地拒绝**了，但错误列表里出现一句 **「内容摘要不符：声明 null ≠ 重算 null」**。

原因：`verifyBundle` 中 `content` 以 `{declared: null, recomputed: null}` 初始化，只在 `structure.ok` 为真时才去取这两个值；
而旧实现**无条件**输出那句"不符"断言。因此当结构校验已经失败时，这句文案既**无信息量**，又读起来像在断言"内容被改动"——事实上该项**根本没被评估**。

修订：
```js
if (!structure.ok) {
  errors.push('结构校验未通过 ⇒ 内容摘要未评估（不得据此断言内容被改动，也不得断言未被改动）');
} else if (!content.ok) {
  errors.push('内容摘要不符：声明 … ≠ 重算 …');
}
```
**拒绝行为不变**（本例本就由结构关系式 `prod_tC_yr == integral_kgC_yr/1000` 与已发布摘要不符共同拦下）；改的只是**"未评估"与"不符"必须区分**这一点。
补反例测试 `test/estimation_modules.test.js`：结构失败 ⇒ 必须出现"内容摘要未评估"，且**不得**出现 `内容摘要不符：声明 null`；对照例（只改摘要字段、结构仍通过）⇒ 才输出"内容摘要不符"。
估算模块回归由此 62 → **63 passing**。

**未变**：`CarbonSat-NppEstimateBundle-v1.1` / 导出域 / AGB v0.2 协议、数据包与 pin 的字节、`NO_RESULT` 语义、`geometryAreaVerified` 恒 false、
未纳入碳库与未评估要素分列、只读边界与"不计算净碳汇或信用量"的措辞。数据包与已发布摘要（pin）**字节未动**，未重训、未重跑 GEE、未填人工标签。


---

## 附：模块 v1.4 变更记录（2026-10-15）—— 仅共享门禁期望串

变化台账按独立复核 REVIEW.md 的三组 P1 修复并升 v1.1，连带修改共享文件 `scripts/run_all_gates.ps1`。按纪律显式升 **v1.3 → v1.4**，新建 `MODULE_MANIFEST_v1.4.json`，v1.0–v1.3 清单保留。

**本模块自身的协议、数据包、pin 字节、页面与数值语义均未改变**；v1.3 内的 `verifyBundle` 文案修复（"未评估"与"不符"分离）保持不变。

---

## 附：模块 v1.5 变更记录（2026-10-16）—— 仅共享门禁期望串

变化台账按限定复验修复「任务完整性」并升 v1.2，连带修改共享文件 `scripts/run_all_gates.ps1`。按纪律显式升 **v1.4 → v1.5**，新建 `MODULE_MANIFEST_v1.5.json`，v1.0–v1.4 清单保留。

**本模块自身的协议、数据包、pin 字节、页面与数值语义均未改变**。

---

## 附：模块 v1.6 变更记录（2026-10-16）—— 仅共享门禁/入口

新增恩格贝独立研究案例，连带修改共享文件 `web/entry.html`（新增案例入口卡片）、`scripts/check_web_syntax.js`（12 → 14 模块）、`scripts/run_all_gates.ps1`（+5 条恩格贝门禁）。按纪律显式升 **v1.5 → v1.6**，新建 `MODULE_MANIFEST_v1.6.json`，v1.0–v1.5 清单保留。

**本模块自身的协议、数据包、pin 字节、页面与数值语义均未改变**。

---

## 附：模块 v1.7 变更记录（2026-10-16）—— 仅共享门禁期望串

恩格贝案例按独立限定审阅的四组 P1 修复并升 v1.1，连带修改共享文件 `scripts/run_all_gates.ps1`（恩格贝三项门禁期望串 29→45 / 26→27 / 23→34）。按纪律显式升 **v1.6 → v1.7**，新建 `MODULE_MANIFEST_v1.7.json`，v1.0–v1.6 清单保留。

**本模块自身的协议、数据包、pin 字节、页面与数值语义均未改变**。
