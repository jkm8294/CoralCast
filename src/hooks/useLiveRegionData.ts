import { useEffect, useMemo, useState } from 'react';
import { Region } from '../types/coral';
import {
  loadMiamiKeysSat,
  loadMiamiRivers,
  loadPuertoRicoMooring,
  loadPuertoRicoSat,
  loadCheecaMooring,
  sampleGridCSV
} from '../data/liveOceanData';

export interface LiveMetricSummary {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  source: string;
}

export interface LiveReefSample {
  reefId: string;
  reefName: string;
  chlorophyll?: number | null;
  chlorophyllUnit?: string;
  sst?: number | null;
  sstUnit?: string;
}

export interface LiveRegionSummary {
  timestamp?: string;
  metrics: LiveMetricSummary[];
  reefSamples?: LiveReefSample[];
  notes?: string;
}

export interface LiveRegionState {
  data: LiveRegionSummary | null;
  loading: boolean;
  error: string | null;
}

function round(value: number | null | undefined, decimals = 2): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function kelvinToCelsius(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value > 200 ? value - 273.15 : value;
}

function isoMax(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

export function useLiveRegionData(region: Region): LiveRegionState {
  const [state, setState] = useState<LiveRegionState>({
    data: null,
    loading: false,
    error: null
  });

  const regionKey = useMemo(() => region.id, [region.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState({
        data: null,
        loading: true,
        error: null
      });
      try {
        let data: LiveRegionSummary | null = null;

        if (regionKey === 'puerto-rico') {
          const [mooring, sat] = await Promise.all([
            loadPuertoRicoMooring(7),
            loadPuertoRicoSat()
          ]);

          const latest = mooring[mooring.length - 1];
          const metrics: LiveMetricSummary[] = [];
          if (latest) {
            if (latest.temperatureC != null) {
              metrics.push({
                id: 'sst',
                label: 'Sea Surface Temp',
                value: round(latest.temperatureC),
                unit: '°C',
                source: 'CARICOOS PR2 Mooring (1 m)'
              });
            }
            if (latest.salinity != null) {
              metrics.push({
                id: 'salinity',
                label: 'Salinity',
                value: round(latest.salinity, 3),
                unit: 'PSU',
                source: 'CARICOOS PR2 Mooring (1 m)'
              });
            }
          }

          const reefSamples = region.reefs.map(reef => {
            const chl = sampleGridCSV(sat.chlCSV, reef.coordinates[0], reef.coordinates[1]);
            const sst = sampleGridCSV(sat.sstCSV, reef.coordinates[0], reef.coordinates[1]);
            return {
              reefId: reef.id,
              reefName: reef.name,
              chlorophyll: round(chl?.value ?? null),
              chlorophyllUnit: chl?.varName ? 'mg/m³' : undefined,
              sst: round(kelvinToCelsius(sst?.value ?? null)),
              sstUnit: '°C'
            };
          });

          data = {
            timestamp: latest?.t,
            metrics,
            reefSamples,
            notes:
              'Live CARICOOS PR2 mooring (San Juan) temperature/salinity paired with NOAA CoastWatch VIIRS chlorophyll and MUR SST. For carbonate chemistry, use the historical Cheeca Rocks MAPCO2 dataset (ends 2021).'
          };
        } else if (regionKey === 'miami') {
          const [rivers, sat, cheeca] = await Promise.all([
            loadMiamiRivers('P3D'),
            loadMiamiKeysSat(),
            loadCheecaMooring(365)
          ]);
          const latestSeries = Object.values(rivers)
            .map(values => values[values.length - 1])
            .filter(Boolean);

          let latestTimestamp: string | undefined;
          const avg = (picker: (entry: typeof latestSeries[number]) => number | null | undefined) => {
            const vals = latestSeries
              .map(entry => picker(entry))
              .filter((val): val is number => typeof val === 'number' && Number.isFinite(val));
            if (!vals.length) return null;
            const sum = vals.reduce((acc, val) => acc + val, 0);
            return sum / vals.length;
          };

          for (const entry of latestSeries) {
            latestTimestamp = isoMax(latestTimestamp, entry?.t);
          }

          const metrics: LiveMetricSummary[] = [];
          const riverSource = 'USGS NWIS (C-8 & Black Creek Canals)';
          const avgTemp = avg(entry => entry?.tempC ?? null);
          if (avgTemp != null) {
            metrics.push({
              id: 'sst',
              label: 'Water Temp',
              value: round(avgTemp),
              unit: '°C',
              source: riverSource
            });
          }

          const avgSalinity = avg(entry => entry?.salinityPpt ?? null);
          if (avgSalinity != null) {
            metrics.push({
              id: 'salinity',
              label: 'Salinity',
              value: round(avgSalinity),
              unit: 'ppt',
              source: riverSource
            });
          }

          const avgCond = avg(entry => entry?.cond_uScm ?? null);
          if (avgCond != null) {
            metrics.push({
              id: 'conductivity',
              label: 'Specific Conductance',
              value: round(avgCond, 0),
              unit: 'µS/cm',
              source: riverSource
            });
          }
          const cheecaLatest = cheeca[cheeca.length - 1];
          if (cheecaLatest?.chlorophyll != null) {
            metrics.push({
              id: 'chlorophyll',
              label: 'Chlorophyll-a',
              value: round(cheecaLatest.chlorophyll),
              unit: 'mg/m³',
              source: 'NOAA PMEL Cheeca Rocks Mooring'
            });
          }

          const reefSamples = region.reefs.map(reef => {
            const chl = sampleGridCSV(sat.chlCSV, reef.coordinates[0], reef.coordinates[1]);
            const sst = sampleGridCSV(sat.sstCSV, reef.coordinates[0], reef.coordinates[1]);
            return {
              reefId: reef.id,
              reefName: reef.name,
              chlorophyll: round(chl?.value ?? null),
              chlorophyllUnit: chl?.varName ? 'mg/m³' : undefined,
              sst: round(kelvinToCelsius(sst?.value ?? null)),
              sstUnit: '°C'
            };
          });

          data = {
            timestamp: latestTimestamp,
            metrics,
            reefSamples,
            notes:
              'USGS canal gauges combined with the NOAA PMEL Cheeca Rocks mooring and CoastWatch satellite overlays.'
          };
        } else {
          data = null;
        }

        if (!cancelled) {
          setState({ data, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : 'Unable to load live data';
          const normalizedMessage = /Failed to fetch/i.test(message)
            ? 'Live feeds need the /api/erddap proxy to be running. Start the dev server (npm run dev) or deploy the proxy handler in production.'
            : message;
          setState({
            data: null,
            loading: false,
            error: normalizedMessage
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [regionKey, region.reefs]);

  return state;
}
