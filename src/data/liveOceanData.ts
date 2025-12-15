// Coral Predictor: live data fetchers + normalizers for Miami-Dade, Florida Keys, and Puerto Rico
// The functions here wrap public APIs (USGS NWIS and multiple ERDDAP instances)
// and return tidy arrays ready for charting or feature engineering.
// Works in modern browsers. For Node usage, polyfill `fetch`.

export type TimePoint = string; // ISO8601

export type BBox = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

export interface TidyUSGS {
  t: TimePoint;
  tempC?: number | null;
  do_mgL?: number | null;
  pH?: number | null;
  cond_uScm?: number | null;
  salinityPpt?: number | null;
  site: string;
}

export interface TidyPR2Mooring {
  t: TimePoint;
  lat: number;
  lon: number;
  temperatureC: number | null;
  salinity: number | null;
}

export interface TidyGridVal {
  t: TimePoint;
  lat: number;
  lon: number;
  value: number | null;
  varName: string;
}

export interface TidyCheecaSample {
  t: TimePoint;
  tempC: number | null;
  salinity: number | null;
  pH: number | null;
  do_mgL: number | null;
  chlorophyll: number | null;
  turbidity: number | null;
}

export interface ActiveStorm {
  id: string;
  name: string;
  lat: number;
  lon: number;
  maxWindKts: number | null;
  pressureMb: number | null;
  advisoryUrl?: string;
  updated?: string;
}

export interface StormTrackPoint {
  t: TimePoint;
  lat: number;
  lon: number;
  windKts: number | null;
  pressureMb: number | null;
}

export interface StormTrack {
  id: string;
  name: string;
  year: number;
  basin: string;
  points: StormTrackPoint[];
}

const cache = new Map<string, { t: number; ttl: number; data: any }>();

function memo<T>(key: string, ttlMs: number, maker: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.t < hit.ttl) {
    return Promise.resolve(hit.data as T);
  }
  return maker().then(data => {
    cache.set(key, { t: now, ttl: ttlMs, data });
    return data;
  });
}

const DEFAULT_FETCH_TIMEOUT_MS = 10000;
const LONG_FETCH_TIMEOUT_MS = 20000;

function mustOk(r: Response, label: string) {
  if (!r.ok) {
    throw new Error(`${label} HTTP ${r.status}`);
  }
}

async function fetchWithTimeout(url: string, label: string, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      throw new Error(`${label} request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseCSV(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map(line => line.split(',').map(s => s.trim()));
}

const viaProxy = (url: string) => `/api/erddap?url=${encodeURIComponent(url)}`;

// Keep the last successful chlorophyll grid so we can fall back if the upstream is briefly down
const chlCache = new Map<string, string[][]>();
const stormTrackCache = new Map<string, StormTrack[]>();

function normalizeBBox(b: BBox) {
  const latMin = Math.min(b.latMin, b.latMax);
  const latMax = Math.max(b.latMin, b.latMax);
  const lonMin = Math.min(b.lonMin, b.lonMax);
  const lonMax = Math.max(b.lonMin, b.lonMax);
  return { latMin, latMax, lonMin, lonMax };
}

function haversineKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function timeSlice(iso?: string) {
  return iso ? `[(${iso})]` : '[(last)]';
}

function bboxToERDDAP180(b: BBox) {
  const { latMin, latMax, lonMin, lonMax } = normalizeBBox(b);
  return `[(${latMin}):(${latMax})][(${lonMin}):(${lonMax})]`;
}

const surfaceSlice = '[(0)]'; // ERDDAP datasets expose a single surface altitude level

const CHLORO_HOSTS = ['https://coastwatch.noaa.gov/erddap'];

// Try multiple CHL datasets in order: daily, sector (Zonal West), and 8-day composite (more reliable)
const CHLORO_DATASETS = [
  'noaacwNPPVIIRSchlaDaily',
  'noaacwNPPVIIRSchlaSectorZWDaily',
  'noaacwNPPVIIRSchla8Day'
];
const CHL_TIMEOUT_MS = 4000;

const NHC_ACTIVE_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';
const IBTRACS_NA_URL =
  'https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r00/access/csv/ibtracs.NA.list.v04r00.csv';

export interface StormRiskSummary {
  name: string;
  distanceKm: number;
  maxWindKts: number | null;
  pressureMb: number | null;
  advisoryUrl?: string;
  updated?: string;
}

export async function getNearestActiveStorm(center: [number, number]): Promise<StormRiskSummary | null> {
  const storms = await getActiveStorms();
  if (!storms.length) return null;
  let best: StormRiskSummary | null = null;
  for (const storm of storms) {
    const distanceKm = haversineKm(center, [storm.lat, storm.lon]);
    if (!best || distanceKm < best.distanceKm) {
      best = {
        name: storm.name,
        distanceKm,
        maxWindKts: storm.maxWindKts,
        pressureMb: storm.pressureMb,
        advisoryUrl: storm.advisoryUrl,
        updated: storm.updated
      };
    }
  }
  return best;
}

function chlaURL(host: string, dataset: string, bbox: BBox, iso?: string) {
  return `${host}/griddap/${dataset}.csv?chlor_a${timeSlice(iso)}${surfaceSlice}${bboxToERDDAP180(
    bbox
  )}`;
}

function sstURL(bbox: BBox, iso?: string) {
  return `https://erddap.marine.usf.edu/erddap/griddap/jplMURSST41.csv?analysed_sst${timeSlice(
    iso
  )}${bboxToERDDAP180(bbox)}`;
}

function sstFallbackURL(bbox: BBox, iso?: string) {
  return `https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.csv?analysed_sst${timeSlice(
    iso
  )}${bboxToERDDAP180(bbox)}`;
}

const USGS_PARAMS = '00010,00300,00400,00095,00480';

export async function getUSGS(site: string, period = 'P7D'): Promise<any> {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&period=${period}&parameterCd=${USGS_PARAMS}`;
  return memo(`usgs:${site}:${period}`, 60_000, async () => {
    const r = await fetch(url);
    mustOk(r, `USGS ${site}`);
    return r.json();
  });
}

