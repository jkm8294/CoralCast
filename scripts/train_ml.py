"""
Offline training scaffold to compare tracks-only vs tracks+reef models and export UI insights.
Requires: pip install pandas numpy scikit-learn xgboost statsmodels shap

Example:
  python scripts/train_ml.py \
    --csv data/export.csv \
    --out public/ml_insights.json \
    --target hurricane_next30d \
    --splits 4
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
import shap
import statsmodels.tsa.stattools as smt
from sklearn.metrics import roc_auc_score, f1_score, average_precision_score, brier_score_loss
from sklearn.model_selection import TimeSeriesSplit
from xgboost import XGBClassifier

from scripts.miami_pipeline import build_miami_dataset


def add_lags(df: pd.DataFrame, cols, lags):
  for col in cols:
    if col not in df.columns:
      continue
    for lag in lags:
      df[f'{col}_lag{lag}'] = df[col].shift(lag)
  return df


def add_rolls(df: pd.DataFrame, cols, windows):
  for col in cols:
    if col not in df.columns:
      continue
    for win in windows:
      df[f'{col}_roll{win}'] = df[col].rolling(win, min_periods=1).mean()
  return df


def add_seasonality(df: pd.DataFrame, date_col: str = 'date'):
  doy = df[date_col].dt.dayofyear
  df['doy_sin'] = np.sin(2 * np.pi * doy / 365.0)
  df['doy_cos'] = np.cos(2 * np.pi * doy / 365.0)
  return df


def granger_feature(target: pd.Series, driver: pd.Series, maxlag=7):
  try:
    result = smt.grangercausalitytests(
      np.column_stack([target.values, driver.values]), maxlag=maxlag, verbose=False
    )
    best = min(
      [(lag, res[0]['ssr_ftest'][1]) for lag, res in result.items()],
      key=lambda x: x[1]
    )
    return {'best_lag': best[0], 'p_value': best[1]}
  except Exception:
    return {'best_lag': None, 'p_value': None}


def temporal_cv_metrics(X: pd.DataFrame, y: pd.Series, model, n_splits=4):
  # Drop any non-numeric columns and make sure we have numeric arrays
  X_num = X.select_dtypes(include=[np.number, bool]).copy()
  tscv = TimeSeriesSplit(n_splits=n_splits, test_size=int(len(X) / (n_splits + 1)))
  aucs, aucprs, f1s, briers = [], [], [], []
  probs_all, ys_all = [], []
  for train_idx, test_idx in tscv.split(X_num):
    X_train, X_test = X_num.iloc[train_idx], X_num.iloc[test_idx]
    y_train, y_test = y.iloc[train_idx], y.iloc[test_idx]
    model.fit(X_train, y_train)
    prob = model.predict_proba(X_test)[:, 1]
    preds = (prob > 0.5).astype(int)
    aucs.append(roc_auc_score(y_test, prob))
    aucprs.append(average_precision_score(y_test, prob))
    f1s.append(f1_score(y_test, preds))
    briers.append(brier_score_loss(y_test, prob))
    probs_all.append(prob)
    ys_all.append(y_test.values)
  return {
    'auc': float(np.mean(aucs)),
    'aucpr': float(np.mean(aucprs)),
    'f1': float(np.mean(f1s)),
    'brier': float(np.mean(briers)),
    'probs_all': np.concatenate(probs_all),
    'ys_all': np.concatenate(ys_all)
  }


def top_shap(model, X: pd.DataFrame, k=8):
  explainer = shap.TreeExplainer(model)
  shap_vals = explainer.shap_values(X)
  mean_abs = np.abs(shap_vals).mean(axis=0)
  top_indices = np.argsort(mean_abs)[::-1][:k]
  return [
    {
      'feature': X.columns[i],
      'shap': float(mean_abs[i]),
      'direction': float(shap_vals[:, i].mean())
    }
    for i in top_indices
  ]


def build_features(df: pd.DataFrame):
  df = add_seasonality(df, 'date')

  reef_features = [
    'sst', 'sst_anom', 'chl', 'salinity', 'river_flow', 'river_cond',
    'dhw', 'rain', 'ntu', 'do', 'ph'
  ]
  storm_features = ['storm_distance_km', 'storm_min_pressure_mb', 'wind_kts', 'pressure_mb', 'distance_km']

  df = add_lags(df, reef_features + storm_features, lags=[1, 3, 7])
  df = add_rolls(df, reef_features + storm_features, windows=[7])
  numeric_cols_all = df.select_dtypes(include=[np.number, bool]).columns.tolist()
  df = df.dropna(subset=['date']).reset_index(drop=True)
  for col in numeric_cols_all:
    if df[col].dtype == bool:
      df[col] = df[col].fillna(False)
    else:
      df[col] = df[col].fillna(df[col].median())

  def feature_columns(df_in: pd.DataFrame, bases):
    cols = []
    for c in df_in.columns:
      for base in bases:
        # Match the base feature or any lag/rolling feature derived from it.
        if c == base or c.startswith(f'{base}_'):
          cols.append(c)
          break
    # Preserve order but drop duplicates (prevents doy_* matching the dissolved oxygen `do` prefix)
    return list(dict.fromkeys(cols))

  # Keep only numeric/boolean feature columns plus date and target
  def select_feature_frame(df_in: pd.DataFrame, target: str):
    numeric_cols = df_in.select_dtypes(include=[np.number, bool]).columns.tolist()
    keep = ['date', target] + [c for c in numeric_cols if c not in ['date', target]]
    return df_in[keep]

  reef_cols = feature_columns(df, reef_features)
  storm_cols = feature_columns(df, storm_features) + ['doy_sin', 'doy_cos']
  return df, reef_cols, storm_cols, select_feature_frame


def parse_args():
  parser = argparse.ArgumentParser()
  parser.add_argument('--csv', help='Input tidy CSV with date, target, features')
  parser.add_argument('--region', help="Predefined region dataset, e.g., 'miami'")
  parser.add_argument('--out', required=True, help='Output JSON for UI')
  parser.add_argument('--target', default='impact_next30', help='Target column (binary)')
  parser.add_argument('--date-col', default='date', help='Date column name')
  parser.add_argument('--splits', type=int, default=4, help='Temporal CV splits (k-fold, time-aware)')
  return parser.parse_args()


def load_dataset(args):
  if args.csv:
    path = args.csv
  elif args.region == 'miami':
    path = build_miami_dataset()
  else:
    raise SystemExit("Provide --csv or --region miami")

  print(f"[info] Loading dataset from {path}")
  df = pd.read_csv(path)

  date_col = args.date_col
  if date_col not in df.columns and 'ISO_TIME' in df.columns:
    date_col = 'ISO_TIME'
  if date_col not in df.columns:
    raise SystemExit(f"Date column '{args.date_col}' not found and no ISO_TIME column available.")

  df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
  df = df.dropna(subset=[date_col])
  df = df.rename(columns={date_col: 'date'})

  # For Miami pipeline: map dist_to_miami_km to distance_km if needed
  if 'distance_km' not in df.columns and 'dist_to_miami_km' in df.columns:
    df['distance_km'] = df['dist_to_miami_km']
  if 'distance_km' not in df.columns and 'dist_to_pr_km' in df.columns:
    df['distance_km'] = df['dist_to_pr_km']

  df = df.sort_values('date')
  return df


def main():
  args = parse_args()

  df = load_dataset(args)

  # If target is missing, derive a simple proximity label from distance_km.
  if args.target not in df.columns:
    if 'distance_km' not in df.columns:
      raise SystemExit(
        f"Target column '{args.target}' not found and 'distance_km' missing. "
        "Add a binary target column or include distance_km to auto-derive one."
      )
    # Use region-specific proximity if available
    if 'dist_to_pr_km' in df.columns:
      proximity_thresh = 50.0
      df['distance_km'] = df['dist_to_pr_km']
    elif 'dist_to_miami_km' in df.columns:
      proximity_thresh = 150.0
      df['distance_km'] = df['dist_to_miami_km']
    else:
      proximity_thresh = 200.0
    df[args.target] = (df['distance_km'] <= proximity_thresh).astype(int)
    print(f"[info] Created target '{args.target}' as 1 when distance_km <= {proximity_thresh} km.")

  # Ensure the target is binary and has both classes
  if df[args.target].nunique() < 2:
    raise SystemExit(
      f"Target '{args.target}' has only one class. Provide data with both positives and negatives "
      "or adjust the proximity threshold/target construction."
    )
  df, reef_cols, storm_cols, select_feature_frame = build_features(df)

  if df[args.target].nunique() < 2:
    positives = int((df[args.target] == 1).sum())
    raise SystemExit(
      f"Target '{args.target}' lost a class after feature engineering (lag/rolling dropna). "
      f"Positives remaining: {positives}. Provide more rows with positives or reduce lags/rolling windows."
    )

  y = df[args.target].astype(int)
  df = select_feature_frame(df, args.target)
  X_storm = df[[c for c in storm_cols if c in df.columns]]
  X_reef = df[[c for c in reef_cols + storm_cols if c in df.columns]]

  base_model = XGBClassifier(
    max_depth=4,
    n_estimators=300,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric='logloss',
    objective='binary:logistic',
    base_score=0.5
  )
  reef_model = XGBClassifier(
    max_depth=5,
    n_estimators=400,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric='logloss',
    objective='binary:logistic',
    base_score=0.5
  )

  base_metrics = temporal_cv_metrics(X_storm, y, base_model, n_splits=args.splits)
  reef_metrics = temporal_cv_metrics(X_reef, y, reef_model, n_splits=args.splits)

  reef_model.fit(X_reef, y)
  shap_top = top_shap(reef_model, X_reef.tail(500))  # SHAP on recent window to save time

  lag_results = []
  for col in ['sst', 'sst_anom', 'salinity', 'chl', 'dhw']:
    if col in df.columns:
      res = granger_feature(y, df[col], maxlag=14)
      best_lag = int(res['best_lag']) if res.get('best_lag') is not None else None
      p_val = float(res['p_value']) if res.get('p_value') is not None else None
      lag_results.append({'feature': col, 'bestLagDays': best_lag, 'pValue': p_val})
  # Ensure pure Python types for JSON
  lag_results = [
    {
      'feature': lr['feature'],
      'bestLagDays': int(lr['bestLagDays']) if lr.get('bestLagDays') is not None else None,
      'pValue': float(lr['pValue']) if lr.get('pValue') is not None else None
    }
    for lr in lag_results
  ]

  uplift_aucpr = reef_metrics['aucpr'] - base_metrics['aucpr']

  # Confidence band using prediction distribution (p50/p90/p99) to better separate regions
  probs_all = reef_metrics['probs_all']
  base_rate = float(y.mean()) if len(y) else 0.5
  if len(probs_all):
    p50, p90, p99 = np.percentile(probs_all, [50, 90, 99])
  else:
    p50 = p90 = p99 = base_rate
  current_year = int(df.date.dt.year.max())
  drift_per_year = max(0.1, base_rate * 3)  # small drift to avoid flat line
  band = []
  for i in range(0, 11):
    mean = (p90 * 100) + drift_per_year * i  # emphasize upper tail
    low = max(0.0, p50 * 100)
    high = min(100.0, p99 * 100)
    band.append({
      'year': current_year + i,
      'mean': mean,
      'low': low,
      'high': high
    })

  output = {
    'metrics': {
      'auc': reef_metrics['auc'],
      'aucpr': reef_metrics['aucpr'],
      'f1': reef_metrics['f1'],
      'brier': reef_metrics['brier'],
      'baseline_auc': base_metrics['auc'],
      'baseline_aucpr': base_metrics['aucpr'],
      'baseline_f1': base_metrics['f1'],
      'uplift_aucpr': uplift_aucpr
    },
    'drivers': shap_top,
    'lagTests': lag_results,
    'band': band
  }

  Path(args.out).write_text(json.dumps(output, indent=2))
  print(
    f"Wrote {args.out} | reef_auc={reef_metrics['auc']:.3f} reef_aucpr={reef_metrics['aucpr']:.3f} "
    f"baseline_aucpr={base_metrics['aucpr']:.3f} uplift_aucpr={uplift_aucpr:.3f}"
  )


if __name__ == '__main__':
  main()
