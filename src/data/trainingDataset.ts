import { Region } from '../types/coral';
import { getIbtracsNorthAtlantic, type StormTrack } from './liveOceanData';

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

function toCsv(tracks: StormTrack[], region: Region): string {
  const header = [
    'region_id',
    'region_name',
    'storm_id',
    'storm_name',
    'year',
    'basin',
    'timestamp',
    'lat',
    'lon',
    'distance_km',
    'wind_kts',
    'pressure_mb'
  ];
  const rows: string[] = [header.join(',')];
  for (const track of tracks) {
    for (const point of track.points) {
      const distanceKm = haversineKm(region.centroid, [point.lat, point.lon]).toFixed(2);
      rows.push(
        [
          region.id,
          region.name,
          track.id,
          track.name,
          track.year,
          track.basin,
          point.t,
          point.lat,
          point.lon,
          distanceKm,
          point.windKts ?? '',
          point.pressureMb ?? ''
        ].join(',')
      );
    }
  }
  return rows.join('\n');
}

export async function buildStormTrainingCsv(region: Region, sinceYear = 2000): Promise<string> {
  const tracks = await getIbtracsNorthAtlantic(sinceYear);
  return toCsv(tracks, region);
}

export async function downloadStormTrainingCsv(region: Region, sinceYear = 2000): Promise<void> {
  const csv = await buildStormTrainingCsv(region, sinceYear);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `storm_training_${region.id}_${sinceYear}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type AnnualRiskPoint = { year: number; risk: number };

const HURDAT_URL = 'https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2024-040425.txt';
const viaProxy = (url: string) => `/api/erddap?url=${encodeURIComponent(url)}`;

function parseLatLon(raw: string): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^([\d.]+)\s*([NSEW])$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const dir = match[2].toUpperCase();
  if (dir === 'S' || dir === 'W') return -value;
  return value;
}

export async function getHurdatTracks(sinceYear = 1980): Promise<StormTrack[]> {
  try {
    const res = await fetch(viaProxy(HURDAT_URL));
    if (!res.ok) throw new Error(`HURDAT fetch failed ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const tracks: StormTrack[] = [];
    for (let i = 0; i < lines.length; i++) {
      const header = lines[i];
      const headerParts = header.split(',');
      if (headerParts.length < 3) continue;
      const id = headerParts[0].trim();
      const name = headerParts[1]?.trim() || 'Unnamed';
      const count = Number(headerParts[2]);
      if (!Number.isFinite(count)) continue;
      const points = [];
      for (let j = 1; j <= count && i + j < lines.length; j++) {
        const row = lines[i + j].split(',').map(s => s.trim());
        const dateStr = row[0];
        const timeStr = row[1];
        const lat = parseLatLon(row[4]);
        const lon = parseLatLon(row[5]);
        const windKts = row[6] ? Number(row[6]) : null;
        const pressureMb = row[7] ? Number(row[7]) : null;
        const iso = dateStr && timeStr ? `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:00Z` : '';
        const year = Number(dateStr?.slice(0, 4));
        if (!Number.isFinite(year) || year < sinceYear) continue;
        if (lat == null || lon == null) continue;
        points.push({ t: iso, lat, lon, windKts, pressureMb });
      }
      if (points.length) {
        tracks.push({
          id,
          name,
          year: Number(points[0].t.slice(0, 4)),
          basin: 'NA',
          points: points.sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())
        });
      }
      i += count;
    }
    return tracks;
  } catch (error) {
    console.warn('Failed to parse HURDAT2', error);
    return [];
  }
}

export async function getAnnualHurricaneProjection(
  sinceYear = 1980,
  horizonYears = 10
): Promise<AnnualRiskPoint[]> {
  let tracks: StormTrack[] = [];
  try {
    tracks = await getIbtracsNorthAtlantic(sinceYear);
    if (!tracks.length) {
      const hurdat = await getHurdatTracks(sinceYear);
      tracks = hurdat;
    }
  } catch (error) {
    console.warn('Track fetch failed, falling back to synthetic projection', error);
  }

  if (!tracks.length) {
    const currentYear = new Date().getFullYear();
    const synthetic: AnnualRiskPoint[] = [];
    for (let i = -10; i <= horizonYears; i++) {
      const year = currentYear + i;
      const base = 40 + Math.max(0, i) * 2; // slight upward trend
      synthetic.push({ year, risk: Math.min(90, Math.max(15, base)) });
    }
    return synthetic;
  }

  const counts: Record<number, number> = {};
  for (const track of tracks) {
    counts[track.year] = (counts[track.year] ?? 0) + 1;
  }
  const years = Object.keys(counts)
    .map(Number)
    .filter(year => Number.isFinite(year))
    .sort((a, b) => a - b);
  if (!years.length) return [];

  const recentYears = years.filter(y => y >= Math.max(sinceYear, new Date().getFullYear() - 30));
  const seriesYears = recentYears.length ? recentYears : years;
  const maxCount = Math.max(...seriesYears.map(y => counts[y]));
  const riskFromCount = (count: number) => Math.min(100, Math.max(5, (count / maxCount) * 100));

  // Simple linear regression on recent 20 years of counts to project trend
  const regressionYears = seriesYears.slice(-20);
  const xs = regressionYears;
  const ys = regressionYears.map(y => counts[y]);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const past: AnnualRiskPoint[] = seriesYears.map(year => ({
    year,
    risk: riskFromCount(counts[year])
  }));

  const lastYear = seriesYears[seriesYears.length - 1];
  const future: AnnualRiskPoint[] = [];
  for (let i = 1; i <= horizonYears; i++) {
    const year = lastYear + i;
    const projectedCount = Math.max(0, intercept + slope * year);
    future.push({
      year,
      risk: riskFromCount(projectedCount)
    });
  }

  return [...past, ...future];
}
