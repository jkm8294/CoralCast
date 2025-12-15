"""
Stage 1 pipeline:
- Load IBTrACS North Atlantic CSV
- Compute distance of each track point to Miami
- Keep storms that pass within MAX_DIST_KM
- Save a filtered CSV for downstream merging/ML
"""

import pandas as pd
from math import radians, sin, cos, sqrt, atan2
from pathlib import Path
import warnings

from scripts.polygon_labels import label_points_with_polygon, load_region_polygon

# --- CONFIG ----
MIAMI_LAT = 25.7617
MIAMI_LON = -80.1918
MAX_DIST_KM = 150  # tightened threshold for "near Miami"
MIN_YEAR = 1980

RAW_IBTRACS_PATH = Path("data_raw/ibtracs.NA.list.v04r01.csv")
OUT_MIAMI_HURR_PATH = Path("data_intermediate/miami_hurricanes.csv")


def haversine_km(lat1, lon1, lat2, lon2):
  """Great-circle distance between two points (km)."""
  R = 6371.0
  dlat = radians(lat2 - lat1)
  dlon = radians(lon2 - lon1)
  a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
  c = 2 * atan2(sqrt(a), sqrt(1 - a))
  return R * c


def load_ibtracs(path: Path) -> pd.DataFrame:
  """Load IBTrACS NA CSV and keep only key columns."""
  df = pd.read_csv(path, low_memory=False)

  # Drop header/metadata rows with empty ISO_TIME or coords
  df = df.dropna(subset=["ISO_TIME", "LAT", "LON"])
  df = df[df["ISO_TIME"].str.strip() != ""]

  # Parse datetime
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")
  df = df.dropna(subset=["ISO_TIME"])

  # Filter by year >= MIN_YEAR
  df = df[df["ISO_TIME"].dt.year >= MIN_YEAR]

  # Keep a lean subset of columns (add more if you need)
  keep_cols = [
    "SID",       # storm ID
    "NAME",      # storm name
    "ISO_TIME",  # timestamp
    "LAT",
    "LON",
    "WMO_WIND",  # wind speed (kts)
    "WMO_PRES",  # pressure (hPa)
    "BASIN",
    "SEASON",
    "NUMBER",
  ]
  df = df[keep_cols]
  return df


def add_distance_to_miami(df: pd.DataFrame) -> pd.DataFrame:
  """Add column dist_to_miami_km for each track point."""
  df = df.copy()
  df["dist_to_miami_km"] = df.apply(
    lambda row: haversine_km(
      MIAMI_LAT,
      MIAMI_LON,
      float(row["LAT"]),
      float(row["LON"]),
    ),
    axis=1,
  )
  return df


def filter_storms_near_miami(df: pd.DataFrame) -> pd.DataFrame:
  """
  Keep all track points for storms that come within MAX_DIST_KM of Miami.
  Group by SID and filter by min distance.
  """
  grouped = df.groupby("SID")
  storms_near = grouped.filter(lambda g: g["dist_to_miami_km"].min() < MAX_DIST_KM)
  return storms_near


def build_miami_hurricane_dataset(
  in_path: Path = RAW_IBTRACS_PATH,
  out_path: Path = OUT_MIAMI_HURR_PATH,
):
  """End-to-end Stage 1 pipeline: raw IBTrACS → miami_hurricanes.csv"""
  print(f"Loading IBTrACS from {in_path}...")
  df = load_ibtracs(in_path)

  print("Adding distance to Miami...")
  df = add_distance_to_miami(df)

  print("Filtering storms that pass near Miami...")
  storms_near_miami = filter_storms_near_miami(df)

  # Polygon-based label if polygon is available (Florida state as proxy)
  try:
    poly = load_region_polygon("miami")
    if poly is not None:
      labels, distances_poly = label_points_with_polygon(
        storms_near_miami, "miami", lon_col="LON", lat_col="LAT", buffer_km=150.0
      )
      storms_near_miami["impact_next30"] = labels
      storms_near_miami["distance_km_poly"] = distances_poly
      print("[info] Applied polygon-based label for Miami (buffer 150 km).")
  except Exception as exc:  # pragma: no cover - optional dependency
    warnings.warn(f"Polygon label for Miami skipped: {exc}")

  storms_near_miami.to_csv(out_path, index=False)
  print(f"Saved Miami hurricane subset to {out_path}")
  print(f"Rows: {len(storms_near_miami)}, Storms: {storms_near_miami['SID'].nunique()}")


if __name__ == "__main__":
  build_miami_hurricane_dataset()
