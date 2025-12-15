"""
Augment hurricane subsets (Miami/Puerto Rico) with environmental features.
Output CSVs:
  - data_intermediate/miami_hurr_env.csv
  - data_intermediate/puerto_rico_hurr_env.csv
"""

import pandas as pd
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
  sys.path.append(str(ROOT))

from scripts.env_features import add_env_features

MIAMI_HURR_PATH = Path("data_intermediate/miami_hurricanes.csv")
PR_HURR_PATH = Path("data_intermediate/puerto_rico_hurricanes.csv")

OUT_MIAMI_ENV = Path("data_intermediate/miami_hurr_env.csv")
OUT_PR_ENV = Path("data_intermediate/puerto_rico_hurr_env.csv")


def build_env_dataset_for_region(hurr_path: Path, out_path: Path):
  df = pd.read_csv(hurr_path, parse_dates=["ISO_TIME"])
  df_env = add_env_features(df)
  df_env.to_csv(out_path, index=False)
  print(f"Saved env-augmented dataset to {out_path} with shape {df_env.shape}")


if __name__ == "__main__":
  build_env_dataset_for_region(MIAMI_HURR_PATH, OUT_MIAMI_ENV)
  build_env_dataset_for_region(PR_HURR_PATH, OUT_PR_ENV)
