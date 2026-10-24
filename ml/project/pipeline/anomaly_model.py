


from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVIDENCE_DIR = os.path.join(ROOT, "evidence")
SMOKE_DIR = os.path.join(EVIDENCE_DIR, "smoke")
GRID_CSV = os.path.join(ROOT, "data", "grid_samples.csv")


EXPECTED_COLS = ["cellId", "lon", "lat", "year", "fvc", "ndvi",
                 "clearPixelRatio", "spatialCoverage", "sensorAgreement",
                 "method_version", "endmember_p5", "endmember_p95"]


EXPECTED_METHOD_VERSION = "CarbonSat-FVC-v2.0-SR"
MISSING_SENTINEL = -9999


DEFAULT_SA_FILL = 0.5


FEATURES = ["fvc", "ndvi", "clearPixelRatio", "spatialCoverage",
            "sensorAgreement", "fvcJump", "yearNorm"]


MODEL_VERSION = "CarbonSat-AnomalyIF-v1.1"
PREPROCESSING_VERSION = "CarbonSat-FVC-TrainImputer-v1.1"


MIN_CELLS = 50
MIN_YEARS_PER_CELL = 10
MIN_SAMPLES = 500

CONTAMINATION = 0.05
N_ESTIMATORS = 200
RANDOM_STATE = 20260924


class GridSampleInvalid(ValueError):
    pass


def validate_grid_samples(df: pd.DataFrame, meta_cols: dict | None = None) -> dict:


    errs, checks = [], {}

    def fail(k, msg):
        checks[k] = False
        errs.append(f"{k}: {msg}")


    missing = [c for c in EXPECTED_COLS if c not in df.columns]
    if missing:
        raise GridSampleInvalid(f"V1 缺列 {missing}（应为 gee/02_kubuqi_grid_samples.js 导出）")
    checks["V1_required_columns"] = True


    dup = int(df.duplicated(subset=["cellId", "year"]).sum())
    if dup:
        fail("V2_unique_key", f"(cellId, year) 重复 {dup} 行——网格样本主键必须唯一")
    else:
        checks["V2_unique_key"] = True


    yr = df["year"]
    if yr.isna().any() or ((yr % 1) != 0).any() or (yr < 1980).any() or (yr > 2100).any():
        fail("V3_year_range", "year 必须是 1980–2100 的整数")
    else:
        checks["V3_year_range"] = True


    lon_ok = df["lon"].notna().all() and df["lon"].between(-180, 180).all()
    lat_ok = df["lat"].notna().all() and df["lat"].between(-90, 90).all()
    if not (lon_ok and lat_ok):
        fail("V4_lonlat_range", "lon/lat 缺失或越界")
    else:
        checks["V4_lonlat_range"] = True


    for col in ("clearPixelRatio", "spatialCoverage", "sensorAgreement"):
        v = df[col]
        present = v.dropna()
        if len(present) and ((present < 0).any() or (present > 1).any()):
            fail("V5_quality_0_1", f"{col} 存在超出 [0,1] 的值"
                                   f"（min={present.min():.4f}, max={present.max():.4f}）")
        else:
            checks[f"V5_{col}_0_1"] = True


    for col in ("fvc", "ndvi"):
        v = df[col].dropna()
        v = v[v != MISSING_SENTINEL]
        if len(v) and ((v < -1).any() or (v > 1).any()):
            fail("V6_value_range", f"{col} 存在超出 [-1,1] 的值")
        else:
            checks[f"V6_{col}_range"] = True


    if "method_version" not in df.columns:
        raise GridSampleInvalid("V7 缺 method_version 列（无法确认已做 SR 定标）")
    mv = set(df["method_version"].dropna().astype(str).unique())
    if mv != {EXPECTED_METHOD_VERSION}:
        fail("V7_method_version",
             f"method_version={sorted(mv)}，期望仅 {EXPECTED_METHOD_VERSION}")
    else:
        checks["V7_method_version"] = True


    for col in ("endmember_p5", "endmember_p95"):
        if col not in df.columns:
            raise GridSampleInvalid(f"V8 缺 {col} 列（无法确认共享端元）")
    p5 = df["endmember_p5"].dropna().astype(float).unique()
    p95 = df["endmember_p95"].dropna().astype(float).unique()
    if len(p5) != 1 or len(p95) != 1:
        fail("V8_shared_endmember", f"端元不唯一（p5={p5[:3]}, p95={p95[:3]}）——须两区共用同一对")
    elif not (float(p95[0]) > float(p5[0])):
        fail("V8_shared_endmember", f"p95({p95[0]}) 必须 > p5({p5[0]})")
    else:
        checks["V8_shared_endmember"] = True

    if errs:
        raise GridSampleInvalid("网格样本 CSV 校验失败 -> " + "；".join(errs))
    return {"checks": checks,
            "meta": {"method_version": EXPECTED_METHOD_VERSION,
                     "endmember_p5": float(p5[0]), "endmember_p95": float(p95[0]),
                     "nRows": int(len(df)), "nCells": int(df["cellId"].nunique()),
                     "yearMin": int(df["year"].min()), "yearMax": int(df["year"].max())}}


