"""
Helpers to derive impact labels using region polygons (GADM) instead of simple distance-to-center.
Requires geopandas, shapely, pyproj. If unavailable, callers should fall back to distance-based labels.
"""

from pathlib import Path
from typing import Optional, Tuple

import numpy as np


def _try_import_geopandas():
  try:
    import geopandas as gpd  # type: ignore
    from shapely.ops import transform  # type: ignore
    from shapely.geometry import Point  # type: ignore
    from pyproj import Transformer  # type: ignore
  except Exception as exc:  # pragma: no cover - optional dependency
    return None, None, None, None, exc
  return gpd, transform, Point, Transformer, None


def _load_polygon_from_file(path: Path, name_field: Optional[str] = None, name_value: Optional[str] = None):
  gpd, transform, Point, Transformer, err = _try_import_geopandas()
  if gpd is None:
    raise ImportError(f"geopandas/pyproj not available: {err}")
  gdf = gpd.read_file(path)
  if name_field and name_value and name_field in gdf.columns:
    gdf = gdf[gdf[name_field] == name_value]
  if gdf.empty:
    raise ValueError(f"No geometry found in {path} matching {name_value}")
  return gdf.unary_union


def load_region_polygon(region: str) -> Optional[object]:
  """
  Load a polygon for the given region id ("miami", "puerto_rico") using available GADM files.
  Returns a shapely geometry (multipolygon) or None if not found.
  """
  region = region.lower().replace("-", "_")
  candidates = []
  if region == "puerto_rico":
    candidates = [
      (Path("data_raw/gadm41_PRI_shp/gadm41_PRI_0.shp"), None, None),
      (Path("data_raw/gadm41_PRI_shp/gadm41_PRI_1.shp"), None, None),
      (Path("data_raw/gadm41_USA_shp/gadm41_USA_1.shp"), "NAME_1", "Puerto Rico"),
    ]
  elif region == "miami":
    candidates = [
      (Path("data_raw/gadm41_USA_shp/gadm41_USA_1.shp"), "NAME_1", "Florida"),
    ]
  else:
    return None

  for path, field, value in candidates:
    if path.exists():
      try:
        return _load_polygon_from_file(path, field, value)
      except Exception:
        continue
  return None


def label_points_with_polygon(
  df,
  region: str,
  lon_col: str = "LON",
  lat_col: str = "LAT",
  buffer_km: float = 100.0
) -> Tuple[np.ndarray, np.ndarray]:
  """
  Returns (impact_label, distance_km) arrays using polygon buffers.
  impact_label = 1 if point is inside buffered polygon, else 0.
  distance_km = geodesic distance to polygon boundary (0 if inside).
  """
  gpd, transform, Point, Transformer, err = _try_import_geopandas()
  if gpd is None:
    raise ImportError(f"geopandas/pyproj not available: {err}")
  poly = load_region_polygon(region)
  if poly is None:
    raise ValueError(f"No polygon found for region {region}")

  # Project to meters for buffering and distance
  project = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True).transform
  poly_proj = transform(project, poly)
  buffered = poly_proj.buffer(buffer_km * 1000.0)

  labels = []
  distances = []
  for lon, lat in zip(df[lon_col], df[lat_col]):
    pt_proj = transform(project, Point(float(lon), float(lat)))
    inside = buffered.contains(pt_proj)
    labels.append(1 if inside else 0)
    distances.append(pt_proj.distance(buffered) / 1000.0)

  return np.array(labels, dtype=int), np.array(distances, dtype=float)