export async function getActiveStorms(): Promise<ActiveStorm[]> {
  return memo('nhc:current-storms', 15 * 60_000, async () => {
    const response = await fetchWithTimeout(viaProxy(NHC_ACTIVE_STORMS_URL), 'NHC active storms', 5000);
    mustOk(response, 'NHC active storms');
    const json = await response.json();
    const storms = (json?.activeStorms ?? []) as any[];
    return storms
      .map(storm => ({
        id: storm.stormNumber ? String(storm.stormNumber) : storm.id ?? storm.name ?? 'storm',
        name: storm.name ?? storm.stormName ?? 'Unnamed storm',
        lat: Number(storm.lat ?? storm.latitude ?? 0),
        lon: Number(storm.lon ?? storm.longitude ?? 0),
        maxWindKts: storm.maxWind ? Number(storm.maxWind) : storm.wind ? Number(storm.wind) : null,
        pressureMb: storm.minPressure ? Number(storm.minPressure) : storm.pressure ? Number(storm.pressure) : null,
        advisoryUrl: storm.url ?? storm.advisory ?? storm.publicAdvisory ?? undefined,
        updated: storm.updateTime ?? storm.advisoryTime ?? undefined
      }))
      .filter(storm => Number.isFinite(storm.lat) && Number.isFinite(storm.lon));
  });
}

