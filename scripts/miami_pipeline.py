"""
Convenience pipeline runner for the Miami dataset.
Call build_miami_dataset() to run all stages and return the final CSV path.
"""

from pathlib import Path
import sys

# Ensure project root is on path when run directly
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
  sys.path.append(str(ROOT))

from scripts.prep_miami_hurricanes import build_miami_hurricane_dataset
from scripts.merge_ocean_data import build_hurricane_ocean_dataset
from scripts.build_ml_features import build_ml_features

DATA_ROOT = Path(".")


def build_miami_dataset():
  """End-to-end: raw -> ML-ready Miami dataset."""
  build_miami_hurricane_dataset()
  build_hurricane_ocean_dataset()
  build_ml_features(input_path=Path("data_intermediate/miami_hurr_ocean.csv"), out_path=Path("data_ml/miami_ml_features.csv"), region="miami")
  return DATA_ROOT / "data_ml" / "miami_ml_features.csv"


if __name__ == "__main__":
  out = build_miami_dataset()
  print(f"Built Miami dataset at {out}")
