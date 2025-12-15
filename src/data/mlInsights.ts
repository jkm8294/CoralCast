import { TimeSeriesPoint } from '../types/coral';

export type LagFinding = { feature: string; bestLagDays: number; correlation: number };
export type ConditionalFinding = { feature: string; eventMean: number; nonEventMean: number; delta: number };
export type FeatureImportance = { feature: string; score: number };

export interface DriverInsights {
  lags: LagFinding[];
  conditional: ConditionalFinding[];
  importance: FeatureImportance[];
}

type Series = TimeSeriesPoint[];

function toNumeric(series: Series): number[] {
  return series.map(p => p.value).filter(v => Number.isFinite(v));
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const xs = a.slice(0, n);
  const ys = b.slice(0, n);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

function shift(values: number[], lag: number): number[] {
  if (lag === 0) return values;
  if (lag > 0) {
    return values.slice(0, Math.max(0, values.length - lag));
  }
  const abs = Math.abs(lag);
  return Array(abs).fill(values[0] ?? 0).concat(values);
}

function buildTarget(temp: Series, chl: Series): number[] {
  const n = Math.max(temp.length, chl.length);
  const target: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = temp[i]?.value ?? temp[temp.length - 1]?.value ?? 0;
    const c = chl[i]?.value ?? chl[chl.length - 1]?.value ?? 0;
    const event = (t ?? 0) > 29 || (c ?? 0) > 0.35 ? 1 : 0;
    target.push(event);
  }
  return target;
}

export function computeDriverInsights(tempSeries: Series, chlSeries: Series): DriverInsights {
  const lagsToTest = [1, 3, 7, 14];
  const target = buildTarget(tempSeries, chlSeries);
  const tempVals = toNumeric(tempSeries);
  const chlVals = toNumeric(chlSeries);

  const lagCalc = (vals: number[], name: string): LagFinding => {
    let bestLag = 0;
    let bestCorr = 0;
    for (const lag of lagsToTest) {
      const shifted = shift(vals, lag);
      const corr = pearson(shifted, target);
      if (Math.abs(corr) > Math.abs(bestCorr)) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    return { feature: name, bestLagDays: bestLag, correlation: bestCorr };
  };

  const tempLag = lagCalc(tempVals, 'Sea Surface Temp');
  const chlLag = lagCalc(chlVals, 'Chlorophyll-a');

  const conditionalCalc = (vals: number[], name: string): ConditionalFinding => {
    const events = vals.filter((_, i) => target[i] === 1);
    const nonEvents = vals.filter((_, i) => target[i] === 0);
    const mean = (arr: number[]) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
    const eventMean = mean(events);
    const nonEventMean = mean(nonEvents);
    return { feature: name, eventMean, nonEventMean, delta: eventMean - nonEventMean };
  };

  const tempCond = conditionalCalc(tempVals, 'Sea Surface Temp');
  const chlCond = conditionalCalc(chlVals, 'Chlorophyll-a');

  const importance: FeatureImportance[] = [tempLag, chlLag].map(f => ({
    feature: f.feature,
    score: Math.round(Math.abs(f.correlation) * 100)
  }));

  return {
    lags: [tempLag, chlLag],
    conditional: [tempCond, chlCond],
    importance: importance.sort((a, b) => b.score - a.score)
  };
}
