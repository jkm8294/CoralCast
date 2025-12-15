"""
Environmental feature loaders & joiners for hurricane ML.

Uses:
- Monthly SST climatology NetCDF (e.g., sst.oisst.mon.ltm.1991-2020.nc or sst.mon.ltm.1991-2020.nc)
- MERRA-2 monthly 2D atmospheric subset text file (e.g., subset_M2C0NXASM_*.txt)

Adds columns such as: sst_climo, merra_slp, merra_t2m, merra_rh2m, merra_u10, merra_v10.

This module is written defensively: if any source is missing, it will warn and
return the original DataFrame unchanged so downstream code does not crash.
"""

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

DATA_RAW = Path("data_raw")

SST_CLIMO_PATH = DATA_RAW / "sst.oisst.mon.ltm.1991-2020.nc"
OISST_MONTHLY_PATH = DATA_RAW / "sst.mon.mean.nc"
MERRA_SUBSET_PATH = DATA_RAW / "subset_M2C0NXASM_5.12.4_20251211_035328_.txt"
ENSO_AMO_PATH = DATA_RAW / "enso_amo_indices.csv"


def load_sst_climatology(path: Path = SST_CLIMO_PATH):
  """Load monthly SST climatology (xarray Dataset). Returns None if unavailable."""
  try:
    import xarray as xr  # Local import to keep dependency optional
  except ImportError:
    print("[warn] xarray not installed; skipping SST climatology.")
    return None
  if not path.exists():
    print(f"[warn] SST climatology file not found: {path}")
    return None
  ds = xr.open_dataset(path)
  for cand in ["sst", "SST", "tos"]:
    if cand in ds.data_vars:
      ds = ds.rename({cand: "sst"})
      return ds
  print(f"[warn] No SST variable found in {path}; available vars: {list(ds.data_vars)}")
  return None


def load_oisst_monthly(path: Path = OISST_MONTHLY_PATH):
  """Load monthly OISST SST (e.g., sst.mon.mean.nc)."""
  try:
    import xarray as xr  # type: ignore
  except ImportError:
    print("[warn] xarray not installed; skipping OISST monthly.")
    return None
  if not path.exists():
    print(f"[warn] OISST monthly file not found: {path}")
    return None
  try:
    ds = xr.open_dataset(path)
    if "sst" not in ds.data_vars:
      print(f"[warn] OISST monthly missing 'sst' var: {path}")
      return None
    return ds
  except Exception as exc:
    print(f"[warn] Failed to load OISST monthly: {exc}")
    return None


def add_sst_anomaly_to_hurricanes(hurr_df: pd.DataFrame, sst_ds=None, climo_ds=None) -> pd.DataFrame:
  """Attach current SST and anomaly from OISST monthly minus climatology."""
  if sst_ds is None:
    sst_ds = load_oisst_monthly()
  if climo_ds is None:
    climo_ds = load_sst_climatology()
  if sst_ds is None or climo_ds is None:
    return hurr_df

  df = hurr_df.copy()
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")

  # Pre-interp climatology onto the OISST grid (lon 0..360, 0.25 deg)
  try:
    climo_interp = climo_ds["sst"].interp(lat=sst_ds["lat"], lon=sst_ds["lon"])
  except Exception:
    climo_interp = climo_ds["sst"]

  sst_vals = []
  anom_vals = []
  for _, row in df.iterrows():
    t = pd.to_datetime(row["ISO_TIME"])
    if pd.isna(t):
      sst_vals.append(np.nan)
      anom_vals.append(np.nan)
      continue
    lat = float(row["LAT"])
    # Convert to 0..360
    lon = (float(row["LON"]) + 360.0) % 360.0
    try:
      sst_point = sst_ds["sst"].sel(time=t, method="nearest").interp(lat=lat, lon=lon, method="nearest")
      climo_point = climo_interp.isel(time=t.month - 1).interp(lat=lat, lon=lon, method="nearest")
      sst_val = float(sst_point.values)
      climo_val = float(climo_point.values)
      sst_vals.append(sst_val)
      anom_vals.append(sst_val - climo_val)
    except Exception:
      sst_vals.append(np.nan)
      anom_vals.append(np.nan)

  df["sst_current"] = sst_vals
  df["sst_anom"] = anom_vals
  return df


def load_enso_amo(path: Path = ENSO_AMO_PATH) -> Optional[pd.DataFrame]:
  """Load ENSO/AMO index CSV with columns: time, nino34, amo."""
  if not path.exists():
    print(f"[warn] ENSO/AMO file not found: {path}")
    return None
  try:
    df = pd.read_csv(path, parse_dates=["time"])
    return df
  except Exception as exc:
    print(f"[warn] Failed to load ENSO/AMO indices: {exc}")
    return None