def load_grid_samples(path: str):


    df = pd.read_csv(path)
    for c in EXPECTED_COLS:
        if c not in df.columns:
            raise GridSampleInvalid(f"缺列 {c}（应为 gee/02_kubuqi_grid_samples.js 导出）")
    for c in ["fvc", "ndvi", "clearPixelRatio", "spatialCoverage", "sensorAgreement", "year"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    for c in ("lon", "lat"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")
    df["cellId"] = df["cellId"].astype(str)
    df, missing_report = drop_missing_rows(df)
    contract = validate_grid_samples(df)
    contract["missingReport"] = missing_report
    return df, contract


def drop_missing_rows(df: pd.DataFrame):


    rep = {}
    bad = pd.Series(False, index=df.index)
    for col in ("fvc", "ndvi"):
        sentinel = (df[col] == MISSING_SENTINEL)
        nan = df[col].isna()
        rep[f"{col}_sentinel_rows"] = int(sentinel.sum())
        rep[f"{col}_nan_rows"] = int(nan.sum())
        bad |= sentinel | nan
    clean = df[~bad].reset_index(drop=True)
    rep["rows_before"] = int(len(df))
    rep["rows_after"] = int(len(clean))
    rep["rows_dropped"] = int(bad.sum())
    rep["droppedCells"] = int(df.loc[bad, "cellId"].nunique()) if bad.any() else 0
    return clean, rep


def fit_imputer(train_df: pd.DataFrame) -> dict:


    med = train_df["sensorAgreement"].median()
    n_missing = int(train_df["sensorAgreement"].isna().sum())
    all_missing = bool(pd.isna(med))
    return {"method": "median",
            "column": "sensorAgreement",
            "value": float(DEFAULT_SA_FILL if all_missing else med),
            "nTrain": int(len(train_df)),
            "nMissingInTrain": n_missing,
            "allMissing": all_missing,
            "note": ("训练集 sensorAgreement 全缺失（无 L8/L9 重叠观测）→ 使用中性默认值 "
                     f"{DEFAULT_SA_FILL}，该分量不携带实测信息。" if all_missing else
                     "按训练集中位数填补（仅用训练集拟合）。")}


def apply_imputer(df: pd.DataFrame, imputer: dict) -> pd.DataFrame:

    out = df.copy()
    out["sensorAgreement"] = out["sensorAgreement"].fillna(imputer["value"])
    return out


def build_features(df: pd.DataFrame, imputer: dict | None = None):


    df = df.sort_values(["cellId", "year"]).reset_index(drop=True)
    jumps = []
    for cid, grp in df.groupby("cellId"):
        fvcs = grp["fvc"].to_numpy(dtype=float)
        for i in range(len(fvcs)):
            jumps.append(0.0 if i == 0 else abs(fvcs[i] - fvcs[i - 1]))
    df["fvcJump"] = jumps
    ymin, ymax = float(df["year"].min()), float(df["year"].max())
    df["yearNorm"] = (df["year"] - ymin) / max(1e-9, (ymax - ymin))

    imputed_n = int(df["sensorAgreement"].isna().sum())
    if imputer is not None:
        fill_value = float(imputer["value"])
        imputer_src = "train_fit(saved)"
    else:
        fill_value = float(fit_imputer(df)["value"])
        imputer_src = "in_df_median(train_stage_only)"
    if not np.isfinite(fill_value):
        raise GridSampleInvalid("sensorAgreement 填补值必须为有限数值")
    df["sensorAgreement_filled"] = df["sensorAgreement"].fillna(fill_value)

    feat = df.copy()
    feat["sensorAgreement_observed"] = feat["sensorAgreement"]
    feat["sensorAgreement"] = feat["sensorAgreement_filled"]
    X = feature_matrix(feat)
    meta = {
        "nCells": int(df["cellId"].nunique()),
        "nSamples": int(len(df)),
        "yearsPerCellMean": round(float(df.groupby("cellId").size().mean()), 2),
        "yearsPerCellMin": int(df.groupby("cellId").size().min()),
        "sensorAgreementImputed": imputed_n,
        "sensorAgreementFillValue": round(fill_value, 4),
        "imputerSource": imputer_src,
        "featureList": list(FEATURES),
    }
    return X, meta, feat


def feature_matrix(frame: pd.DataFrame) -> np.ndarray:

    X = frame[FEATURES].to_numpy(dtype=float)
    if not np.isfinite(X).all():
        bad = [FEATURES[j] for j in range(len(FEATURES))
               if not np.isfinite(X[:, j]).all()]
        raise GridSampleInvalid(f"预处理后的特征仍含非有限数值：{bad}")
    return X


def check_sufficiency(df: pd.DataFrame) -> dict:
    n_cells = int(df["cellId"].nunique())
    sizes = df.groupby("cellId").size()
    ypc_mean = float(sizes.mean())
    ypc_min = int(sizes.min())
    n_samples = int(len(df))
    ok = (n_cells >= MIN_CELLS and ypc_min >= MIN_YEARS_PER_CELL
          and n_samples >= MIN_SAMPLES)
    reasons = []
    if n_cells < MIN_CELLS:
        reasons.append(f"网格单元数 {n_cells} < 要求 {MIN_CELLS}")
    if ypc_min < MIN_YEARS_PER_CELL:
        reasons.append(f"最少单元年数 {ypc_min} < 要求 {MIN_YEARS_PER_CELL}（fvcJump 时序特征需要足够年数）")
    if n_samples < MIN_SAMPLES:
        reasons.append(f"总样本数 {n_samples} < 要求 {MIN_SAMPLES}")
    return {
        "ok": ok,
        "reason": "；".join(reasons) if reasons else "样本充足，可训练",
        "found": {"cells": n_cells, "yearsPerCellMin": ypc_min,
                  "yearsPerCellMean": round(ypc_mean, 2), "samples": n_samples},
        "required": {"cells": MIN_CELLS, "yearsPerCellMin": MIN_YEARS_PER_CELL,
                     "samples": MIN_SAMPLES},
    }


def cell_based_split(df: pd.DataFrame, test_ratio: float = 0.2, seed: int = RANDOM_STATE):
    rng = np.random.default_rng(seed)
    cells = np.array(sorted(df["cellId"].unique()))
    rng.shuffle(cells)
    n_test = max(1, int(round(len(cells) * test_ratio)))
    test_cells = set(cells[:n_test].tolist())
    train = df[~df["cellId"].isin(test_cells)].reset_index(drop=True)
    test = df[df["cellId"].isin(test_cells)].reset_index(drop=True)
    return train, test, sorted(test_cells)


def inject_synthetic_anomalies(df: pd.DataFrame, frac: float = 0.15,
                               seed: int = RANDOM_STATE) -> pd.DataFrame:


    rng = np.random.default_rng(seed)
    n = len(df)
    k = max(1, int(round(n * frac)))
    idx = rng.choice(n, size=k, replace=False)
    copy = df.iloc[idx].copy().reset_index(drop=True)
    for i in range(len(copy)):
        kind = rng.integers(0, 4)
        if kind == 0:
            copy.at[i, "fvc"] = float(rng.choice([0.0, 1.0]))
        elif kind == 1:
            copy.at[i, "ndvi"] = -abs(copy.at[i, "ndvi"]) - 0.6
        elif kind == 2:
            copy.at[i, "clearPixelRatio"] = 0.0
        else:
            copy.at[i, "fvcJump"] = 0.8
    copy["is_anomaly_label"] = 1
    base = df.copy()
    base["is_anomaly_label"] = 0
    out = pd.concat([base, copy], ignore_index=True)
    return out


def train_iso(X: np.ndarray, contamination: float = CONTAMINATION,
              n_estimators: int = N_ESTIMATORS, seed: int = RANDOM_STATE):
    model = IsolationForest(n_estimators=n_estimators, contamination=contamination,
                            random_state=seed, n_jobs=-1)
    model.fit(X)
    return model


def anomaly_score(model, X: np.ndarray) -> np.ndarray:

    X = np.asarray(X, dtype=float)
    if X.ndim != 2 or X.shape[1] != len(FEATURES) or not np.isfinite(X).all():
        raise GridSampleInvalid("评分需要 7 维且全部有限的预处理特征，禁止绕过训练期填补规则")
    return -model.decision_function(X)


def evaluate(model, df_with_labels: pd.DataFrame):

    feats = df_with_labels.copy()
    X = feature_matrix(feats)
    scores = anomaly_score(model, X)
    labels = feats["is_anomaly_label"].to_numpy(dtype=int)
    pred = (model.predict(X) == -1).astype(int)


    tp = int(((pred == 1) & (labels == 1)).sum())
    fp = int(((pred == 1) & (labels == 0)).sum())
    fn = int(((pred == 0) & (labels == 1)).sum())
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0


    order = np.argsort(-scores)
    s_sorted, l_sorted = scores[order], labels[order]
    tp_c, fp_c, prec_arr, rec_arr = [], [], [], []
    cum_tp = cum_fp = 0
    total_pos = int(labels.sum())
    for s, l in zip(s_sorted, l_sorted):
        if l == 1:
            cum_tp += 1
        else:
            cum_fp += 1
        tp_c.append(cum_tp); fp_c.append(cum_fp)
        prec_arr.append(cum_tp / (cum_tp + cum_fp) if (cum_tp + cum_fp) else 0.0)
        rec_arr.append(cum_tp / total_pos if total_pos else 0.0)

    pr_auc = 0.0
    for i in range(1, len(rec_arr)):
        pr_auc += (rec_arr[i] - rec_arr[i - 1]) * (prec_arr[i] + prec_arr[i - 1]) / 2.0


    k = max(1, int(labels.sum()))
    topk = labels[order[:k]]
    precision_at_k = round(float(topk.mean()), 4) if len(topk) else 0.0

    k5 = max(1, int(round(0.05 * len(labels))))
    precision_at_5pct = round(float(labels[order[:k5]].mean()), 4)

    return {
        "nLabeledAnomalies": int(labels.sum()),
        "nFlagged": int(pred.sum()),
        "truePositives": tp, "falsePositives": fp, "falseNegatives": fn,
        "precision": round(precision, 4), "recall": round(recall, 4),
        "f1": round(f1, 4), "prAuc": round(float(pr_auc), 4),
        "precisionAtK_anomalies": precision_at_k,
        "precisionAtTop5pct": precision_at_5pct,
        "scoreMean": round(float(scores.mean()), 4),
        "scoreStd": round(float(scores.std()), 4),
        "note": "评估在注入的合成异常（仅见于验证单元，未参与训练）上进行；真实观测的异常分数为连续量，仅作 REVIEW 建议，不驱动最终判定。",
    }


def synthesize_grid(n_cells: int = 120, years=(1987, 2024), seed: int = RANDOM_STATE):


    rng = np.random.default_rng(seed)
    rows = []
    for c in range(n_cells):
        base = rng.uniform(0.05, 0.25)
        slope = rng.uniform(0.002, 0.012)
        for y in range(years[0], years[1] + 1):
            fvc = float(np.clip(base + slope * (y - years[0]) + rng.normal(0, 0.02), 0, 1))

            ndvi = float(np.clip(2 * fvc - 0.1 + rng.normal(0, 0.03), -1, 1))
            cpr = float(np.clip(rng.normal(0.85, 0.1), 0, 1))
            scov = float(np.clip(rng.normal(0.9, 0.08), 0, 1))
            sa = float(np.clip(rng.normal(0.9, 0.05), 0, 1)) if y >= 2022 else None
            rows.append({
                "cellId": f"cell_{c:04d}", "lon": 108.0 + c * 0.01, "lat": 40.0 + c * 0.01,
                "year": y, "fvc": round(fvc, 4), "ndvi": round(ndvi, 4),
                "clearPixelRatio": round(cpr, 4), "spatialCoverage": round(scov, 4),
                "sensorAgreement": sa,
                "method_version": EXPECTED_METHOD_VERSION,
                "endmember_p5": 0.0312, "endmember_p95": 0.4123,
            })
    return pd.DataFrame(rows)


def train_and_report(csv_path: str, out_dir: str, smoke: bool = False) -> dict:


    real_out = out_dir
    eff_out = os.path.join(out_dir, "smoke") if smoke else out_dir
    os.makedirs(eff_out, exist_ok=True)
    status_path = os.path.join(eff_out, "anomaly_model_status.json")
    ts = datetime.now(timezone.utc).isoformat()
    print(f"[out] {'SYNTHETIC 隔离目录' if smoke else '正式目录'}: {eff_out}")

    contract = None
    if smoke:
        print("[smoke] 生成合成网格数据（SYNTHETIC，仅验证代码路径，不用于真实 claim）…")
        df = synthesize_grid()
        csv_used = "<synthetic>"
    else:
        if not os.path.exists(csv_path):
            reason = (f"未找到网格样本 CSV：{csv_path}。"
                       f"需先在 GEE 运行 gee/02_kubuqi_grid_samples.js（先 SMOKE=true 验证，"
                       f"再全量导出）得到 data/grid_samples.csv，"
                       f"且样本须达到：网格单元≥{MIN_CELLS}、最少单元年数≥{MIN_YEARS_PER_CELL}、"
                       f"总样本≥{MIN_SAMPLES}。")
            status = _blocked_status(False, reason, None, ts, csv_path, real_out)
            _write(status_path, status)
            return status

        try:
            df, contract = load_grid_samples(csv_path)
        except GridSampleInvalid as e:
            reason = (f"网格样本 CSV 未通过数据契约校验，拒绝训练：{e}")
            status = _blocked_status(False, reason, None, ts, csv_path, real_out)
            _write(status_path, status)
            return status
        csv_used = csv_path

    suf = check_sufficiency(df)
    if not suf["ok"]:
        reason = (f"网格样本不足，无法训练真实异常预审模型：{suf['reason']}。"
                  f"已明确报告阻塞，绝不用人为编造的两条地块序列冒充训练。"
                  f"下一步：在 GEE 运行 gee/02_kubuqi_grid_samples.js 导出足量网格样本后重跑。")
        status = _blocked_status(smoke, reason, suf, ts, csv_used, real_out)
        _write(status_path, status)
        return status


    print(f"[train] 样本充足（{suf['found']}），开始训练 IsolationForest…")


    train_df, test_df, test_cells = cell_based_split(df)
    imputer = fit_imputer(train_df)
    print(f"[impute] 填补规则（仅训练集拟合）：sensorAgreement={imputer['value']:.4f}"
          f"（训练集缺失 {imputer['nMissingInTrain']} 条"
          f"{'，整列缺失→中性默认值' if imputer.get('allMissing') else ''}）")


    X_train, fmeta, train_feat = build_features(train_df, imputer=imputer)
    _, _, test_feat = build_features(test_df, imputer=imputer)


    if np.isnan(X_train).any():
        bad_cols = [FEATURES[j] for j in range(X_train.shape[1])
                    if np.isnan(X_train[:, j]).any()]
        raise GridSampleInvalid(
            f"训练特征矩阵仍含 NaN（列：{bad_cols}）。缺测哨兵 {MISSING_SENTINEL} 已在读取阶段剔除，"
            f"出现 NaN 说明还有未处理的缺失列，拒绝训练以免静默污染模型。")
    X_all, _, all_feat = build_features(df, imputer=imputer)

    model = train_iso(X_train)

    test_lab = inject_synthetic_anomalies(test_feat)
    eval_res = evaluate(model, test_lab)
    eval_res["evalScope"] = "PROCESS_TEST_ONLY（合成注入；不代表真实地块检出率）"

    model_path = os.path.join(eff_out, "anomaly_model.joblib")
    import joblib

    joblib.dump({"model": model, "imputer": imputer, "modelVersion": MODEL_VERSION,
                 "features": list(FEATURES), "contamination": CONTAMINATION,
                 "preprocessingVersion": PREPROCESSING_VERSION},
                model_path)

    scores = anomaly_score(model, X_all)
    score_tbl = pd.DataFrame({
        "cellId": all_feat["cellId"], "year": all_feat["year"],
        "anomalyScore": np.round(scores, 4),
    })
    score_tbl_path = os.path.join(eff_out, "anomaly_scores_grid.csv")
    score_tbl.to_csv(score_tbl_path, index=False)

    status = {
        "trained": True,
        "synthetic": smoke,
        "generatedAt": ts,
        "csvUsed": csv_used,

        "modelPath": os.path.relpath(model_path, ROOT).replace("\\", "/"),
        "modelVersion": MODEL_VERSION,
        "preprocessingVersion": PREPROCESSING_VERSION,
        "modelType": "IsolationForest(unsupervised)",
        "contamination": CONTAMINATION,
        "nEstimators": N_ESTIMATORS,
        "features": list(FEATURES),
        "imputer": imputer,
        "sufficiency": suf,
        "csvContract": contract,
        "missingReport": (contract or {}).get("missingReport"),
        "sensorAgreementAllMissing": bool(imputer.get("allMissing")),
        "featureMeta": fmeta,
        "split": {"nTrainCells": int(train_feat["cellId"].nunique()),
                  "nTestCells": int(len(test_cells)),
                  "testCellsSample": test_cells[:5]},
        "evaluation": eval_res,
        "scoreTable": os.path.relpath(score_tbl_path, ROOT).replace("\\", "/"),
        "advisoryOnly": ("模型仅输出 REVIEW 建议分数，不参与 REGISTER/REJECT 判定，"
                         "不越过数据/参数/归因硬门禁。"),
        "note": ("SYNTHETIC：合成数据流程测试，产物已隔离到 evidence/smoke/，"
                 "正式评分入口拒绝加载 synthetic 模型。" if smoke else
                 "真实 GEE 网格样本训练；异常分数为连续量，高于阈值的观测建议送人工 REVIEW。"),
    }
    _write(status_path, status)
    _write(os.path.join(eff_out, "anomaly_eval_report.json"), eval_res)
    return status


def _blocked_status(smoke, reason, suf, ts, csv_used, real_out=None):
    return {
        "trained": False,
        "synthetic": smoke,
        "generatedAt": ts,
        "csvUsed": csv_used,
        "modelVersion": MODEL_VERSION,
        "reason": reason,
        "sufficiency": suf,
        "modelPath": None,
        "advisoryOnly": "未训练：无模型分数可用，前端应显式显示 N/A（不伪造）。",
        "nextStep": "在 GEE 运行 gee/02_kubuqi_grid_samples.js 导出 data/grid_samples.csv（足量网格样本），再重跑本脚本。",
    }


def _write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    print(f"[io] 写出 {path}")


class ModelNotAvailableError(RuntimeError):
    pass


def claim_feature_vector(parcel: dict, year: int, years_min: int, years_max: int,
                         imputer: dict | None = None):


    row = next((r for r in parcel.get("timeseries", []) if r["year"] == year), None)
    if row is None:
        return None
    fvc = row.get("fvc"); ndvi = row.get("ndvi")
    ec = row.get("ecComponents", {}) or {}
    cpr = (ec.get("validPixelRatio") or {}).get("value")
    scov = (ec.get("spatialCoverage") or {}).get("value")
    sa = (ec.get("sensorAgreement") or {}).get("value")
    if None in (fvc, ndvi, cpr, scov):
        return None
    prev = None
    for r in parcel.get("timeseries", []):
        if r["year"] < year and r.get("fvc") is not None:
            prev = r["fvc"]
    jump = 0.0 if prev is None else abs(float(fvc) - float(prev))
    ynorm = (year - years_min) / max(1e-9, (years_max - years_min))
    if sa is not None:
        sa_f = float(sa)
    elif imputer is not None:
        sa_f = float(imputer["value"])
    else:
        raise ModelNotAvailableError(
            "推理需要模型随附的 imputer（训练集拟合的 sensorAgreement 填补值），但未提供")
    return [float(fvc), float(ndvi), float(cpr), float(scov), sa_f, float(jump), float(ynorm)]


def score_claims(claims: list, parcels: list, status_path: str | None = None,
                 allow_synthetic: bool = False) -> dict:


    status_path = status_path or os.path.join(ROOT, "evidence", "anomaly_model_status.json")
    if not os.path.exists(status_path):
        return {}
    try:
        with open(status_path, encoding="utf-8") as f:
            st = json.load(f)
    except Exception as e:
        raise ModelNotAvailableError(f"读取模型状态文件失败 {status_path}: {e}")
    if not st.get("trained"):
        return {}
    if st.get("synthetic") and not allow_synthetic:
        raise ModelNotAvailableError(
            "拒绝使用 synthetic 模型打正式分（模型来自 --smoke 合成数据，"
            "产物隔离在 evidence/smoke/）。请用真实网格样本重新训练。")

    mp = st.get("modelPath")
    if not mp:
        raise ModelNotAvailableError("状态为 trained=true 但缺少 modelPath")

    mp_abs = mp if os.path.isabs(mp) else os.path.join(ROOT, mp)
    if not os.path.exists(mp_abs):
        raise ModelNotAvailableError(f"模型文件不存在：{mp_abs}")
    try:
        import joblib
        bundle = joblib.load(mp_abs)
    except Exception as e:
        raise ModelNotAvailableError(f"加载模型失败 {mp_abs}: {e}")

    model = bundle.get("model") if isinstance(bundle, dict) else bundle
    imputer = bundle.get("imputer") if isinstance(bundle, dict) else None
    if model is None:
        raise ModelNotAvailableError("模型 bundle 缺少 'model' 字段")
    if imputer is None:
        raise ModelNotAvailableError("模型 bundle 缺少 'imputer'（训练集填补规则），拒绝口径不一致的推理")
    if (bundle.get("modelVersion") != MODEL_VERSION
            or st.get("modelVersion") != MODEL_VERSION
            or bundle.get("preprocessingVersion") != PREPROCESSING_VERSION
            or st.get("preprocessingVersion") != PREPROCESSING_VERSION
            or bundle.get("features") != FEATURES
            or st.get("features") != FEATURES
            or st.get("imputer") != imputer):
        raise ModelNotAvailableError("模型/状态/特征或预处理版本不匹配，需显式迁移后评分")

    pmap = {p["geometryHash"]: p for p in parcels}
    years = [r["year"] for p in parcels for r in p.get("timeseries", [])]
    if not years:
        return {}
    ymin, ymax = min(years), max(years)
    out = {}
    for c in claims:
        p = pmap.get(c.get("geometryHash"))
        if p is None:
            continue
        fv = claim_feature_vector(p, c["vintage"], ymin, ymax, imputer=imputer)
        if fv is None:
            continue
        Xv = np.array([fv], dtype=float)
        sc = float(anomaly_score(model, Xv)[0])
        flag = int(model.predict(Xv)[0] == -1)
        out[c["claimId"]] = {"score": round(sc, 4), "flag": flag}
    return out


if __name__ == "__main__":

    smoke = "--smoke" in sys.argv
    st = train_and_report(GRID_CSV, EVIDENCE_DIR, smoke=smoke)
    brief = {k: v for k, v in st.items() if k not in ("split", "csvContract", "features")}
    print(json.dumps(brief, indent=2, ensure_ascii=False)[:1800])
