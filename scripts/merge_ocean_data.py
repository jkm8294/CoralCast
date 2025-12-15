"""
Stage 2 pipeline:
- Load Miami hurricane subset
-,Load ocean dataset (DRBO7208 placeholder)
- Match/merge them (placeholder logic for now)
"""

import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional

MIAMI_HURR_PATH = Path("data_intermediate/miami_hurricanes.csv")
RAW_OCEAN_PATH = Path("data_raw/DRBO7208")  # adjust when you know the extension
OUT_MERGED_PATH = Path("data_intermediate/miami_hurr_ocean.csv")


def load_miami_hurricanes(path: Path = MIAMI_HURR_PATH) -> pd.DataFrame:
  return pd.read_csv(path, parse_dates=["ISO_TIME"])


def _normalize_time_col(df: pd.DataFrame) -> pd.DataFrame:
  """Coerce a datetime column named 'time' (best-effort)."""
  df = df.copy()
  for candidate in ["time", "datetime", "timestamp", "date", "DATE_TIME"]:
    if candidate in df.columns:
      df["time"] = pd.to_datetime(df[candidate], errors="coerce", utc=True)
      break
  if "time" in df.columns:
    df = df.dropna(subset=["time"])
  return df


def load_ocean_data(path: Path = RAW_OCEAN_PATH) -> pd.DataFrame:
  """
  Best-effort loader for ocean data.
  Expectations (ideal):
      time | lat | lon | sst | salinity | ...
  If parsing fails, returns an empty DataFrame with those columns so downstream
  code still runs.
  """
  if not path.exists():
    print(f"[warn] Ocean file {path} not found. Returning empty DataFrame.")
    return pd.DataFrame(columns=["time", "lat", "lon"])

  try:
    # Try CSV with flexible delimiter
    df = pd.read_csv(path, sep=None, engine="python")
  except Exception:
    try:
      # Fallback: whitespace-delimited / fixed-width
      df = pd.read_fwf(path)
    except Exception as exc:  # pragma: no cover - defensive
      print(f"[warn] Failed to load ocean data ({exc}). Returning empty DataFrame.")
      return pd.DataFrame(columns=["time", "lat", "lon"])

  # Normalize column names
  df.columns = [str(c).strip().lower() for c in df.columns]
  df = _normalize_time_col(df)

  # Try to identify lat/lon columns heuristically
  lat_col = next((c for c in df.columns if c in {"lat", "latitude"}), None)
  lon_col = next((c for c in df.columns if c in {"lon", "longitude", "lng"}), None)

  if lat_col is None or lon_col is None or "time" not in df.columns:
    print("[warn] Ocean data missing time/lat/lon columns after parsing; returning empty DataFrame.")
    return pd.DataFrame(columns=["time", "lat", "lon"])

  # Keep core columns plus any extras
  df = df.rename(columns={lat_col: "lat", lon_col: "lon"})
  return df


def match_ocean_to_hurricanes(hurr_df: pd.DataFrame, ocean_df: pd.DataFrame) -> pd.DataFrame:
  """
  For each hurricane track point, attach nearest ocean values
  (in time and space) from ocean_df.

  This is where you'll implement your matching logic.
  To keep the structure clear, we return a new DataFrame.
  """
  merged = hurr_df.copy()

  if ocean_df.empty:
    print("[warn] Ocean data is empty; proceeding without enrichment.")
    merged["sst"] = np.nan
    merged["salinity"] = np.nan
    merged["ocean_time"] = pd.NaT
    merged["ocean_lat"] = np.nan
    merged["ocean_lon"] = np.nan
    return merged

  # Prepare rounded lat/lon for coarse spatial matching
  ocean_df = ocean_df.copy()
  ocean_df["lat_round"] = ocean_df["lat"].round(1)
  ocean_df["lon_round"] = ocean_df["lon"].round(1)
  ocean_df = ocean_df.sort_values("time")

  merged["lat_round"] = merged["LAT"].round(1)
  merged["lon_round"] = merged["LON"].round(1)
  merged = merged.sort_values("ISO_TIME")

  # Merge-asof on time within same rounded lat/lon bucket
  matched = pd.merge_asof(
    merged,
    ocean_df,
    left_on="ISO_TIME",
    right_on="time",
    by=["lat_round", "lon_round"],
    direction="nearest",
    tolerance=pd.Timedelta("12H"),
    suffixes=("", "_ocean")
  )

  # Preserve only select ocean columns (if present)
  for col in ["sst", "salinity", "time", "lat", "lon"]:
    if col not in matched.columns:
      matched[col] = np.nan

  matched = matched.rename(columns={
    "time": "ocean_time",
    "lat": "ocean_lat",
    "lon": "ocean_lon",
  })

  # Drop helper rounding columns
  matched = matched.drop(columns=["lat_round", "lon_round"])
  return matched


def build_hurricane_ocean_dataset(
  miami_hurr_path: Path = MIAMI_HURR_PATH,
  ocean_path: Path = RAW_OCEAN_PATH,
  out_path: Path = OUT_MERGED_PATH,
):
  hurr_df = load_miami_hurricanes(miami_hurr_path)
  ocean_df = load_ocean_data(ocean_path)

  merged = match_ocean_to_hurricanes(hurr_df, ocean_df)
  merged.to_csv(out_path, index=False)
  print(f"Saved merged hurricane + ocean dataset to {out_path}")


if __name__ == "__main__":
  build_hurricane_ocean_dataset()