def add_enso_amo(hurr_df: pd.DataFrame, idx_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
  if idx_df is None:
    idx_df = load_enso_amo()
  if idx_df is None or idx_df.empty:
    # Try separate nino/amo files if present
    try:
      from scripts.load_climate_indices import load_nino34, load_amo
      nino = load_nino34()
      amo = load_amo()
      idx_df = nino.merge(amo, on=["year", "month"], how="outer")
    except Exception:
      return hurr_df
  df = hurr_df.copy()
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")
  df["month_ts"] = df["ISO_TIME"].dt.to_period("M").dt.to_timestamp()
  idx_df = idx_df.copy()
  idx_df["month_ts"] = pd.to_datetime(idx_df["time"]).dt.to_period("M").dt.to_timestamp() if "time" in idx_df.columns else pd.to_datetime(idx_df.assign(time=pd.to_datetime(dict(year=idx_df["year"], month=idx_df["month"], day=1)))["time"])
  merged = df.merge(idx_df.drop(columns=[c for c in ["time"] if c in idx_df.columns]), on="month_ts", how="left")
  merged = merged.drop(columns=["month_ts"])
  return merged


def add_sst_climo_to_hurricanes(hurr_df: pd.DataFrame, sst_ds=None) -> pd.DataFrame:
  """Attach monthly SST climatology at nearest (lat, lon)."""
  if sst_ds is None:
    sst_ds = load_sst_climatology()
  if sst_ds is None:
    return hurr_df

  df = hurr_df.copy()
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")
  df["month"] = df["ISO_TIME"].dt.month

  # Align longitude ranges
  if (sst_ds["lon"] >= 0).all():
    df["lon_interp"] = (df["LON"] + 360) % 360
  else:
    df["lon_interp"] = df["LON"]

  sst_vals = []
  for _, row in df.iterrows():
    m = int(row["month"])
    lat = float(row["LAT"])
    lon = float(row["lon_interp"])
    sst_month = sst_ds["sst"].isel(time=m - 1)
    sst_point = sst_month.interp(lat=lat, lon=lon, method="nearest")
    sst_vals.append(float(sst_point.values))

  df["sst_climo"] = sst_vals
  return df.drop(columns=["lon_interp", "month"])


def load_merra_subset(path: Path = MERRA_SUBSET_PATH) -> Optional[pd.DataFrame]:
  """
  Load MERRA-2 monthly atmos subset from the text file.
  Update column mappings below once you inspect the file.
  """
  if not path.exists():
    print(f"[warn] MERRA subset file not found: {path}")
    return None
  try:
    df = pd.read_csv(path, delim_whitespace=True, comment="#", header=None)
  except Exception as exc:
    print(f"[warn] Failed to read MERRA subset: {exc}")
    return None

  # TODO: adjust these columns to match the actual file once inspected.
  col_map = {
    0: "time",
    1: "lat",
    2: "lon",
    3: "slp",
    4: "t2m",
    5: "rh2m",
    6: "u10m",
    7: "v10m",
  }
  df = df.rename(columns=col_map)
  if "time" in df.columns:
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
  return df


def add_merra_to_hurricanes(hurr_df: pd.DataFrame, merra_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
  """Attach nearest-in-month MERRA-2 atmos features to each hurricane row."""
  if merra_df is None:
    merra_df = load_merra_subset()
  if merra_df is None or merra_df.empty:
    return hurr_df

  df = hurr_df.copy()
  df["ISO_TIME"] = pd.to_datetime(df["ISO_TIME"], errors="coerce")
  df["merra_month"] = df["ISO_TIME"].dt.to_period("M").dt.to_timestamp()

  merra_df = merra_df.copy()
  if "time" not in merra_df.columns:
    print("[warn] MERRA subset missing 'time' column; skipping merge.")
    return df
  merra_df["month"] = merra_df["time"].dt.to_period("M").dt.to_timestamp()

  merra_grouped = merra_df.groupby("month")
  out_cols = {
    "merra_slp": [],
    "merra_t2m": [],
    "merra_rh2m": [],
    "merra_u10": [],
    "merra_v10": []
  }

  for _, row in df.iterrows():
    m = row["merra_month"]
    lat = float(row["LAT"])
    lon = float(row["LON"])
    if m not in merra_grouped.groups:
      for k in out_cols:
        out_cols[k].append(np.nan)
      continue
    g = merra_grouped.get_group(m)
    dlat = g["lat"] - lat
    dlon = g["lon"] - lon
    dist2 = dlat ** 2 + dlon ** 2
    idx_min = dist2.idxmin()
    row_merra = g.loc[idx_min]
    out_cols["merra_slp"].append(row_merra.get("slp", np.nan))
    out_cols["merra_t2m"].append(row_merra.get("t2m", np.nan))
    out_cols["merra_rh2m"].append(row_merra.get("rh2m", np.nan))
    out_cols["merra_u10"].append(row_merra.get("u10m", np.nan))
    out_cols["merra_v10"].append(row_merra.get("v10m", np.nan))

  for k, vals in out_cols.items():
    df[k] = vals

  return df.drop(columns=["merra_month"])


def add_env_features(hurr_df: pd.DataFrame) -> pd.DataFrame:
  """High-level helper: add SST anomalies/climatology + MERRA-2 atmos + ENSO/AMO to hurricane DataFrame."""
  df = add_sst_anomaly_to_hurricanes(hurr_df)
  df = add_sst_climo_to_hurricanes(df)
  df = add_merra_to_hurricanes(df)
  df = add_enso_amo(df)
  return df
