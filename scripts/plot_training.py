"""
Quick plotting helper: read tmp/<name>_preds.json written by train_ml.py and
save ROC/PR curves to reports/.

Usage:
  PYTHONPATH=. MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/plot_training.py \\
    --preds tmp/ml_insights_miami_preds.json \\
    --out-dir reports
"""

import argparse
from pathlib import Path
import json

import matplotlib.pyplot as plt
from sklearn.metrics import roc_curve, precision_recall_curve, auc


def parse_args():
  p = argparse.ArgumentParser()
  p.add_argument("--preds", required=True, help="Path to *_preds.json emitted by train_ml.py")
  p.add_argument("--out-dir", default="reports", help="Directory to save PNGs")
  return p.parse_args()


def main():
  args = parse_args()
  preds_path = Path(args.preds)
  out_dir = Path(args.out_dir)
  out_dir.mkdir(parents=True, exist_ok=True)

  data = json.loads(preds_path.read_text())
  y_true = data["y_true"]
  y_pred = data["y_pred"]

  fpr, tpr, _ = roc_curve(y_true, y_pred)
  roc_auc = auc(fpr, tpr)

  prec, rec, _ = precision_recall_curve(y_true, y_pred)
  pr_auc = auc(rec, prec)

  plt.figure(figsize=(5, 4))
  plt.plot(fpr, tpr, label=f"ROC AUC = {roc_auc:.3f}")
  plt.plot([0, 1], [0, 1], "k--", alpha=0.5)
  plt.xlabel("False Positive Rate")
  plt.ylabel("True Positive Rate")
  plt.title("ROC Curve")
  plt.legend()
  plt.tight_layout()
  plt.savefig(out_dir / f"{preds_path.stem}_roc.png", dpi=200)

  plt.figure(figsize=(5, 4))
  plt.plot(rec, prec, label=f"PR AUC = {pr_auc:.3f}")
  plt.xlabel("Recall")
  plt.ylabel("Precision")
  plt.title("Precision-Recall Curve")
  plt.legend()
  plt.tight_layout()
  plt.savefig(out_dir / f"{preds_path.stem}_pr.png", dpi=200)

  print(f"[info] Saved ROC/PR plots to {out_dir}")


if __name__ == "__main__":
  main()
