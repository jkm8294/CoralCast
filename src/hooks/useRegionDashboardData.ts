import { useEffect, useState } from 'react';
import { Region, CoralHealthData, TrendData } from '../types/coral';
import {
  BBOX,
  type BBox,
  type TidyPR2Mooring,
  type TidyUSGS,
  type TidyCheecaSample,
  type StormRiskSummary,
  loadMiamiKeysSat,
  loadMiamiRivers,
  loadPuertoRicoMooring,
  loadPuertoRicoSat,
  loadCheecaMooring,
  sampleGridCSV,
  tryGetChlBBox,
  getNearestActiveStorm
} from '../data/liveOceanData';
import { computeDriverInsights } from '../data/mlInsights';
import { loadMlInsights } from '../data/mlLoader';
import { DetailMetricPayload } from '../types/detail';

type DetailKey = 'temperature' | 'chlorophyll' | 'ph' | 'oxygen';

type SeriesPoint = { timestamp: string; value: number };

interface HurricaneInputs {
  sst: number | null;
  chlorophyll: number | null;
  activeStorm?: StormRiskSummary | null;
}

interface DashboardState {
  summary: CoralHealthData | null;
  trend: TrendData | null;
  details: Partial<Record<DetailKey, DetailMetricPayload>>;
  hurricaneInputs: HurricaneInputs;
  drivers?: ReturnType<typeof computeDriverInsights>;
  mlDrivers?: {
    drivers?: { feature: string; shap: number; direction: number }[];
    lagTests?: { feature: string; bestLagDays: number | null; pValue: number | null }[];
    metrics?: { auc?: number; f1?: number };
    band?: Array<{ year: number; mean: number; low: number; high: number }>;
  };
  loading: boolean;
  error: string | null;
}

const TEMP_THRESHOLDS = {
  good: 27,
  warning: 29,
  alert: 30
};

const CHL_THRESHOLDS = {
  good: 0.25,
  warning: 0.45,
  alert: 0.8
};

const PH_THRESHOLDS = {
  good: 8.1,
  warning: 7.9,
  alert: 7.7
};

const DO_THRESHOLDS = {
  good: 6.5,
  warning: 5,
  alert: 4
};

const MAX_HISTORY_POINTS = 30;

