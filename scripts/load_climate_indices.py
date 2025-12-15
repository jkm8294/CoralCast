import pandas as pd
from pathlib import Path

DATA_RAW = Path("data_raw")


def _load_psl_table(path: Path, col_name: str):
  """
  Load NOAA PSL-style tables (e.g., nina34.data or amon.us.data) saved as .csv.
  They usually have two header lines and then year + 12 monthly values, possibly trailing flags.
  """
  lines = path.read_text().strip().splitlines()
  data = []
  for line in lines:
    parts = line.strip().split()
    if len(parts) < 13:
      continue
    year = int(parts[0])
    months = parts[1:13]
    # Convert to float, replace missing codes with NaN
    vals = []
    for v in months:
      try:
        vals.append(float(v))
      except Exception:
        vals.append(float("nan"))
    data.append([year] + vals)
  df = pd.DataFrame(data, columns=["year"] + [f"m{i}" for i in range(1, 13)])
  df = df.melt(id_vars="year", var_name="month", value_name=col_name)
  df["month"] = df["month"].str.replace("m", "").astype(int)
  return df


def load_nino34(path: Path = DATA_RAW / "nino34.csv"):
  return _load_psl_table(path, "nino34")


def load_amo(path: Path = DATA_RAW / "amo.csv"):
  return _load_psl_table(path, "amo")
