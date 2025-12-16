# Coral Health & Hurricane Risk (Miami / Puerto Rico)

This repo powers a web app and offline ML pipeline to:
- Build regional hurricane-track datasets (Miami, Puerto Rico) from IBTrACS using coastline-aware buffers.
- Enrich tracks with SST anomalies (OISST), climate indices (Niño 3.4, AMO), and basic atmos features.
- Train per-region classifiers and export UI-ready insights (`public/ml_insights_*.json`).
- Plot ROC/PR curves for reporting (no front-end required).

Mobile builds were removed; focus is the web app + ML artifacts.

## Project layout (key parts)
- `src/` — React front-end (HurricanePredictor consumes `public/ml_insights_*.json`).
- `scripts/` — Data prep, feature engineering, training, plotting.
- `data_intermediate/` — Region track subsets and env-augmented CSVs (generated).
- `data_ml/` — ML-ready feature tables (generated).
- `public/ml_insights_*.json` — Model outputs consumed by the UI.
- `reports/` — ROC/PR PNGs for reports (generated).

## Quickstart (front-end)
```bash
npm i
npm run dev
Click the local host link to see 
```

## ML pipeline (per region)
Assumes raw data (IBTrACS CSV, OISST, nino34.csv, amo.csv) already in `data_raw/`.

1) Tracks → region subsets (uses GADM coastline buffers)
```bash
MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/prep_miami_hurricanes.py
MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/prep_puerto_rico_hurricanes.py
```
2) Add env features (SST anomaly, nino34, amo, basic atmos)
```bash
PYTHONPATH=. MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/merge_env_data.py
```
3) Build ML features (recency stats, climate indices)
```bash
MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/build_ml_features.py --region miami
MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/build_ml_features.py --region puerto_rico
```
4) Train + write insights (UI JSON + CV preds)
```bash
PYTHONPATH=. MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/train_ml.py \
  --csv data_ml/miami_ml_features.csv \
  --target impact_next30 \
  --out public/ml_insights_miami.json \
  --date-col date \
  --splits 3

PYTHONPATH=. MPLCONFIGDIR=/tmp/mpl venv/bin/python scripts/train_ml.py \
  --csv data_ml/puerto_rico_ml_features.csv \
  --target impact_next30 \
  --out public/ml_insights_puerto-rico.json \
  --date-col date \
  --splits 3
```
Each training run also writes `tmp/<out_stem>_preds.json` with CV predictions.

5) Plot ROC/PR for reports (from saved preds)
```bash
PYTHONPATH=. MPLCONFIGDIR=/tmp/mpl MPLBACKEND=Agg venv/bin/python scripts/plot_training.py \
  --preds tmp/ml_insights_puerto-rico_preds.json \
  --out-dir reports
```
Outputs: `reports/*_roc.png`, `reports/*_pr.png`.

## Large data policy
Raw datasets (IBTrACS CSVs, NetCDF, shapefiles) should live in `data_raw/` and be ignored from git. Add to `.gitignore`:
```
data_raw/
*.nc
*.nc4
```
Keep only small samples in the repo if needed; document download steps in scripts/README notes.

## Notes
- If you need to refresh both regions, re-run steps 1–4; the UI will pick up new `public/ml_insights_*.json` after a hard refresh.
- The decade bands in the UI are driven by the ML outputs; differentiation depends on the label sharpness and features (SST anomaly, ENSO/AMO, shear/humidity when available).