export async function getIbtracsNorthAtlantic(sinceYear = 2000): Promise<StormTrack[]> {
  const cacheKey = `ibtracs:${sinceYear}`;
  const cached = stormTrackCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetchWithTimeout(IBTRACS_NA_URL, 'IBTrACS NA', LONG_FETCH_TIMEOUT_MS);
  mustOk(response, 'IBTrACS NA');
  const text = await response.text();
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.split(',');
  const isoIdx = header?.indexOf('ISO_TIME') ?? -1;
  const latIdx = header?.indexOf('LAT') ?? -1;
  const lonIdx = header?.indexOf('LON') ?? -1;
  const windIdx = header?.indexOf('WMO_WIND') ?? -1;
  const presIdx = header?.indexOf('WMO_PRES') ?? -1;
  const nameIdx = header?.indexOf('NAME') ?? -1;
  const idIdx = header?.indexOf('SID') ?? -1;
  const basinIdx = header?.indexOf('BASIN') ?? -1;
  if (isoIdx < 0 || latIdx < 0 || lonIdx < 0 || !lines.length) return [];

  const tracks: Record<string, StormTrack> = {};
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',');
    const iso = cols[isoIdx];
    if (!iso) continue;
    const year = Number(iso.slice(0, 4));
    if (!Number.isFinite(year) || year < sinceYear) continue;
    const lat = Number(cols[latIdx]);
    const lon = Number(cols[lonIdx]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const id = cols[idIdx] || cols[nameIdx] || `storm-${i}`;
    const name = (cols[nameIdx] || 'Unnamed').trim();
    const basin = cols[basinIdx] || 'NA';
    const windKts = cols[windIdx] ? Number(cols[windIdx]) : null;
    const pressureMb = cols[presIdx] ? Number(cols[presIdx]) : null;
    if (!tracks[id]) {
      tracks[id] = { id, name, year, basin, points: [] };
    }
    tracks[id].points.push({ t: iso, lat, lon, windKts, pressureMb });
  }

  const result = Object.values(tracks).map(track => ({
    ...track,
    points: track.points.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
  }));
  stormTrackCache.set(cacheKey, result);
  return result;
}

export function normalizeUSGS(json: any, site: string): TidyUSGS[] {
  if (!json?.value?.timeSeries?.length) return [];
  const series = json.value.timeSeries;
  const byCode: Record<string, Array<{ dateTime: string; value: string }>> = {};

  for (const s of series) {
    const code = s.variable.variableCode?.[0]?.value;
    const vals = s.values?.[0]?.value ?? [];
    if (code) {
      byCode[code] = vals;
    }
  }

  const timeSource =
    byCode['00010']?.map(v => v.dateTime) ??
    Object.values(byCode)[0]?.map(v => v.dateTime) ??
    [];

  return timeSource.map((t, i) => {
    const read = (code: string): number | null => {
      const arr = byCode[code];
      if (!arr) return null;
      const raw = arr[i]?.value;
      if (raw === undefined || raw === null || raw === '') return null;
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    };

    return {
      t,
      tempC: read('00010'),
      do_mgL: read('00300'),
      pH: read('00400'),
      cond_uScm: read('00095'),
      salinityPpt: read('00480'),
      site
    };
  });
}

export const MIAMI_SITES = {
  littleRiver: '02286328', // C-8 Canal at NE 135th St (North Miami surface gauge)
  miamiRiver: '02290709' // Black Creek Canal at Old Cutler Rd near Biscayne Bay
};

export async function getPR2Mooring(days = 7, format: 'json' | 'csv' = 'json'): Promise<any> {
  const vars = 'time,latitude,longitude,temperature,salinity';
  const basePath =
    'https://reynolds-erddap.umeoce.maine.edu/erddap/tabledap/PR2_ocean_001m_merged';
  const url = `${basePath}.${format}?${vars}&time>=now-${days}days`;
  return memo(`pr2:${days}:${format}`, 60_000, async () => {
    const requestUrl = encodeURI(url);
    const r = await fetch(viaProxy(requestUrl));
    mustOk(r, 'CARICOOS PR2 Mooring');
    return format === 'json' ? r.json() : r.text();
  });
}

export function normalizePR2Mooring(json: any): TidyPR2Mooring[] {
  if (!json?.table?.columnNames || !json?.table?.rows) return [];
  const cols = json.table.columnNames as string[];
  const rows = json.table.rows as any[][];
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));

  return rows.map(r => {
    const temperature = r[idx.temperature];
    const salinity = r[idx.salinity];
    return {
      t: r[idx.time],
      lat: +r[idx.latitude],
      lon: +r[idx.longitude],
      temperatureC: temperature != null ? +temperature : null,
      salinity: salinity != null ? +salinity : null
    };
  });
}

