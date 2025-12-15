"""
Stage 3 pipeline:
- Load merged hurricane + ocean dataset
- Engineer features for ML
- Save to data_ml/miami_ml_features.csv
"""

import argparse
import pandas as pd
from pathlib import Path

DEFAULT_MIAMI_PATH_ENV = Path("data_intermediate/miami_hurr_env.csv")
DEFAULT_MIAMI_PATH_OCEAN = Path("data_intermediate/miami_hurr_ocean.csv")
DEFAULT_PR_PATH_ENV = Path("data_intermediate/puerto_rico_hurr_env.csv")
DEFAULT_PR_PATH_OCEAN = Path("data_intermediate/puerto_rico_hurricanes.csv")
DEFAULT_OUT_MIAMI = Path("data_ml/miami_ml_features.csv")
DEFAULT_OUT_PR = Path("data_ml/puerto_rico_ml_features.csv")


REGION_CONFIG = {
  "miami": {"dist_col": "dist_to_miami_km", "radius_km": 200},
  "puerto_rico": {"dist_col": "dist_to_pr_km", "radius_km": 75},
}


def add_storm_recency_features(df: pd.DataFrame, region: str) -> pd.DataFrame:
  """Add recency features: min distance and counts within radius over multiple windows."""
  cfg = REGION_CONFIG.get(region, {"dist_col": "distance_km", "radius_km": 200})
  dist_col = cfg["dist_col"]
  radius = cfg["radius_km"]
  if dist_col not in df.columns:
    return df
  df = df.copy()
  df = df.sort_values("ISO_TIME")
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"])
  df.set_index("ISO_TIME", inplace=True)
  # Rolling window over time axis
  windows = ["7D", "30D", "365D"]
  for w in windows:
    df[f"min_dist_{w.lower()}"] = df[dist_col].rolling(w, min_periods=1).min()
    df[f"count_within_radius_{w.lower()}"] = (df[dist_col] <= radius).rolling(w, min_periods=1).sum()
  df.reset_index(inplace=True)
  return df


def engineer_features(df: pd.DataFrame, region: str) -> pd.DataFrame:
  """
  Turn raw hurricane+env rows into ML features.
  """
  df = df.copy()
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"])

  df = add_storm_recency_features(df, region)

  # Time features
  df["year"] = df["ISO_TIME"].dt.year
  df["month"] = df["ISO_TIME"].dt.month
  df["day"] = df["ISO_TIME"].dt.day
  df["dayofyear"] = df["ISO_TIME"].dt.dayofyear
  df["is_hurricane_season"] = df["month"].between(6, 11).astype(int)

  dist_col = "dist_to_miami_km" if region == "miami" and "dist_to_miami_km" in df.columns else "dist_to_pr_km"

  feature_cols = [
    "LAT",
    "LON",
    dist_col,
    "WMO_WIND",
    "WMO_PRES",
    # Optional env features if present
    "sst_current",
    "sst_anom",
    "sst_climo",
    "merra_slp",
    "merra_t2m",
    "merra_rh2m",
    "merra_u10",
    "merra_v10",
    "nino34",
    "amo",
    "year",
    "month",
    "day",
    "dayofyear",
    "is_hurricane_season",
    "min_dist_7d",
    "count_within_radius_7d",
    "min_dist_30d",
    "count_within_radius_30d",
    "min_dist_365d",
    "count_within_radius_365d",
  ]
  feature_cols = [c for c in feature_cols if c in df.columns]

  target_col = "impact_next30" if "impact_next30" in df.columns else None

  out = df[feature_cols].copy()
  out["date"] = df["ISO_TIME"]
  if target_col:
    out[target_col] = df[target_col]
  out["region"] = region
  return out


def build_ml_features(input_path: Path, out_path: Path, region: str):
  df = pd.read_csv(input_path)
  features = engineer_features(df, region=region)
  out_path.parent.mkdir(parents=True, exist_ok=True)
  features.to_csv(out_path, index=False)
  print(f"Saved ML features to {out_path} with shape {features.shape}")


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--region", choices=["miami", "puerto_rico"], help="Region to build features for")
  parser.add_argument("--input", type=str, help="Input CSV path")
  parser.add_argument("--out", type=str, help="Output CSV path")
  args = parser.parse_args()

  if args.region is None:
    # Build both by default if no args
    miami_in = DEFAULT_MIAMI_PATH_ENV if DEFAULT_MIAMI_PATH_ENV.exists() else DEFAULT_MIAMI_PATH_OCEAN
    pr_in = DEFAULT_PR_PATH_ENV if DEFAULT_PR_PATH_ENV.exists() else DEFAULT_PR_PATH_OCEAN
    build_ml_features(miami_in, DEFAULT_OUT_MIAMI, "miami")
    build_ml_features(pr_in, DEFAULT_OUT_PR, "puerto_rico")
    return

  if args.region == "miami":
    if args.input:
      inp = Path(args.input)
    else:
      inp = DEFAULT_MIAMI_PATH_ENV if DEFAULT_MIAMI_PATH_ENV.exists() else DEFAULT_MIAMI_PATH_OCEAN
    out = Path(args.out) if args.out else DEFAULT_OUT_MIAMI
    build_ml_features(inp, out, "miami")
  else:
    if args.input:
      inp = Path(args.input)
    else:
      inp = DEFAULT_PR_PATH_ENV if DEFAULT_PR_PATH_ENV.exists() else DEFAULT_PR_PATH_OCEAN
    out = Path(args.out) if args.out else DEFAULT_OUT_PR
    build_ml_features(inp, out, "puerto_rico")


if __name__ == "__main__":
  main()
