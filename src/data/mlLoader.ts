export type MLDrivers = {
  drivers?: { feature: string; shap: number; direction: number }[];
  lagTests?: { feature: string; bestLagDays: number | null; pValue: number | null }[];
  metrics?: { auc?: number; f1?: number };
  band?: Array<{ year: number; mean: number; low: number; high: number }>;
};

let cached: MLDrivers | null = null;
const fallbackInsights: MLDrivers = {
  drivers: [],
  lagTests: [],
  metrics: undefined,
  band: []
};

const regionCache: Record<string, MLDrivers | null> = {};
const regionWarned: Record<string, boolean> = {};

export async function loadMlInsights(regionId?: string): Promise<MLDrivers | null> {
  const key = regionId || 'default';
  if (regionCache[key]) return regionCache[key];
  const files = regionId ? [`/ml_insights_${regionId}.json`, '/ml_insights.json'] : ['/ml_insights.json'];
  for (const file of files) {
    try {
      const res = await fetch(file, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${file} ${res.status}`);
      const json = (await res.json()) as MLDrivers;
      regionCache[key] = json;
      if (!regionWarned[key]) {
        console.info(`[ml] loaded insights from ${file} for region ${key}`);
        regionWarned[key] = true;
      }
      return regionCache[key];
    } catch {
      continue;
    }
  }
  regionCache[key] = fallbackInsights;
  if (!regionWarned[key]) {
    console.warn(`[ml] insights fallback used for region ${key} (files not found or failed to parse)`);
    regionWarned[key] = true;
  }
  return regionCache[key];
}
