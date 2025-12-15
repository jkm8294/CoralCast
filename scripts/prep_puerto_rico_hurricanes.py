"""
Build a Puerto Rico hurricane track subset from IBTrACS NA.
- Filters storms within PUERTO_RICO_RADIUS_KM of the island center
- Keeps key wind/pressure/time/location fields
"""

from pathlib import Path
import pandas as pd
from math import radians, sin, cos, sqrt, atan2
import warnings

from scripts.polygon_labels import label_points_with_polygon, load_region_polygon

# Region definition for Puerto Rico
PUERTO_RICO_CENTER_LAT = 18.2208
PUERTO_RICO_CENTER_LON = -66.5901
PUERTO_RICO_RADIUS_KM = 50  # tightened radius for PR proximity/impact labeling
MIN_YEAR = 1980

IBTRACS_NA_PATH = Path("data_raw/ibtracs.NA.list.v04r01.csv")
PUERTO_RICO_OUT_PATH = Path("data_intermediate/puerto_rico_hurricanes.csv")


def haversine_km(lat1, lon1, lat2, lon2):
  """Great-circle distance between two points (km)."""
  R = 6371.0
  dlat = radians(lat2 - lat1)
  dlon = radians(lon2 - lon1)
  a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
  c = 2 * atan2(sqrt(a), sqrt(1 - a))
  return R * c


def load_ibtracs_na(path=IBTRACS_NA_PATH):
  df = pd.read_csv(path, low_memory=False)
  df = df.dropna(subset=["ISO_TIME", "LAT", "LON"])
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")
  df = df.dropna(subset=["ISO_TIME"])
  df = df[df["ISO_TIME"].dt.year >= MIN_YEAR]
  keep_cols = [
    "SID", "NAME", "ISO_TIME", "LAT", "LON",
    "WMO_WIND", "WMO_PRES", "BASIN", "SEASON", "NUMBER"
  ]
  return df[keep_cols]


def add_distance_to_pr(df: pd.DataFrame):
  df = df.copy()
  df["dist_to_pr_km"] = df.apply(
    lambda row: haversine_km(
      PUERTO_RICO_CENTER_LAT,
      PUERTO_RICO_CENTER_LON,
      float(row["LAT"]),
      float(row["LON"])
    ),
    axis=1
  )
  return df


def filter_storms_near_pr(df: pd.DataFrame):
  grouped = df.groupby("SID")
  return grouped.filter(lambda g: g["dist_to_pr_km"].min() < PUERTO_RICO_RADIUS_KM)


def build_puerto_rico_hurricane_dataset(
  in_path=IBTRACS_NA_PATH,
  out_path=PUERTO_RICO_OUT_PATH
):
  df = load_ibtracs_na(in_path)
  df = add_distance_to_pr(df)
  pr_df = filter_storms_near_pr(df)
  # Add a target column for PR using the tighter radius (fallback)
  pr_df["impact_next30"] = (pr_df["dist_to_pr_km"] <= PUERTO_RICO_RADIUS_KM).astype(int)

  # Polygon-based label if polygon is available
  try:
    poly = load_region_polygon("puerto_rico")
    if poly is not None:
      labels, distances_poly = label_points_with_polygon(
        pr_df, "puerto_rico", lon_col="LON", lat_col="LAT", buffer_km=PUERTO_RICO_RADIUS_KM
      )
      pr_df["impact_next30"] = labels
      pr_df["distance_km_poly"] = distances_poly
      print(f"[info] Applied polygon-based label for Puerto Rico (buffer {PUERTO_RICO_RADIUS_KM} km).")
  except Exception as exc:  # pragma: no cover - optional dependency
    warnings.warn(f"Polygon label for Puerto Rico skipped: {exc}")

  pr_df.to_csv(out_path, index=False)
  print(f"Saved Puerto Rico hurricane dataset to {out_path}")
  print(f"Number of rows: {len(pr_df)}")
  print(f"Number of storms: {pr_df['SID'].nunique()}")


if __name__ == "__main__":
  build_puerto_rico_hurricane_dataset()