async function fetchERDDAPWithFallback(
  urls: string[],
  label: string,
  options: { timeoutMs?: number; parallel?: boolean } = {}
) {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, parallel = false } = options;
  if (!urls.length) {
    throw new Error(`${label} proxy not configured; ensure /api/erddap is reachable.`);
  }
  let lastErr: Error | null = null;
  if (parallel) {
    const attempts = urls.map(url => (async () => {
      const response = await fetchWithTimeout(viaProxy(url), label, timeoutMs);
      mustOk(response, label);
      const text = await response.text();
      const trimmed = text.trim();
      if (/^Error\s*\{/.test(trimmed) || /<html/i.test(trimmed)) {
        throw new Error(`${label} error from ${url}: ${trimmed}`);
      }
      return text;
    })());
    try {
      return await Promise.any(attempts);
    } catch (error) {
      const agg = error as AggregateError;
      const errors = Array.isArray((agg as any).errors) ? (agg as any).errors : [];
      lastErr = errors[errors.length - 1] ?? (error instanceof Error ? error : new Error(String(error)));
    }
  } else {
    for (const url of urls) {
      try {
        const response = await fetchWithTimeout(viaProxy(url), label, timeoutMs);
        mustOk(response, label);
        const text = await response.text();
        const trimmed = text.trim();
        if (/^Error\s*\{/.test(trimmed) || /<html/i.test(trimmed)) {
          throw new Error(`${label} error from ${url}: ${trimmed}`);
        }
        return text;
      } catch (error) {
        lastErr = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastErr ?? new Error(`${label} fetch error`);
}

export async function getChlBBox(bbox: BBox, isoTime?: string): Promise<string[][]> {
  const urls = CHLORO_HOSTS.flatMap(host =>
    CHLORO_DATASETS.map(dataset => chlaURL(host, dataset, bbox, isoTime))
  );

  const cacheKey = JSON.stringify({ bbox, isoTime });

  return memo(`chla:${cacheKey}`, 120_000, async () => {
    const text = await fetchERDDAPWithFallback(urls, 'CoastWatch CHL', {
      timeoutMs: CHL_TIMEOUT_MS,
      parallel: true
    });
    const parsed = parseCSV(text);
    chlCache.set(cacheKey, parsed);
    return parsed;
  });
}

const loggedChlErrors = new Set<string>();

export async function tryGetChlBBox(bbox: BBox, isoTime?: string): Promise<string[][] | null> {
  const isoCandidates: (string | undefined)[] = [isoTime];
  if (!isoTime) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(now.getUTCDate() - 1);
    const twoDays = new Date(now);
    twoDays.setUTCDate(now.getUTCDate() - 2);
    isoCandidates.push(yesterday.toISOString(), twoDays.toISOString());
  }

  for (const iso of isoCandidates) {
    const cacheKey = JSON.stringify({ bbox, isoTime: iso });
    try {
      const grid = await getChlBBox(bbox, iso);
      return grid;
    } catch (error) {
      const cached = chlCache.get(cacheKey);
      const message = `Chlorophyll fetch failed${iso ? ` for ${iso}` : ''}; continuing without CHL grid`;
      if (cached) {
        if (!loggedChlErrors.has(cacheKey)) {
          console.warn(`${message}, reusing last good response`, error);
          loggedChlErrors.add(cacheKey);
        }
        return cached;
      }
      if (!loggedChlErrors.has(cacheKey)) {
        console.warn(message, error);
        loggedChlErrors.add(cacheKey);
      }
    }
  }

  return null;
}

export async function getSstBBox(bbox: BBox, isoTime?: string): Promise<string[][]> {
  const urls = [sstURL(bbox, isoTime), sstFallbackURL(bbox, isoTime)];

  return memo(`sst:${JSON.stringify({ bbox, isoTime })}`, 120_000, async () => {
    const text = await fetchERDDAPWithFallback(urls, 'USF ERDDAP SST');
    return parseCSV(text);
  });
}

function nearestIndex(vals: number[], target: number): number {
  let idx = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < vals.length; i++) {
    const dist = Math.abs(vals[i] - target);
    if (dist < best) {
      best = dist;
      idx = i;
    }
  }
  return idx;
}

export function sampleGridCSV(table: string[][], lat: number, lon: number): TidyGridVal | null {
  if (table.length < 2) return null;
  const header = table[0];
  const timeIdx = header.indexOf('time');
  const latIdx = header.indexOf('latitude');
  const lonIdx = header.indexOf('longitude');
  const varIdx = header.findIndex(h => !['time', 'latitude', 'longitude'].includes(h));
  if (timeIdx < 0 || latIdx < 0 || lonIdx < 0 || varIdx < 0) return null;

  const rows = table.slice(1);
  const lats = Array.from(new Set(rows.map(r => +r[latIdx]))).sort((a, b) => a - b);
  const lons = Array.from(new Set(rows.map(r => +r[lonIdx]))).sort((a, b) => a - b);

  const targetLatIdx = nearestIndex(lats, lat);
  const targetLonIdx = nearestIndex(lons, lon);
  const timestamp = rows[0][timeIdx];

  const chosen = rows.find(
    r => +r[latIdx] === lats[targetLatIdx] && +r[lonIdx] === lons[targetLonIdx]
  );
  const raw = chosen ? chosen[varIdx] : null;
  const value = raw === null || raw === '' ? null : +raw;

  return {
    t: timestamp,
    lat: lats[targetLatIdx],
    lon: lons[targetLonIdx],
    value,
    varName: header[varIdx]
  };
}

export const BBOX = {
  miamiKeys: { latMin: 24.0, latMax: 26.5, lonMin: -83.0, lonMax: -79.0 },
  puertoRico: { latMin: 16.5, latMax: 19.5, lonMin: -69.0, lonMax: -65.0 }
};

export async function loadMiamiRivers(period = 'P7D') {
  const [lr, mr] = await Promise.all([
    getUSGS(MIAMI_SITES.littleRiver, period),
    getUSGS(MIAMI_SITES.miamiRiver, period)
  ]);
  return {
    littleRiver: normalizeUSGS(lr, MIAMI_SITES.littleRiver),
    miamiRiver: normalizeUSGS(mr, MIAMI_SITES.miamiRiver)
  };
}

export async function loadPuertoRicoMooring(days = 7) {
  const raw = await getPR2Mooring(days, 'json');
  return normalizePR2Mooring(raw);
}

export async function loadMiamiKeysSat(dateISO?: string) {
  const [chlCSV, sstCSV] = await Promise.all([
    tryGetChlBBox(BBOX.miamiKeys, dateISO),
    getSstBBox(BBOX.miamiKeys, dateISO)
  ]);
  return { chlCSV: chlCSV ?? [], sstCSV };
}

export async function loadPuertoRicoSat(dateISO?: string) {
  const [chlCSV, sstCSV] = await Promise.all([
    tryGetChlBBox(BBOX.puertoRico, dateISO),
    getSstBBox(BBOX.puertoRico, dateISO)
  ]);
  return { chlCSV: chlCSV ?? [], sstCSV };
}

function toNumber(value: any): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function loadCheecaMooring(days = 180): Promise<TidyCheecaSample[]> {
  const base =
    'https://data.pmel.noaa.gov/pmel/erddap/tabledap/pmel_co2_moorings_045c_c8bc_b1c6.json';
  const earliest = '2011-01-01T00:00:00Z';
  const query =
    `?time,SST,SSS,pH_sw,DOXY,CHL,NTU&time>=${earliest}&orderBy(%22time%22)`;
  const url = `${base}${query}`;
  return memo(`cheeca:${days}`, 60_000, async () => {
    try {
      const r = await fetch(viaProxy(url));
      mustOk(r, 'Cheeca Rocks Mooring');
      const json = await r.json();
      const cols = json.table?.columnNames as string[] | undefined;
      const rows = json.table?.rows as any[][] | undefined;
      if (!cols || !rows) return [];
      const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const UMOL_TO_MG = 0.032;
      const samples: TidyCheecaSample[] = rows
        .map(row => {
          const iso = row[idx.time];
          return {
            t: iso,
            tempC: toNumber(row[idx.SST]),
            salinity: toNumber(row[idx.SSS]),
            pH: toNumber(row[idx.pH_sw]),
            do_mgL: row[idx.DOXY] != null ? Number(row[idx.DOXY]) * UMOL_TO_MG : null,
            chlorophyll: toNumber(row[idx.CHL]),
            turbidity: toNumber(row[idx.NTU])
          };
        })
        .filter(sample => {
          const ts = new Date(sample.t).getTime();
          return Number.isFinite(ts) && (Number.isNaN(cutoff) || ts >= cutoff);
        })
        .sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime());
      return samples;
    } catch (error) {
      console.warn('Cheeca mooring fetch failed', error);
      return [];
    }
  });
}