export function useRegionDashboardData(region: Region): DashboardState {
  const [state, setState] = useState<DashboardState>({
    summary: null,
    trend: null,
    details: {},
    hurricaneInputs: { sst: null, chlorophyll: null, activeStorm: null },
    loading: false,
    error: null
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({
        summary: null,
        trend: null,
        details: {},
        hurricaneInputs: { sst: null, chlorophyll: null, activeStorm: null },
        loading: true,
        error: null
      });
      try {
        let result: Omit<DashboardState, 'loading' | 'error'>;
        if (region.id === 'miami') {
          result = await buildMiamiDashboard(region);
        } else if (region.id === 'puerto-rico') {
          result = await buildPuertoRicoDashboard(region);
        } else {
          throw new Error(`Unsupported region: ${region.name}`);
        }
        if (!cancelled) {
          setState({
            ...result,
            loading: false,
            error: null
          });
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load real data';
          setState(prev => ({
            ...prev,
            loading: false,
            error: message
          }));
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [region]);

  return state;
}

async function buildMiamiDashboard(region: Region): Promise<Omit<DashboardState, 'loading' | 'error'>> {
  const [rivers, satLatest, chlHistory, cheeca, activeStorm] = await Promise.all([
    loadMiamiRivers('P30D'),
    loadMiamiKeysSat(),
    loadChlorophyllHistory(region, BBOX.miamiKeys),
    loadCheecaMooring(365),
    getNearestActiveStorm(region.centroid)
  ]);

  const riverTempSeries = dailyAverageSeries(buildUSGSSeries(rivers, entry => entry.tempC));
  const cheecaTempSeries = buildCheecaSeries(cheeca, entry => entry.tempC);
  const tempSeries = mergeSeries(riverTempSeries, cheecaTempSeries);
  const latestTemp = latestAverage(rivers, entry => entry.tempC) ?? cheecaTempSeries.at(-1)?.value ?? null;
  const salinity = latestAverage(rivers, entry => entry.salinityPpt);
  const conductance = latestAverage(rivers, entry => entry.cond_uScm);
  const cheecaLatest = cheeca[cheeca.length - 1];
  const lastTimestamp = latestTimestampOf([
    latestTimestampFromStations(rivers),
    cheecaLatest?.t ?? null
  ]);

  const sstSample = sampleSst(satLatest.sstCSV, region);
  const chlSample = sampleChlorophyll(satLatest.chlCSV, region);
  const cheecaChlSeries = buildCheecaSeries(cheeca, entry => entry.chlorophyll);
  const chlorophyllValue = cheecaChlSeries.at(-1)?.value ?? chlSample ?? chlHistory.at(-1)?.value ?? null;
  const chlSeriesForInsights = cheecaChlSeries.length ? cheecaChlSeries : chlHistory;

  const dhw = computeDHW(tempSeries);
  const dhwPrev = computeDHW(tempSeries.slice(0, Math.max(0, tempSeries.length - 7)));

  const summary = buildCoralHealthSummary({
    region,
    tempSeries,
    latestTemp: latestTemp ?? sstSample,
    sstSample,
    chlorophyll: chlorophyllValue,
    salinity,
    conductance,
    dhw,
    dhwPrev,
    lastTimestamp,
    ph: cheecaLatest?.pH ?? null,
    dissolvedOxygen: cheecaLatest?.do_mgL ?? null
  });

  const trend: TrendData | null = tempSeries.length
    ? {
        metric: 'Sea Surface Temperature',
        unit: '°C',
        data: tempSeries.slice(-MAX_HISTORY_POINTS)
      }
    : null;

  const details: Partial<Record<DetailKey, DetailMetricPayload>> = {};
  if (tempSeries.length && summary) {
    details.temperature = buildTemperatureDetail(tempSeries, summary.sst.value ?? latestTemp ?? null);
  }
  const chlSeries = cheecaChlSeries.length
    ? cheecaChlSeries
    : chlHistory.length
    ? chlHistory
    : chlorophyllValue != null
    ? [{ timestamp: lastTimestamp ?? new Date().toISOString(), value: chlorophyllValue }]
    : [];

  if (chlSeries.length) {
    details.chlorophyll = buildChlorophyllDetail(chlSeries, chlorophyllValue);
  }

  const drivers = computeDriverInsights(tempSeries.slice(-90), chlSeriesForInsights.slice(-90));
  const phSeries = buildCheecaSeries(cheeca, entry => entry.pH);
  if (phSeries.length) {
    details.ph = buildPhDetail(phSeries);
  }
  const doSeries = buildCheecaSeries(cheeca, entry => entry.do_mgL);
  if (doSeries.length) {
    details.oxygen = buildDODetail(doSeries);
  }

  const mlDrivers = await loadMlInsights(region.id);

  return {
    summary,
    trend,
    details,
    hurricaneInputs: {
      sst: sstSample ?? latestTemp ?? null,
      chlorophyll: chlorophyllValue,
      activeStorm
    },
    drivers,
    mlDrivers
  };
}

async function buildPuertoRicoDashboard(region: Region): Promise<Omit<DashboardState, 'loading' | 'error'>> {
  const [mooring, satLatest, chlHistory, activeStorm] = await Promise.all([
    loadPuertoRicoMooring(30),
    loadPuertoRicoSat(),
    loadChlorophyllHistory(region, BBOX.puertoRico),
    getNearestActiveStorm(region.centroid)
  ]);

  const tempSeries = dailyAverageSeries(buildMooringSeries(mooring, entry => entry.temperatureC));
  const latestTemp = mooring.length ? mooring[mooring.length - 1]?.temperatureC ?? null : null;
  const salinity = mooring.length ? mooring[mooring.length - 1]?.salinity ?? null : null;
  const lastTimestamp = mooring.length ? mooring[mooring.length - 1]?.t ?? null : null;

  const sstSample = sampleSst(satLatest.sstCSV, region);
  const chlSample = sampleChlorophyll(satLatest.chlCSV, region);
  const chlorophyllValue = chlSample ?? chlHistory.at(-1)?.value ?? null;
  const chlSeriesForInsights = chlHistory.length
    ? chlHistory
    : chlorophyllValue != null
    ? [{ timestamp: lastTimestamp ?? new Date().toISOString(), value: chlorophyllValue }]
    : [];

  const dhw = computeDHW(tempSeries);
  const dhwPrev = computeDHW(tempSeries.slice(0, Math.max(0, tempSeries.length - 7)));

  const summary = buildCoralHealthSummary({
    region,
    tempSeries,
    latestTemp: latestTemp ?? sstSample,
    sstSample,
    chlorophyll: chlorophyllValue,
    salinity,
    conductance: null,
    dhw,
    dhwPrev,
    lastTimestamp,
    ph: null,
    dissolvedOxygen: null
  });

  const trend: TrendData | null = tempSeries.length
    ? {
        metric: 'Sea Surface Temperature',
        unit: '°C',
        data: tempSeries.slice(-MAX_HISTORY_POINTS)
      }
    : null;

  const details: Partial<Record<DetailKey, DetailMetricPayload>> = {};
  if (tempSeries.length && summary) {
    details.temperature = buildTemperatureDetail(tempSeries, summary.sst.value ?? latestTemp ?? null);
  }
  const chlSeries = chlHistory.length
    ? chlHistory
    : chlorophyllValue != null
    ? [{ timestamp: lastTimestamp ?? new Date().toISOString(), value: chlorophyllValue }]
    : [];
  if (chlSeries.length) {
    details.chlorophyll = buildChlorophyllDetail(chlSeries, chlorophyllValue);
  }

  const drivers = computeDriverInsights(tempSeries.slice(-90), chlSeriesForInsights.slice(-90));
  const mlDrivers = await loadMlInsights(region.id);

  return {
    summary,
    trend,
    details,
    hurricaneInputs: {
      sst: sstSample ?? latestTemp ?? null,
      chlorophyll: chlorophyllValue,
      activeStorm
    },
    drivers,
    mlDrivers
  };
}

function buildCoralHealthSummary({
  region,
  tempSeries,
  latestTemp,
  sstSample,
  chlorophyll,
  salinity,
  conductance,
  dhw,
  dhwPrev,
  lastTimestamp,
  ph,
  dissolvedOxygen
}: {
  region: Region;
  tempSeries: SeriesPoint[];
  latestTemp: number | null | undefined;
  sstSample: number | null;
  chlorophyll: number | null;
  salinity: number | null;
  conductance: number | null;
  dhw: number;
  dhwPrev: number;
  lastTimestamp: string | null;
  ph: number | null;
  dissolvedOxygen: number | null;
}): CoralHealthData | null {
  if (latestTemp == null && sstSample == null && chlorophyll == null) {
    return null;
  }

  const tempValue = latestTemp ?? sstSample ?? null;
  const tempTrend = computeTrendDirection(tempSeries);
  const tempStatus = statusFromThresholds(tempValue, TEMP_THRESHOLDS);

  const dhwTrend = trendFromValues(dhwPrev, dhw);
  const dhwStatus = dhw >= 4 ? 'alert' : dhw >= 2 ? 'warning' : 'good';

  const bleachingLevel = bleachingLevelFromDHW(dhw);
  const bleachingStatus = bleachingLevel >= 3 ? 'alert' : bleachingLevel >= 1 ? 'warning' : 'good';
  const bleachingTrend = dhwTrend;

  const chlStatus = statusFromThresholds(chlorophyll, CHL_THRESHOLDS);
  const chlTrend = 'stable';

  const chiScore = computeChiScore({
    temp: tempValue,
    dhw,
    chlorophyll,
    ph,
    dissolvedOxygen
  });

  return {
    chi: {
      score: Math.round(chiScore),
      value: chiScore,
      unit: '0-100',
      trend: tempTrend,
      status: chiScore >= 70 ? 'good' : chiScore >= 55 ? 'warning' : 'alert'
    },
    sst: {
      value: tempValue,
      unit: '°C',
      trend: tempTrend,
      status: tempStatus
    },
    dhw: {
      value: +dhw.toFixed(2),
      unit: '°C-weeks',
      trend: dhwTrend,
      status: dhwStatus
    },
    bleachingAlert: {
      value: bleachingLevel,
      level: bleachingLevel,
      unit: 'Alert Level',
      trend: bleachingTrend,
      status: bleachingStatus
    },
    chlorophyllA: {
      value: chlorophyll,
      unit: 'mg/m³',
      trend: chlTrend,
      status: chlStatus
    },
    lastUpdated: lastTimestamp ?? new Date().toISOString()
  };
}

function buildTemperatureDetail(series: SeriesPoint[], latest: number | null): DetailMetricPayload {
  const current = latest ?? series[series.length - 1]?.value ?? 0;
  const history = series.slice(-MAX_HISTORY_POINTS).map(point => ({
    date: formatShortDate(point.timestamp),
    value: Number(point.value.toFixed(2)),
    baseline: TEMP_THRESHOLDS.good
  }));
  const status = statusFromThresholds(current, TEMP_THRESHOLDS);
  return {
    metric: {
      current: current ?? NaN,
      unit: '°C',
      status,
      trend: computeTrendDirection(series),
      threshold: TEMP_THRESHOLDS,
      impact:
        status === 'alert'
          ? 'Extreme water temperatures are pushing corals beyond their thermal tolerance.'
          : status === 'warning'
          ? 'Temperatures are elevated; sensitive corals may begin to show stress.'
          : 'Temperatures remain within the comfort band for most coral species.',
      recommendation:
        status === 'alert'
          ? 'Expect active bleaching. Prioritize shading or localized cooling interventions where possible.'
          : status === 'warning'
          ? 'Increase monitoring frequency and prepare mitigation plans.'
          : 'Maintain routine monitoring cadence.'
    },
    historicalData: history
  };
}

function buildChlorophyllDetail(series: SeriesPoint[], latest: number | null): DetailMetricPayload {
  const current = latest ?? series[series.length - 1]?.value ?? 0;
  const history = series.slice(-MAX_HISTORY_POINTS).map(point => ({
    date: formatShortDate(point.timestamp),
    value: Number(point.value.toFixed(3)),
    baseline: CHL_THRESHOLDS.good
  }));
  const status = statusFromThresholds(current, CHL_THRESHOLDS);
  return {
    metric: {
      current: current ?? NaN,
      unit: 'mg/m³',
      status,
      trend: computeTrendDirection(series),
      threshold: CHL_THRESHOLDS,
      impact:
        status === 'alert'
          ? 'High chlorophyll indicates possible bloom conditions that can block light and smother coral.'
          : status === 'warning'
          ? 'Elevated chlorophyll suggests increased runoff or bloom potential.'
          : 'Chlorophyll levels reflect typical background phytoplankton.',
      recommendation:
        status === 'alert'
          ? 'Coordinate with water quality teams to track bloom development and issue advisories.'
          : status === 'warning'
          ? 'Watch for turbidity or discoloration near reefs following rains.'
          : 'No immediate chlorophyll-related concerns.'
    },
    historicalData: history
  };
}

function buildPhDetail(series: SeriesPoint[]): DetailMetricPayload {
  const current = series[series.length - 1]?.value ?? 0;
  const history = series.slice(-MAX_HISTORY_POINTS).map(point => ({
    date: formatShortDate(point.timestamp),
    value: Number(point.value.toFixed(3)),
    baseline: PH_THRESHOLDS.good
  }));
  const status = statusFromThresholds(current, PH_THRESHOLDS);
  return {
    metric: {
      current,
      unit: 'pH',
      status,
      trend: computeTrendDirection(series),
      threshold: PH_THRESHOLDS,
      impact:
        status === 'alert'
          ? 'Acidified conditions can dissolve coral skeletons and slow calcification.'
          : status === 'warning'
          ? 'pH is drifting low; monitor carbonate system to anticipate stress.'
          : 'pH remains within the healthy range for reef calcifiers.',
      recommendation:
        status === 'alert'
          ? 'Coordinate with water quality managers to identify acidic discharges.'
          : status === 'warning'
          ? 'Increase sampling cadence and consider alkalinity additions for nurseries.'
          : 'Continue routine monitoring.'
    },
    historicalData: history
  };
}

function buildDODetail(series: SeriesPoint[]): DetailMetricPayload {
  const current = series[series.length - 1]?.value ?? 0;
  const history = series.slice(-MAX_HISTORY_POINTS).map(point => ({
    date: formatShortDate(point.timestamp),
    value: Number(point.value.toFixed(2)),
    baseline: DO_THRESHOLDS.good
  }));
  const status = statusFromThresholds(current, DO_THRESHOLDS);
  return {
    metric: {
      current,
      unit: 'mg/L',
      status,
      trend: computeTrendDirection(series),
      threshold: DO_THRESHOLDS,
      impact:
        status === 'alert'
          ? 'Hypoxic conditions threaten fish and coral respiration.'
          : status === 'warning'
          ? 'Oxygen levels are dipping; stagnant or algae-rich waters may be present.'
          : 'Oxygen availability is sufficient for reef metabolism.',
      recommendation:
        status === 'alert'
          ? 'Investigate nutrient inputs and consider targeted aeration for nurseries.'
          : status === 'warning'
          ? 'Increase water exchange or reduce nutrient loads if possible.'
          : 'Maintain standard observations.'
    },
    historicalData: history
  };
}

async function loadChlorophyllHistory(region: Region, bbox: BBox, days = 3): Promise<SeriesPoint[]> {
  const latestResponse = await tryGetChlBBox(bbox);
  if (!latestResponse) return [];

  const latestTimestamp = extractTimestamp(latestResponse) ?? new Date().toISOString();
  const baseDate = new Date(latestTimestamp);
  const tasks = [
    Promise.resolve({
      csv: latestResponse,
      iso: baseDate.toISOString()
    })
  ];

  for (let index = 1; index < days; index++) {
    const date = new Date(baseDate);
    date.setUTCDate(date.getUTCDate() - index);
    const iso = date.toISOString();
    tasks.push(
      tryGetChlBBox(bbox, iso)
        .then(csv => (csv ? { csv, iso } : null))
        .catch(() => null)
    );
  }

  const responses = await Promise.all(tasks);
  const samples: SeriesPoint[] = [];
  for (const response of responses) {
    if (!response) continue;
    const points = region.reefs
      .map(reef => sampleGridCSV(response.csv, reef.coordinates[0], reef.coordinates[1]))
      .filter(Boolean);
    const values = points
      .map(point => point?.value)
      .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));
    if (!values.length) continue;
    const timestamp = points[0]?.t ?? response.iso;
    samples.push({
      timestamp,
      value: average(values) ?? NaN
    });
  }
  return samples
    .filter(point => Number.isFinite(point.value))
    .reverse()
    .slice(0, days)
    .map(point => ({ ...point, value: Number(point.value.toFixed(3)) }));
}

function extractTimestamp(table: string[][]): string | undefined {
  if (!table.length) return undefined;
  const header = table[0];
  const timeIdx = header.indexOf('time');
  if (timeIdx < 0) return undefined;
  for (let i = 1; i < table.length; i++) {
    const value = table[i]?.[timeIdx];
    if (value && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return value;
    }
  }
  return undefined;
}

function buildUSGSSeries(
  rivers: Record<string, TidyUSGS[]>,
  picker: (entry: TidyUSGS) => number | null | undefined
): SeriesPoint[] {
  const series: SeriesPoint[] = [];
  for (const entries of Object.values(rivers)) {
    for (const entry of entries) {
      const value = picker(entry);
      if (value == null || !Number.isFinite(value)) continue;
      series.push({ timestamp: entry.t, value });
    }
  }
  return series.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function buildMooringSeries(
  rows: TidyPR2Mooring[],
  picker: (entry: TidyPR2Mooring) => number | null | undefined
): SeriesPoint[] {
  const series: SeriesPoint[] = [];
  for (const entry of rows) {
    const value = picker(entry);
    if (value == null || !Number.isFinite(value)) continue;
    series.push({ timestamp: entry.t, value });
  }
  return series.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function buildCheecaSeries(
  rows: TidyCheecaSample[],
  picker: (entry: TidyCheecaSample) => number | null | undefined
): SeriesPoint[] {
  const series: SeriesPoint[] = [];
  for (const entry of rows) {
    const value = picker(entry);
    if (value == null || !Number.isFinite(value)) continue;
    series.push({ timestamp: entry.t, value });
  }
  return series.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function dailyAverageSeries(series: SeriesPoint[]): SeriesPoint[] {
  const byDay = new Map<string, number[]>();
  for (const point of series) {
    const day = point.timestamp.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(point.value);
    byDay.set(day, arr);
  }
  const averaged: SeriesPoint[] = [];
  for (const [day, values] of byDay.entries()) {
    averaged.push({
      timestamp: `${day}T00:00:00Z`,
      value: average(values) ?? NaN
    });
  }
  return averaged
    .filter(point => Number.isFinite(point.value))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function latestAverage(
  rivers: Record<string, TidyUSGS[]>,
  picker: (entry: TidyUSGS) => number | null | undefined
): number | null {
  const values = Object.values(rivers)
    .map(entries => entries[entries.length - 1])
    .filter(Boolean)
    .map(entry => picker(entry as TidyUSGS))
    .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));
  return average(values);
}

function latestTimestampFromStations(rivers: Record<string, TidyUSGS[]>): string | null {
  const timestamps = Object.values(rivers)
    .map(entries => entries[entries.length - 1]?.t)
    .filter((t): t is string => typeof t === 'string');
  if (!timestamps.length) return null;
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function latestTimestampOf(values: Array<string | null | undefined>): string | null {
  const timestamps = values.filter((val): val is string => typeof val === 'string');
  if (!timestamps.length) return null;
  return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function sampleChlorophyll(csv: string[][], region: Region): number | null {
  const values = region.reefs
    .map(reef => sampleGridCSV(csv, reef.coordinates[0], reef.coordinates[1])?.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return average(values);
}

function sampleSst(csv: string[][], region: Region): number | null {
  const values = region.reefs
    .map(reef => {
      const sample = sampleGridCSV(csv, reef.coordinates[0], reef.coordinates[1]);
      return sample?.value != null ? kelvinToCelsius(sample.value) : null;
    })
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return average(values);
}

function computeDHW(series: SeriesPoint[]): number {
  if (!series.length) return 0;
  const lookback = series.slice(-7);
  if (!lookback.length) return 0;
  const baseline = 29;
  const heating = lookback.map(point => Math.max(0, point.value - baseline));
  const sum = heating.reduce((acc, value) => acc + value, 0);
  return Number((sum / 7).toFixed(2));
}

function computeTrendDirection(series: SeriesPoint[]): 'up' | 'down' | 'stable' {
  if (series.length < 2) return 'stable';
  const first = series[0].value;
  const last = series[series.length - 1].value;
  const delta = last - first;
  if (Math.abs(delta) < 0.15) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

function trendFromValues(previous: number, current: number): 'up' | 'down' | 'stable' {
  const delta = current - previous;
  if (Math.abs(delta) < 0.2) return 'stable';
  return delta > 0 ? 'up' : 'down';
}

function statusFromThresholds(
  value: number | null | undefined,
  thresholds: { good: number; warning: number; alert: number }
): 'good' | 'warning' | 'alert' {
  if (value == null || !Number.isFinite(value)) return 'warning';
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.warning) return 'warning';
  return 'alert';
}

function average(values: number[]): number;
function average(values: Array<number | null | undefined>): number | null;
function average(values: Array<number | null | undefined>): number | null {
  const arr = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!arr.length) return null;
  const sum = arr.reduce((acc, value) => acc + value, 0);
  return sum / arr.length;
}

function mergeSeries(...seriesList: SeriesPoint[][]): SeriesPoint[] {
  const merged = seriesList.flat().filter(point => Number.isFinite(point.value));
  return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function kelvinToCelsius(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value > 200 ? value - 273.15 : value;
}

function computeChiScore({
  temp,
  dhw,
  chlorophyll,
  ph,
  dissolvedOxygen
}: {
  temp: number | null;
  dhw: number;
  chlorophyll: number | null;
  ph: number | null;
  dissolvedOxygen: number | null;
}): number {
  let score = 90;
  if (temp != null) {
    score -= Math.max(0, temp - 27.5) * 4.5;
  } else {
    score -= 5;
  }

  score -= Math.min(20, dhw * 4);

  if (chlorophyll != null) {
    const bloomPenalty = Math.max(0, chlorophyll - 0.3) * 30;
    score -= Math.min(25, bloomPenalty);
  } else {
    score -= 4;
  }

  if (ph != null) {
    const phDeficit = Math.max(0, 8.05 - ph);
    score -= phDeficit * 50;
  } else {
    score -= 6;
  }

  if (dissolvedOxygen != null) {
    const doDeficit = Math.max(0, 6.5 - dissolvedOxygen);
    score -= doDeficit * 6;
  } else {
    score -= 4;
  }

  return Math.max(0, Math.min(100, score));
}

function bleachingLevelFromDHW(dhw: number): number {
  if (dhw >= 8) return 4;
  if (dhw >= 4) return 3;
  if (dhw >= 1) return 2;
  if (dhw > 0) return 1;
  return 0;
}

function formatShortDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
