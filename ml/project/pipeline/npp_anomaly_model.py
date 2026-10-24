


from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NPP_CSV = os.path.join(ROOT, "data", "npp_subset_fullperiod.csv")
LC_CSV = os.path.join(ROOT, "data", "landcover_34_2024.csv")
EVIDENCE_DIR = os.path.join(ROOT, "evidence")
NPP_MODEL_DIR = os.path.join(EVIDENCE_DIR, "npp_anomaly")
MODEL_PATH = os.path.join(NPP_MODEL_DIR, "npp_anomaly_model.joblib")
TIME_HOLDOUT_MODEL_PATH = os.path.join(NPP_MODEL_DIR, "npp_anomaly_model_timeholdout.joblib")
CELL_HOLDOUT_MODEL_PATH = os.path.join(NPP_MODEL_DIR, "npp_anomaly_model_cellholdout.joblib")
STATUS_PATH = os.path.join(NPP_MODEL_DIR, "npp_anomaly_model_status.json")
SCORES_PATH = os.path.join(NPP_MODEL_DIR, "npp_anomaly_scores.csv")


MODEL_VERSION = "CarbonSat-NPP-AnomalyIF-v1.0"
FEATURE_VERSION = "CarbonSat-NPP-Features-v1.0"


REQUIRED_COLS = ["cellId", "lon", "lat", "year", "validAreaRatio", "npp_kg_m2_yr"]


FEATURES = [
    "npp",
    "nppJump",
    "nppRelJump",
    "nppZscore",
    "validAreaRatio",
    "varJump",
    "yearNorm",
    "eraFlag",
]
ERA_BREAK_YEAR = 2012


TIME_HOLDOUT_CUT_YEAR = 2016
CELL_HOLDOUT_RATIO = 0.25


CONTAMINATION = 0.05
N_ESTIMATORS = 200
RANDOM_STATE = 20261005


CONCENTRATION_MAX_YEAR_SHARE = 0.20


ROBUST_Z_THRESHOLD = 3.5

BASELINE_VALID_AREA = 0.80
BASELINE_NPP_MAX = 3.0


class NppModelInvalid(ValueError):
    pass


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return "sha256:" + h.hexdigest()


def load_npp(csv_path=NPP_CSV):
    if not os.path.isfile(csv_path):
        raise NppModelInvalid(f"缺少 NPP 源表：{csv_path}")
    df = pd.read_csv(csv_path)
    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        raise NppModelInvalid(f"NPP 源表缺列 {missing}（应为由 npp_subset_fullperiod.py 导出的表）")
    for c in ("lon", "lat", "year", "validAreaRatio", "npp_kg_m2_yr"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["cellId"] = df["cellId"].astype(str)
    n0 = len(df)
    df = df.dropna(subset=["year", "npp_kg_m2_yr", "validAreaRatio", "lon", "lat"])
    df = df[(df["npp_kg_m2_yr"] >= 0) & (df["validAreaRatio"] >= 0) & (df["validAreaRatio"] <= 1)]
    df["year"] = df["year"].astype(int)
    df = df.sort_values(["cellId", "year"]).reset_index(drop=True)
    if df.duplicated(subset=["cellId", "year"]).any():
        raise NppModelInvalid("(cellId, year) 重复——NPP 主键必须唯一")
    return df, {"rows_before": n0, "rows_after": int(len(df)), "rows_dropped": n0 - len(df)}


def compute_feature_params(train_df: pd.DataFrame) -> dict:


    tr = train_df.copy()

    cell_stats = {}
    for cid, sub in tr.groupby("cellId"):
        s = sub["npp_kg_m2_yr"]
        m = float(s.median())
        mad = float((s - m).abs().median())
        cell_stats[cid] = {"median": m, "mad": mad}

    gmed = float(tr["npp_kg_m2_yr"].median())
    gmad = float((tr["npp_kg_m2_yr"] - gmed).abs().median())
    ymin = int(tr["year"].min())
    ymax = int(tr["year"].max())
    return {
        "yearMin": ymin,
        "yearMax": ymax,
        "eraBreakYear": ERA_BREAK_YEAR,
        "cellStats": cell_stats,
        "globalMedian": gmed,
        "globalMad": gmad,
        "trainYears": sorted(int(y) for y in tr["year"].unique()),
        "trainCells": sorted(str(c) for c in tr["cellId"].unique()),
    }


def transform_features(df: pd.DataFrame, params: dict, history=None):


    out = df.copy()
    out["npp"] = out["npp_kg_m2_yr"]


    if history is not None:


        npp_jump = np.zeros(len(out), dtype=float)
        npp_rel = np.zeros(len(out), dtype=float)
        var_jump = np.zeros(len(out), dtype=float)
        pos_of = {ix: i for i, ix in enumerate(out.index)}
        for cid, grp in out.groupby("cellId", sort=False):
            sub = grp.sort_values("year")
            seed = history.get(cid)
            prev_npp = seed[0] if seed is not None else float("nan")
            prev_var = seed[1] if seed is not None else float("nan")
            for six, r in sub.iterrows():
                cur_npp = float(r["npp_kg_m2_yr"])
                cur_var = float(r["validAreaRatio"])
                p = pos_of[six]
                if not (np.isnan(prev_npp) or np.isnan(cur_npp)):
                    npp_jump[p] = abs(cur_npp - prev_npp)
                    denom = abs(prev_npp) if abs(prev_npp) > 1e-6 else 1e-6
                    npp_rel[p] = abs(cur_npp - prev_npp) / denom
                if not (np.isnan(prev_var) or np.isnan(cur_var)):
                    var_jump[p] = abs(cur_var - prev_var)
                prev_npp, prev_var = cur_npp, cur_var
        out["nppJump"] = npp_jump
        out["nppRelJump"] = npp_rel
        out["varJump"] = var_jump
    else:

        g = out.groupby("cellId", sort=False)
        out["nppJump"] = g["npp_kg_m2_yr"].diff().abs().fillna(0.0)
        prev = g["npp_kg_m2_yr"].shift(1)
        out["nppRelJump"] = ((out["npp_kg_m2_yr"] - prev).abs()
                             / prev.abs().clip(lower=1e-6)).fillna(0.0)
        out["varJump"] = g["validAreaRatio"].diff().abs().fillna(0.0)


    cs = params["cellStats"]
    med_map = out["cellId"].map(lambda c: cs.get(c, {}).get("median", params["globalMedian"]))
    mad_map = out["cellId"].map(lambda c: cs.get(c, {}).get("mad", params["globalMad"]))
    within_cell = out["cellId"].isin(set(cs.keys())).astype(int)
    scale = (mad_map * 1.4826).replace(0, np.nan)
    out["nppZscore"] = ((out["npp_kg_m2_yr"] - med_map) / scale).fillna(0.0)
    out["withinCellBaseline"] = within_cell


    ymin = params["yearMin"]
    ymax = params["yearMax"]
    out["yearNorm"] = (out["year"] - ymin) / max(1e-9, (ymax - ymin))
    out["eraFlag"] = (out["year"] >= params["eraBreakYear"]).astype(float)

    X = out[FEATURES].to_numpy(dtype=float)
    if np.isnan(X).any():
        bad = [FEATURES[j] for j in range(X.shape[1]) if np.isnan(X[:, j]).any()]
        raise NppModelInvalid(f"特征矩阵含 NaN（列 {bad}）——拒绝训练/推理以免静默污染")
    meta = {
        "featureList": list(FEATURES),
        "featureVersion": FEATURE_VERSION,
        "eraBreakYear": ERA_BREAK_YEAR,
        "yearMin": ymin,
        "yearMax": ymax,
        "nCells": int(out["cellId"].nunique()),
        "nSamples": int(len(out)),
        "withinCellBaselineCount": int(within_cell.sum()),
        "globalFallbackCount": int((within_cell == 0).sum()),
    }
    return X, meta, out


def build_features(df: pd.DataFrame):
    return transform_features(df, compute_feature_params(df))


def _subset_hash(df: pd.DataFrame, params: dict) -> str:

    sub = df[df["cellId"].isin(params["trainCells"])
             & df["year"].isin(params["trainYears"])]
    if len(sub) == 0:
        return "sha256:" + hashlib.sha256(b"").hexdigest()
    sub = sub.sort_values(["cellId", "year"])
    rows = ["%s|%d|%.10f|%.6f" % (r["cellId"], int(r["year"]),
                                   r["npp_kg_m2_yr"], r["validAreaRatio"])
            for _, r in sub.iterrows()]
    return "sha256:" + hashlib.sha256("\n".join(rows).encode("utf-8")).hexdigest()


def cell_group_split(df: pd.DataFrame, test_ratio=CELL_HOLDOUT_RATIO, seed=RANDOM_STATE):

    rng = np.random.default_rng(seed)
    cells = np.array(sorted(df["cellId"].unique()))
    rng.shuffle(cells)
    n_test = max(1, int(round(len(cells) * test_ratio)))
    test_cells = set(cells[:n_test].tolist())
    tr = df[~df["cellId"].isin(test_cells)].reset_index(drop=True)
    te = df[df["cellId"].isin(test_cells)].reset_index(drop=True)
    return tr, te, sorted(test_cells)


def time_block_split(df: pd.DataFrame, cut_year=TIME_HOLDOUT_CUT_YEAR):

    tr = df[df["year"] <= cut_year].reset_index(drop=True)
    te = df[df["year"] > cut_year].reset_index(drop=True)
    return tr, te, cut_year


def _last_year_state(train_df: pd.DataFrame) -> dict:


    s = train_df.sort_values(["cellId", "year"])
    last = s.groupby("cellId", sort=False).tail(1)
    return {str(r["cellId"]): (float(r["npp_kg_m2_yr"]), float(r["validAreaRatio"]))
            for _, r in last.iterrows()}


def train_model(X, contamination=CONTAMINATION, n_estimators=N_ESTIMATORS, seed=RANDOM_STATE):
    m = IsolationForest(n_estimators=n_estimators, contamination=contamination,
                        random_state=seed, n_jobs=-1)
    m.fit(X)
    return m


def score_of(model, X):

    return -model.decision_function(X)


def evaluate_flag_concentration(feat: pd.DataFrame, flags: np.ndarray) -> dict:

    d = feat[["year"]].copy()
    d["flag"] = flags.astype(int)
    n = int(len(d))
    total_flag = int(d["flag"].sum())
    by_year = d.groupby("year")["flag"].agg(["sum", "count"])
    by_year.columns = ["flags", "samples"]
    by_year["flagRate"] = (by_year["flags"] / by_year["samples"]).round(4)
    shares = (by_year["flags"] / max(1, total_flag)).round(4)
    worst_year = int(shares.idxmax()) if total_flag else None
    worst_share = float(shares.max()) if total_flag else 0.0
    era = d[d["year"] >= ERA_BREAK_YEAR]["flag"]
    pre = d[d["year"] < ERA_BREAK_YEAR]["flag"]
    y2012 = d[d["year"] == ERA_BREAK_YEAR]["flag"]
    return {
        "nSamples": n,
        "nFlagged": total_flag,
        "overallFlagRate": round(total_flag / n, 4) if n else 0.0,
        "byYear": {int(y): {"flags": int(r["flags"]), "samples": int(r["samples"]),
                            "flagRate": float(r["flagRate"]),
                            "shareOfAllFlags": float(shares.get(y, 0.0))}
                   for y, r in by_year.iterrows()},
        "maxSingleYearFlagShare": round(worst_share, 4),
        "maxShareYear": worst_year,
        "concentrated": bool(worst_share > CONCENTRATION_MAX_YEAR_SHARE),
        "threshold": CONCENTRATION_MAX_YEAR_SHARE,
        "flagRate_preEra": round(float(pre.mean()), 4) if len(pre) else None,
        "flagRate_era": round(float(era.mean()), 4) if len(era) else None,
        "flagRate_2012": round(float(y2012.mean()), 4) if len(y2012) else None,
        "note": ("集中标记检查：若单一年份 flag 占全部 flag 比例超阈值即判 concentrated。"
                 "2012 年 flag 集中（34/34 格同升的结构性断点），属'集中标记、原因未证实'"
                 "——既非已证实的真实误报，也非治理异常；跨 2012 的异常判定不可用。"),
    }


def evaluate_score_drift(label: str, train_scores: np.ndarray, holdout_scores: np.ndarray) -> dict:

    def stat(s):
        return {"mean": round(float(np.mean(s)), 4), "std": round(float(np.std(s)), 4),
                "p50": round(float(np.percentile(s, 50)), 4),
                "p95": round(float(np.percentile(s, 95)), 4),
                "max": round(float(np.max(s)), 4)}
    return {
        "label": label,
        "trainStat": stat(train_scores),
        "holdoutStat": stat(holdout_scores),
        "meanShift": round(float(np.mean(holdout_scores) - np.mean(train_scores)), 4),
        "note": "无真实标签，只比较分数分布漂移；不构成准确率/召回率。",
    }


def inject_synthetic(df_feat: pd.DataFrame, frac=0.10, seed=RANDOM_STATE):

    rng = np.random.default_rng(seed)
    n = len(df_feat)
    k = max(1, int(round(n * frac)))
    idx = rng.choice(n, size=k, replace=False)
    cp = df_feat.iloc[idx].copy().reset_index(drop=True)
    for i in range(len(cp)):
        kind = rng.integers(0, 3)
        if kind == 0:
            cp.at[i, "npp"] = float(cp.at[i, "npp"] * (3.0 if rng.random() < 0.5 else 0.1))
        elif kind == 1:
            cp.at[i, "nppRelJump"] = 0.9
        else:
            cp.at[i, "validAreaRatio"] = 0.05
    cp["is_anomaly_label"] = 1
    base = df_feat.copy()
    base["is_anomaly_label"] = 0
    return pd.concat([base, cp], ignore_index=True)


def process_test(model, holdout_feat) -> dict:

    lab = inject_synthetic(holdout_feat)
    X = lab[FEATURES].to_numpy(dtype=float)
    s = score_of(model, X)
    y = lab["is_anomaly_label"].to_numpy(dtype=int)
    pred = (model.predict(X) == -1).astype(int)
    tp = int(((pred == 1) & (y == 1)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    k = max(1, int(y.sum()))
    order = np.argsort(-s)
    return {
        "scope": "PROCESS_TEST_ONLY",
        "nInjectedAnomalies": int(y.sum()),
        "precision_onSynthetic": round(p, 4),
        "recall_onSynthetic": round(r, 4),
        "precisionAtK_onSynthetic": round(float(y[order[:k]].mean()), 4),
        "truePositives": tp, "falsePositives": fp, "falseNegatives": fn,
        "disclaimer": ("以上 precision/recall 仅针对**注入的合成异常**，"
                       "用于验证代码路径。真实 NPP 格年无异常标签，"
                       "因此不存在真实 Precision/Recall/置信度，本项目不作此类声明。"),
    }


def robust_statistical_baseline(df: pd.DataFrame, params: dict, threshold=ROBUST_Z_THRESHOLD):


    cs = params["cellStats"]
    gmed = params["globalMedian"]
    gmad = params["globalMad"]
    med = df["cellId"].map(lambda c: cs.get(c, {}).get("median", gmed))
    mad = df["cellId"].map(lambda c: cs.get(c, {}).get("mad", gmad))
    scale = (mad * 1.4826).replace(0, np.nan)
    z = ((df["npp_kg_m2_yr"] - med) / scale).fillna(0.0)
    flag = (z.abs() > threshold).astype(int).to_numpy()
    return z.to_numpy(), flag, threshold


def compare_rankings(feat: pd.DataFrame, ml_flags, ml_scores, params: dict,
                     threshold=ROBUST_Z_THRESHOLD):


    z, base_flags, _ = robust_statistical_baseline(feat, params, threshold)
    rule_flags = ((feat["validAreaRatio"] < BASELINE_VALID_AREA) |
                  (feat["npp_kg_m2_yr"] < 0) |
                  (feat["npp_kg_m2_yr"] > BASELINE_NPP_MAX)).astype(int).to_numpy()
    ml = np.asarray(ml_flags).astype(int)
    n_ml, n_rule, n_base = int(ml.sum()), int(rule_flags.sum()), int(base_flags.sum())
    ml_rule = int(((ml == 1) & (rule_flags == 1)).sum())
    ml_base = int(((ml == 1) & (base_flags == 1)).sum())
    rule_base = int(((rule_flags == 1) & (base_flags == 1)).sum())
    all3 = int(((ml == 1) & (rule_flags == 1) & (base_flags == 1)).sum())

    rho = None
    try:
        from scipy.stats import spearmanr
        if len(ml_scores) > 1:
            r = spearmanr(np.asarray(ml_scores, dtype=float), np.abs(z))
            rho = (None if (r.correlation != r.correlation) else float(r.correlation))
    except Exception:
        rho = None
    return {
        "threshold": threshold,
        "nML": n_ml, "nRule": n_rule, "nBaseline": n_base,
        "overlap": {"mlAndRule": ml_rule, "mlAndBaseline": ml_base,
                    "ruleAndBaseline": rule_base, "allThree": all3},
        "mlOnly": n_ml - ml_base - ml_rule + all3,
        "baselineOnly": n_base - ml_base - rule_base + all3,
        "ruleOnly": n_rule - ml_rule - rule_base + all3,
        "spearmanMlVsAbsZ": rho,
        "honestyNote": ("无真实标签：仅报告三类方法的 flag 重合/分歧计数与排序相关性；"
                        "不以分数漂移证明模型有效。"
                        "规则基线仅用数据有效性字段（validAreaRatio / NPP 越界），未含土地覆盖检查。"),
    }


def _save_model(bundle, path):
    import joblib
    os.makedirs(os.path.dirname(path), exist_ok=True)
    joblib.dump(bundle, path)
    return sha256_file(path)


def train_and_report(csv_path=NPP_CSV, out_dir=NPP_MODEL_DIR):
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    csv_hash = sha256_file(csv_path)

    df, load_rep = load_npp(csv_path)


    params_full = compute_feature_params(df)
    X_full, fmeta_full, feat_full = transform_features(df, params_full)
    model_full = train_model(X_full)
    scores_full = score_of(model_full, X_full)
    flags_full = (model_full.predict(X_full) == -1).astype(int)


    tr2, te2, cut = time_block_split(df)
    params_t = compute_feature_params(tr2)
    X_tr2, fmeta_t, _ = transform_features(tr2, params_t)
    model_t = train_model(X_tr2)


    history_t = _last_year_state(tr2)
    X_te2, fmeta_te2, feat_te2 = transform_features(te2, params_t, history=history_t)
    scores_te2 = score_of(model_t, X_te2)
    flags_te2 = (model_t.predict(X_te2) == -1).astype(int)
    drift_time = evaluate_score_drift(
        "时间留出：≤2016 模型评分 >2016（测试年未被训练，首年跳变用训练末年基线）",
        score_of(model_t, X_tr2), scores_te2)


    tr_c, te_c, test_cells = cell_group_split(df)
    params_c = compute_feature_params(tr_c)
    X_tr_c, fmeta_c, _ = transform_features(tr_c, params_c)
    model_c = train_model(X_tr_c)
    X_te_c, fmeta_te_c, feat_te_c = transform_features(te_c, params_c)
    scores_te_c = score_of(model_c, X_te_c)
    flags_te_c = (model_c.predict(X_te_c) == -1).astype(int)
    drift_cell = evaluate_score_drift(
        "空间留出：所见网格模型评分未见网格（新网格用全局回退基线）",
        score_of(model_c, X_tr_c), scores_te_c)


    rc_full = compare_rankings(feat_full, flags_full, scores_full, params_full)
    rc_time = compare_rankings(feat_te2, flags_te2, scores_te2, params_t)
    rc_cell = compare_rankings(feat_te_c, flags_te_c, scores_te_c, params_c)
    ranking_comparison = {
        "note": ("在各自留出测试集上比较 ML 排序与现有规则、稳健统计基线的重合/分歧；"
                 "无真实标签，仅作描述性重合/分歧统计，不以分数漂移证明模型有效。"),
        "baseline": "per-cell median/MAD 稳健 z（冻结训练期参数，|z|>%.1f 标异常）" % ROBUST_Z_THRESHOLD,
        "full": rc_full, "timeHoldout": rc_time, "cellHoldout": rc_cell,
    }


    concentration = evaluate_flag_concentration(feat_full, flags_full)


    ptest = process_test(model_full, feat_te_c)


    formal_hash = _save_model({
        "model": model_full, "modelVersion": MODEL_VERSION,
        "featureVersion": FEATURE_VERSION, "features": list(FEATURES),
        "eraBreakYear": ERA_BREAK_YEAR, "contamination": CONTAMINATION,
        "featureParams": params_full, "trainingCsvSha256": csv_hash,
        "trainingSubsetSha256": _subset_hash(df, params_full),
        "trainedAt": ts,
    }, MODEL_PATH)

    time_hash = _save_model({
        "model": model_t, "modelVersion": MODEL_VERSION,
        "featureVersion": FEATURE_VERSION, "features": list(FEATURES),
        "eraBreakYear": ERA_BREAK_YEAR, "contamination": CONTAMINATION,
        "featureParams": params_t, "trainingCsvSha256": csv_hash,
        "trainingSubsetSha256": _subset_hash(tr2, params_t),
        "trainedAt": ts,
    }, TIME_HOLDOUT_MODEL_PATH)

    cell_hash = _save_model({
        "model": model_c, "modelVersion": MODEL_VERSION,
        "featureVersion": FEATURE_VERSION, "features": list(FEATURES),
        "eraBreakYear": ERA_BREAK_YEAR, "contamination": CONTAMINATION,
        "featureParams": params_c, "trainingCsvSha256": csv_hash,
        "trainingSubsetSha256": _subset_hash(tr_c, params_c),
        "trainedAt": ts,
    }, CELL_HOLDOUT_MODEL_PATH)


    score_tbl = pd.DataFrame({
        "cellId": feat_full["cellId"], "year": feat_full["year"],
        "mlScore": np.round(scores_full, 6), "mlFlag": flags_full,
        "eraFlag": feat_full["eraFlag"].astype(int),
        "withinCellBaseline": feat_full["withinCellBaseline"].astype(int),
    })
    score_tbl.to_csv(SCORES_PATH, index=False)

    status = {
        "trained": True,
        "modelVersion": MODEL_VERSION,
        "featureVersion": FEATURE_VERSION,
        "modelType": "IsolationForest(unsupervised, NPP-specific, 3 separate models)",
        "generatedAt": ts,
        "trainingCsv": os.path.relpath(csv_path, ROOT).replace("\\", "/"),
        "trainingCsvSha256": csv_hash,
        "loadReport": load_rep,
        "features": list(FEATURES),
        "eraBreakYear": ERA_BREAK_YEAR,
        "contamination": CONTAMINATION,
        "nEstimators": N_ESTIMATORS,
        "randomState": RANDOM_STATE,
        "featureMeta": fmeta_full,
        "modelPath": os.path.relpath(MODEL_PATH, ROOT).replace("\\", "/"),
        "timeHoldoutModelPath": os.path.relpath(TIME_HOLDOUT_MODEL_PATH, ROOT).replace("\\", "/"),
        "cellHoldoutModelPath": os.path.relpath(CELL_HOLDOUT_MODEL_PATH, ROOT).replace("\\", "/"),
        "scoreTable": os.path.relpath(SCORES_PATH, ROOT).replace("\\", "/"),
        "formalModel": {
            "role": "供正式逐条推断使用（816 条分数表 / 证据记录）",
            "trainSamples": int(len(feat_full)),
            "trainYears": [params_full["yearMin"], params_full["yearMax"]],
            "trainCellsCount": len(params_full["trainCells"]),
            "trainingSubsetSha256": _subset_hash(df, params_full),
            "featureParamsSummary": {
                "yearMin": params_full["yearMin"], "yearMax": params_full["yearMax"],
                "eraBreakYear": ERA_BREAK_YEAR, "nCells": len(params_full["cellStats"]),
                "globalFallbackCells": int(fmeta_full["globalFallbackCount"]),
            },
            "modelFileHash": formal_hash,
        },
        "timeHoldout": {
            "role": "仅用于时间外推检查；时间测试集(>%d)只由本模型评分" % TIME_HOLDOUT_CUT_YEAR,
            "cutYear": TIME_HOLDOUT_CUT_YEAR,
            "trainSamples": int(len(tr2)),
            "trainYears": [params_t["yearMin"], params_t["yearMax"]],
            "trainCellsCount": len(params_t["trainCells"]),
            "testSamples": int(len(te2)),
            "testYears": [int(te2["year"].min()), int(te2["year"].max())],
            "trainingSubsetSha256": _subset_hash(tr2, params_t),
            "featureParamsSummary": {
                "yearMin": params_t["yearMin"], "yearMax": params_t["yearMax"],
                "eraBreakYear": ERA_BREAK_YEAR,
            },
            "modelFileHash": time_hash,
            "historySeed": {
                "purpose": ("为测试期逐格提供截至训练期最后一年的 NPP 与 validAreaRatio 历史状态，"
                            "使 2017 可用 2016 值算跳变；后续年份只用其前一已出现的值 carry-forward"),
                "source": "tr2（训练期 ≤%d）每格最后一年（即 2016）的 (npp, validAreaRatio)" % TIME_HOLDOUT_CUT_YEAR,
                "rule": ("首测试年(>训练末年)跳变=与本格训练末年之差；其后逐年只用前一已出现年；"
                         "绝不读取未来年份，也不重算冻结的 median/MAD 或年份归一化参数"),
                "nCellsSeeded": len(history_t),
                "illustrative_cell_0020_2017_nppJump": (
                    "由 2016、2017 原始 NPP 之差计算（非 0 修复）；具体值见下方反例①核验"),
            },
            "note": ("时间测试集(>%d)只由本 ≤%d 模型评分；yearNorm 的 (min,max) 与"
                     "格内 median/MAD 均用训练期(≤%d)固定参数；首年跳变改用训练末年历史基线"
                     "（修复此前在测试子集内重算导致的 2017 特征=0 的泄漏/缺失）"
                     % (TIME_HOLDOUT_CUT_YEAR, TIME_HOLDOUT_CUT_YEAR, TIME_HOLDOUT_CUT_YEAR)),
        },
        "cellHoldout": {
            "role": "仅用于空间外推检查；未见网格只由本模型评分",
            "testRatio": CELL_HOLDOUT_RATIO,
            "nHoldoutCells": len(test_cells),
            "testSamples": int(len(te_c)),
            "testCellsSample": test_cells[:5],
            "trainSamples": int(len(tr_c)),
            "trainCellsCount": len(params_c["trainCells"]),
            "withinCellBaselineAvailableCount": int(fmeta_te_c["withinCellBaselineCount"]),
            "globalFallbackCount": int(fmeta_te_c["globalFallbackCount"]),
            "trainingSubsetSha256": _subset_hash(tr_c, params_c),
            "featureParamsSummary": {
                "yearMin": params_c["yearMin"], "yearMax": params_c["yearMax"],
                "eraBreakYear": ERA_BREAK_YEAR,
            },
            "modelFileHash": cell_hash,
            "fallbackNote": ("未见网格无历史基线 → 回退全局 median/MAD 并标记"
                             "withinCellBaseline=0；绝不跨测试网格重算格内统计量（防空间泄漏）。"),
        },
        "holdoutDefinition": {
            "time": {
                "split": "year <= %d 训练，> %d 测试" % (TIME_HOLDOUT_CUT_YEAR, TIME_HOLDOUT_CUT_YEAR),
                "scorer": "只由 ≤%d 模型评分（测试年未被训练）" % TIME_HOLDOUT_CUT_YEAR,
                "fixedParams": True,
                "leakageChecks": ["yearNorm 用训练期(min,max)而非测试集自身",
                                  "格内 median/MAD 用训练期，不用测试期未来年份"],
            },
            "cell": {
                "split": "按网格分组，%.0f%% 网格作未见单元" % (CELL_HOLDOUT_RATIO * 100),
                "scorer": "只由所见网格模型评分",
                "fixedParams": True,
                "unseenCellFallback": "全局 median/MAD，标记 withinCellBaseline=0",
            },
        },
        "holdoutScoreDrift": {"time": drift_time, "cell": drift_cell},
        "flagConcentration": concentration,
        "processTest": ptest,
        "whySeparateModel": (
            "旧模型 CarbonSat-AnomalyIF-v1.0 的 7 维特征为 "
            "fvc/ndvi/clearPixelRatio/spatialCoverage/sensorAgreement/fvcJump/yearNorm，"
            "而 NPP 源表仅有 cellId/lon/lat/year/validAreaRatio/npp_kg_m2_yr；"
            "其中 fvc/ndvi/clearPixelRatio/spatialCoverage/sensorAgreement 完全不存在。"
            "sklearn 只校验维度不校验语义（实测零向量可正常返回分数），"
            "直接套用旧分数会得到无意义结果。本模型独立训练，并显式区分三套模型以堵住留出评估的信息泄漏。"),
        "noRealLabels": True,
        "honestyStatement": (
            "真实 NPP 格年没有异常标签，因此本模型【不提供也不声称】真实 "
            "Precision / Recall / F1 / 置信度。所有指标要么是描述性的"
            "（flag 率、集中度、分数分布漂移），要么明确标注为合成注入的流程测试。"
            "时间/空间留出评估各自使用独立训练的模型与冻结特征参数，"
            "时间测试集只由 ≤%d 模型评分，杜绝训练期见到测试年份或测试网格。" % TIME_HOLDOUT_CUT_YEAR),
        "year2012Statement": (
            "2012 年 flag 属【集中标记、原因未证实】（concentrated flagging, cause unverified）："
            "既非已证实的真实误报（real false positive），也非治理异常（governance anomaly）。"
            "严禁据此宣称模型可靠或存在治理效应；跨 2012 的异常判定不可用。"),
        "advisoryOnly": ("ML 分数与规则预审都只给 REVIEW 优先级，"
                         "不影响 attributionStatus / insufficient_evidence / REMOVAL 门禁。"),
        "rankingComparison": ranking_comparison,
    }
    _write(STATUS_PATH, status)
    return status


class NppModelUnavailable(RuntimeError):
    pass


def load_model(status_path=STATUS_PATH, model_path=MODEL_PATH, require_params=True):
    if not os.path.isfile(status_path):
        raise NppModelUnavailable(f"缺 NPP 模型状态文件：{status_path}")
    with open(status_path, encoding="utf-8") as f:
        st = json.load(f)
    if not st.get("trained"):
        raise NppModelUnavailable(f"NPP 模型未训练：{st.get('reason')}")
    if not os.path.isfile(model_path):
        raise NppModelUnavailable(f"缺 NPP 模型文件：{model_path}")
    import joblib
    try:
        bundle = joblib.load(model_path)
    except Exception as e:
        raise NppModelUnavailable(f"加载 NPP 模型失败 {model_path}: {e}")
    if not isinstance(bundle, dict) or "model" not in bundle:
        raise NppModelUnavailable("NPP 模型 bundle 缺少 'model' 字段")

    if bundle.get("features") != list(FEATURES):
        raise NppModelUnavailable(
            f"特征契约不匹配：模型随附 {bundle.get('features')}，当前代码 {list(FEATURES)}。"
            "拒绝推理（须重训或回退代码到对应版本）。")
    if bundle.get("modelVersion") != MODEL_VERSION:
        raise NppModelUnavailable(
            f"模型版本不匹配：模型 {bundle.get('modelVersion')} vs 代码 {MODEL_VERSION}")

    if require_params and "featureParams" not in bundle:
        raise NppModelUnavailable("模型 bundle 缺少 featureParams（冻结特征变换参数）——拒绝推理")
    return bundle, st


def infer(df: pd.DataFrame, status_path=STATUS_PATH, model_path=MODEL_PATH):


    bundle, st = load_model(status_path, model_path)
    model = bundle["model"]
    params = bundle["featureParams"]
    X, _, feat = transform_features(df, params)
    s = score_of(model, X)
    f = (model.predict(X) == -1).astype(int)
    return s, f, st, bundle


def _write(path, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def load_status_safe():
    try:
        with open(STATUS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def verify_scores_table(root=ROOT):

    errs = []
    if not os.path.isfile(SCORES_PATH):
        return False, ["缺分数表：%s" % SCORES_PATH]
    try:
        bundle, st = load_model()
    except NppModelUnavailable as e:
        return False, [str(e)]
    params = bundle["featureParams"]
    df, _ = load_npp()
    X, _, feat = transform_features(df, params)
    s = score_of(bundle["model"], X)
    f = (bundle["model"].predict(X) == -1).astype(int)
    exp = pd.DataFrame({"cellId": feat["cellId"], "year": feat["year"],
                        "mlScore": np.round(s, 6), "mlFlag": f,
                        "eraFlag": feat["eraFlag"].astype(int),
                        "withinCellBaseline": feat["withinCellBaseline"].astype(int)})

    subset_now = _subset_hash(df, params)
    if subset_now != st["formalModel"]["trainingSubsetSha256"]:
        errs.append("训练子集哈希失配（源 CSV 已改动或参数漂移）：表=%s 重算=%s"
                    % (st["formalModel"]["trainingSubsetSha256"], subset_now))
    got = pd.read_csv(SCORES_PATH)
    if len(got) != len(exp):
        errs.append("分数表行数不符（表=%d，重算=%d）" % (len(got), len(exp)))
        return False, errs
    m = got.merge(exp, on=["cellId", "year"], how="inner", suffixes=("_got", "_exp"))
    if len(m) != len(exp):
        errs.append("分数表 (cellId,year) 与重算结果无法对齐")
        return False, errs
    for col in ("mlScore", "mlFlag", "eraFlag", "withinCellBaseline"):
        bad = m[(m[f"{col}_got"] - m[f"{col}_exp"]).abs() > 1e-6]
        if len(bad):
            errs.append("有 %d 条 %s 与重算不符（如 %s: 表=%r 重算=%r）"
                        % (len(bad), col, bad.iloc[0]["cellId"],
                           bad.iloc[0][f"{col}_got"], bad.iloc[0][f"{col}_exp"]))
    return (not errs), errs


def _features_past_unchanged_by_future(csv_path, model_path, params):


    import tempfile as _tf
    import shutil as _sh
    tmp = _tf.mkdtemp(prefix="npp-leak-")
    try:

        orig = pd.read_csv(csv_path)

        mod = orig.copy()
        mask24 = mod["year"] == 2024
        mod.loc[mask24, "npp_kg_m2_yr"] = mod.loc[mask24, "npp_kg_m2_yr"] + 0.5
        p_orig = os.path.join(tmp, "orig.csv")
        p_mod = os.path.join(tmp, "mod.csv")
        orig.to_csv(p_orig, index=False)
        mod.to_csv(p_mod, index=False)

        d_o, _ = load_npp(p_orig)
        d_m, _ = load_npp(p_mod)
        X_o, _, f_o = transform_features(d_o, params)
        X_m, _, f_m = transform_features(d_m, params)

        key = lambda f: list(zip(f["cellId"], f["year"]))
        ko, km = key(f_o), key(f_m)
        common = [k for k in ko if k in set(km) and k[1] <= 2016]
        idx_o = {k: i for i, k in enumerate(ko)}
        idx_m = {k: i for i, k in enumerate(km)}
        diffs = 0
        for k in common:
            i, j = idx_o[k], idx_m[k]
            if not np.allclose(X_o[i], X_m[j], atol=1e-9, equal_nan=True):
                diffs += 1
        return diffs, len(common)
    finally:
        _sh.rmtree(tmp, ignore_errors=True)


def run_selftest():
    results = []

    def check(name, ok, detail=""):
        results.append((name, bool(ok), detail))
        print("[%s] %s%s" % ("PASS" if ok else "FAIL", name,
                              ("  -> " + detail) if detail else ""))

    check("正例：模型版本与特征版本已升级为 NPP 专用",
          MODEL_VERSION.startswith("CarbonSat-NPP-")
          and "fvc" not in FEATURES and "ndvi" not in FEATURES,
          "model=%s features=%d" % (MODEL_VERSION, len(FEATURES)))
    check("正例：特征含 eraFlag（2012 结构性断点显式建模）",
          "eraFlag" in FEATURES and ERA_BREAK_YEAR == 2012,
          "eraBreakYear=%d" % ERA_BREAK_YEAR)
    check("正例：状态声明无真实标签、不声称真实 P/R",
          "noRealLabels" in load_status_safe() and "不提供也不声称" in load_status_safe()["honestyStatement"],
          "已声明")

    st = load_status_safe()
    if not st.get("trained"):
        check("前置：模型已训练", False, "请先运行 --train")
        total = len(results)
        passed = sum(1 for _, ok, _ in results if ok)
        print("-" * 74)
        print("NPP 异常模型自检：%d/%d 通过" % (passed, total))
        return passed == total


    check("正例：模型 bundle 含冻结 featureParams（防重算泄漏）",
          "featureParams" in _model_params_ok(), "featureParams 存在")
    check("正例：时间/空间留出各使用独立训练的模型文件",
          os.path.isfile(TIME_HOLDOUT_MODEL_PATH) and os.path.isfile(CELL_HOLDOUT_MODEL_PATH),
          "time=%s cell=%s" % (os.path.basename(TIME_HOLDOUT_MODEL_PATH),
                                os.path.basename(CELL_HOLDOUT_MODEL_PATH)))


    conc = st["flagConcentration"]
    check("正例：2012 集中标记已检出并如实报告（不掩盖）",
          conc.get("concentrated") is True and conc.get("maxShareYear") == ERA_BREAK_YEAR
          and conc.get("flagRate_2012", 0) > max(conc.get("flagRate_preEra") or 0, 1e-9) * 5,
          "2012 flagRate=%.4f vs preEra=%.4f（%.1fx），单年占比=%.4f → concentrated=%s"
          % (conc.get("flagRate_2012", -1), conc.get("flagRate_preEra") or -1,
             (conc.get("flagRate_2012", 0) / max(conc.get("flagRate_preEra") or 1e-9, 1e-9)),
             conc.get("maxSingleYearFlagShare", -1), conc.get("concentrated")))
    check("正例：2012 措辞为'集中标记、原因未证实'，并以否认形式排除真实误报/治理异常",
          "集中标记、原因未证实" in st.get("year2012Statement", "")
          and "既非" in st.get("year2012Statement", ""),
          st.get("year2012Statement", "")[:40])


    check("正例：留出评估按时间/空间两组分别报告（各自独立模型）",
          "time" in st["holdoutScoreDrift"] and "cell" in st["holdoutScoreDrift"],
          "time meanShift=%s cell meanShift=%s"
          % (st["holdoutScoreDrift"]["time"]["meanShift"],
             st["holdoutScoreDrift"]["cell"]["meanShift"]))
    check("正例：状态含训练样本数/年份/网格/训练子集哈希/留出定义/模型文件哈希",
          all(k in st["formalModel"] for k in ("trainSamples", "trainYears", "trainCellsCount",
                                               "trainingSubsetSha256", "modelFileHash"))
          and "holdoutDefinition" in st and "timeHoldout" in st and "cellHoldout" in st,
          "formal.trainSamples=%s timeHoldout.trainSamples=%s"
          % (st["formalModel"]["trainSamples"], st["timeHoldout"]["trainSamples"]))
    check("正例：合成注入评估明确标 PROCESS_TEST_ONLY",
          st["processTest"]["scope"] == "PROCESS_TEST_ONLY", st["processTest"]["scope"])


    rc = st.get("rankingComparison")
    check("正例：状态含排名比较（时间/空间留出 + 全量）三节",
          rc is not None and all(k in rc for k in ("timeHoldout", "cellHoldout", "full")),
          "keys=%s" % (list(rc.keys()) if rc else None))
    if rc is not None:
        rc_blob = json.dumps(rc, ensure_ascii=False).lower()
        banned = ("precision", "recall", "f1", "accuracy", "准确率")
        check("诚实：排名比较不含 Precision/Recall/F1/准确率 等误导性指标",
              not any(t in rc_blob for t in banned),
              "已规避" if not any(t in rc_blob for t in banned) else "含禁用词")
        for sec in ("full", "timeHoldout", "cellHoldout"):
            s = rc.get(sec, {})
            check("正例：排名比较[%s] 含 ML/规则/基线 计数与重合" % sec,
                  all(k in s for k in ("nML", "nRule", "nBaseline", "overlap")),
                  "nML=%s nBase=%s" % (s.get("nML"), s.get("nBaseline")))


    import joblib
    b_t = joblib.load(TIME_HOLDOUT_MODEL_PATH)
    pt = b_t["featureParams"]
    check("正例：≤2016 时间留出模型的训练年份全 ≤2016（未见过测试年份）",
          max(pt["trainYears"]) <= TIME_HOLDOUT_CUT_YEAR
          and min(pt["trainYears"]) >= 2001,
          "trainYears=[%d,%d]" % (min(pt["trainYears"]), max(pt["trainYears"])))
    test_years = set(range(TIME_HOLDOUT_CUT_YEAR + 1, 2025))
    train_years_set = set(pt["trainYears"])
    check("正例：时间测试年（>2016）被排除在训练年份之外",
          len(test_years & train_years_set) == 0,
          "交集=%s" % sorted(test_years & train_years_set))
    check("正例：时间留出 drift 用 ≤2016 模型评分 >2016（label 明示）",
          "≤2016" in st["holdoutScoreDrift"]["time"]["label"]
          and ">2016" in st["holdoutScoreDrift"]["time"]["label"],
          st["holdoutScoreDrift"]["time"]["label"])


    b_c = joblib.load(CELL_HOLDOUT_MODEL_PATH)
    pc = b_c["featureParams"]
    check("正例：未见网格标记 withinCellBaseline=0（回退全局基线）",
          st["cellHoldout"]["globalFallbackCount"] > 0
          and st["cellHoldout"]["withinCellBaselineAvailableCount"]
             + st["cellHoldout"]["globalFallbackCount"]
             == st["cellHoldout"]["testSamples"]
          and "全局 median/MAD" in st["cellHoldout"]["fallbackNote"],
          "testSamples=%d baseline=%d fallback=%d"
          % (st["cellHoldout"]["testSamples"],
             st["cellHoldout"]["withinCellBaselineAvailableCount"],
             st["cellHoldout"]["globalFallbackCount"]))

    check("正例：三套模型训练子集哈希互不相同（独立训练）",
          st["formalModel"]["trainingSubsetSha256"]
             != st["timeHoldout"]["trainingSubsetSha256"]
          != st["cellHoldout"]["trainingSubsetSha256"],
          "formal/time/cell 三哈希互异")


    try:
        load_model(STATUS_PATH, os.path.join(NPP_MODEL_DIR, "nonexistent.joblib"))
        check("反例1 缺模型文件：推理必须失败关闭", False, "竟然成功加载（错误）")
    except NppModelUnavailable as e:
        check("反例1 缺模型文件：推理失败关闭（不静默回退规则）", True, str(e)[:90])


    import tempfile as _tf
    import shutil as _sh2
    b = joblib.load(MODEL_PATH)
    b2 = dict(b)
    b2["features"] = ["fvc", "ndvi", "clearPixelRatio", "spatialCoverage",
                      "sensorAgreement", "fvcJump", "yearNorm"]
    _tmpdir = _tf.mkdtemp(prefix="npp-badfeat-")
    bad = os.path.join(_tmpdir, "bad_features.joblib")
    joblib.dump(b2, bad)
    try:
        load_model(STATUS_PATH, bad)
        check("反例2 特征不匹配（换成旧模型 7 维特征）：必须拒绝推理", False, "竟然通过（错误）")
    except NppModelUnavailable as e:
        check("反例2 特征不匹配：拒绝推理（防套用旧特征口径）", True, str(e)[:100])
    finally:
        _sh2.rmtree(_tmpdir, ignore_errors=True)


    import shutil as _sh
    _tmpdir3 = _tf.mkdtemp(prefix="npp-scores-")
    bak = os.path.join(_tmpdir3, "scores_backup.csv")
    _sh.copy2(SCORES_PATH, bak)
    try:
        t = pd.read_csv(SCORES_PATH)
        t.loc[0, "mlScore"] = float(t.loc[0, "mlScore"]) + 0.5
        t.to_csv(SCORES_PATH, index=False)
        ok3, errs3 = verify_scores_table()
        check("反例3 篡改逐条分数：verify_scores_table 抓出", (not ok3) and bool(errs3),
              "; ".join(errs3[:2]) or "（未抓出）")
    finally:
        _sh.copy2(bak, SCORES_PATH)
        _sh.rmtree(_tmpdir3, ignore_errors=True)
    ok3b, errs3b = verify_scores_table()
    check("反例3 还原后 verify 恢复通过（确认篡改确实被检出，非误报）",
          ok3b, "; ".join(errs3b[:2]) or "已恢复")


    df0, _ = load_npp()
    params_t0 = compute_feature_params(df0[df0["year"] <= TIME_HOLDOUT_CUT_YEAR])
    diffs, ncommon = _features_past_unchanged_by_future(NPP_CSV, TIME_HOLDOUT_MODEL_PATH, params_t0)
    check("反例4 改动未来年份(2024)不改变过去(≤2016)特征（yearNorm/格内z 用冻结参数）",
          ncommon > 0 and diffs == 0,
          "common≤2016 行=%d 特征差异=%d" % (ncommon, diffs))


    b_t2 = joblib.load(TIME_HOLDOUT_MODEL_PATH)
    sub_hash_train = b_t2["trainingSubsetSha256"]

    df_chk, _ = load_npp()
    tr_chk = df_chk[df_chk["year"] <= TIME_HOLDOUT_CUT_YEAR]
    recomputed = _subset_hash(tr_chk, compute_feature_params(tr_chk))
    unseen = set(range(TIME_HOLDOUT_CUT_YEAR + 1, int(df_chk["year"].max()) + 1))
    train_years = set(b_t2["featureParams"]["trainYears"])
    check("反例5 时间留出模型训练子集哈希 = ≤2016 子集且不含测试年",
          sub_hash_train == recomputed and len(unseen & train_years) == 0,
          "子集哈希一致=%s 测试年未被训练=%s" % (sub_hash_train == recomputed,
                                             len(unseen & train_years) == 0))


    df_c, _ = load_npp()
    tr_c, te_c, _ = time_block_split(df_c)
    hist_c = _last_year_state(tr_c)
    _, _, feat_te_c = transform_features(te_c, compute_feature_params(tr_c), history=hist_c)
    r17 = feat_te_c[(feat_te_c["cellId"] == "cell_0020") & (feat_te_c["year"] == 2017)]
    if len(r17) != 1:
        check("反例6 cell_0020_2017 存在于时间测试集", False, "找到 %d 行" % len(r17))
    else:
        r17 = r17.iloc[0]
        v16 = float(df_c[(df_c["cellId"] == "cell_0020") & (df_c["year"] == 2016)]["npp_kg_m2_yr"].iloc[0])
        v17 = float(df_c[(df_c["cellId"] == "cell_0020") & (df_c["year"] == 2017)]["npp_kg_m2_yr"].iloc[0])
        vr16 = float(df_c[(df_c["cellId"] == "cell_0020") & (df_c["year"] == 2016)]["validAreaRatio"].iloc[0])
        vr17 = float(df_c[(df_c["cellId"] == "cell_0020") & (df_c["year"] == 2017)]["validAreaRatio"].iloc[0])
        exp_jump = abs(v17 - v16)
        exp_rel = abs(v17 - v16) / (abs(v16) if abs(v16) > 1e-6 else 1e-6)
        exp_vjump = abs(vr17 - vr16)
        ok6 = (abs(r17["nppJump"] - exp_jump) < 1e-9
               and abs(r17["nppRelJump"] - exp_rel) < 1e-9
               and abs(r17["varJump"] - exp_vjump) < 1e-9
               and exp_jump > 0)
        check("反例6 cell_0020_2017 跳变特征 == 由 2016&2017 原始值计算的变化（且非 0）",
              ok6, "nppJump=%.8f(期望%.8f) relJump=%.8f varJump=%.8f"
              % (r17["nppJump"], exp_jump, r17["nppRelJump"], r17["varJump"]))


    df_mod = df_c.copy()
    m1824 = df_mod["year"] >= 2018
    df_mod.loc[m1824, "npp_kg_m2_yr"] = df_mod.loc[m1824, "npp_kg_m2_yr"] + 5.0
    df_mod.loc[m1824, "validAreaRatio"] = (df_mod.loc[m1824, "validAreaRatio"] * 0.5).clip(0, 1)
    tr_m, te_m, _ = time_block_split(df_mod)
    hist_m = _last_year_state(tr_m)
    _, _, feat_mod = transform_features(te_m, compute_feature_params(tr_m), history=hist_m)
    r17m = feat_mod[(feat_mod["cellId"] == "cell_0020") & (feat_mod["year"] == 2017)]
    if len(r17m) != 1:
        check("反例7 改动 2018+ 数据后 cell_0020_2017 仍存在", False, "找到 %d 行" % len(r17m))
    else:
        r17m = r17m.iloc[0]
        ok7 = (abs(r17m["nppJump"] - r17["nppJump"]) < 1e-9
               and abs(r17m["nppRelJump"] - r17["nppRelJump"]) < 1e-9
               and abs(r17m["varJump"] - r17["varJump"]) < 1e-9)
        check("反例7 改动 2018+ 年数据不改变 cell_0020_2017 的跳变特征",
              ok7, "2017 跳变特征在改动前后一致（carry-forward 不读未来年）")

    total = len(results)
    passed = sum(1 for _, ok, _ in results if ok)
    print("-" * 74)
    print("NPP 异常模型自检：%d/%d 通过" % (passed, total))
    if passed != total:
        print("未通过项：")
        for n, ok, d in results:
            if not ok:
                print("  - %s%s" % (n, ("  -> " + d) if d else ""))
    return passed == total


def _model_params_ok():

    import joblib
    try:
        return joblib.load(MODEL_PATH)
    except Exception:
        return {}


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if "--train" in argv:
        st = train_and_report()
        print("[done] 训练完成：%s" % st["modelVersion"])
        print("       训练输入 sha256: %s" % st["trainingCsvSha256"])
        print("       正式模型: 样本=%d 年份=%s 网格=%d"
              % (st["formalModel"]["trainSamples"], st["formalModel"]["trainYears"],
                 st["formalModel"]["trainCellsCount"]))
        print("       时间留出: 训练≤%d 样本=%d 测试>%d 样本=%d"
              % (st["timeHoldout"]["cutYear"], st["timeHoldout"]["trainSamples"],
                 st["timeHoldout"]["cutYear"], st["timeHoldout"]["testSamples"]))
        print("       空间留出: 训练样本=%d 未见网格=%d"
              % (st["cellHoldout"]["trainSamples"], st["cellHoldout"]["nHoldoutCells"]))
        c = st["flagConcentration"]
        print("       flag 率: 总体=%.4f  preEra=%s  era=%s  2012=%s"
              % (c["overallFlagRate"], c["flagRate_preEra"], c["flagRate_era"], c["flagRate_2012"]))
        print("       单年最大 flag 占比=%.4f (year=%s) concentrated=%s"
              % (c["maxSingleYearFlagShare"], c["maxShareYear"], c["concentrated"]))
        rc = st.get("rankingComparison", {})
        if rc:
            for tag, key in (("时间留出", "timeHoldout"), ("空间留出", "cellHoldout"), ("全量", "full")):
                s = rc.get(key, {})
                ov = s.get("overlap", {})
                rho = s.get("spearmanMlVsAbsZ")
                print("       排名比较[%s]: ML=%d 规则=%d 基线=%d | 重合 ML∩规则=%d ML∩基线=%d 三者=%d | Spearman(ML,|z|)=%s"
                      % (tag, s.get("nML", 0), s.get("nRule", 0), s.get("nBaseline", 0),
                         ov.get("mlAndRule", 0), ov.get("mlAndBaseline", 0), ov.get("allThree", 0),
                         ("%.3f" % rho) if rho is not None else "n/a"))
            print("       （无真实标签：仅报告重合/分歧与排序相关，不含基于真实标签的分类度量，不以分数漂移证有效）")
        return 0
    if "--infer" in argv:
        df, _ = load_npp()
        s, f, st, bundle = infer(df)
        print("[done] 推理 %d 条  model=%s" % (len(s), st["modelVersion"]))
        print("       flag 数=%d  分数范围=[%.4f, %.4f]"
              % (int(f.sum()), float(s.min()), float(s.max())))
        return 0
    if "--verify" in argv:
        ok, errs = verify_scores_table()
        print("PASS NPP 分数表与重算一致" if ok else "FAIL")
        for e in errs[:8]:
            print("  -", e)
        return 0 if ok else 1
    if "--selftest" in argv:
        return 0 if run_selftest() else 1
    print("usage: python pipeline/npp_anomaly_model.py [--train|--infer|--verify|--selftest]")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
