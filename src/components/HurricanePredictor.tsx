import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Wind, Thermometer, Activity } from 'lucide-react';
import { Card } from './ui/card';
import { getAnnualHurricaneProjection } from '../data/trainingDataset';

interface HurricanePredictorProps {
  regionName: string;
  regionId: string;
  sst: number;
  chlorophyll?: number | null;
  activeStorm?: {
    name: string;
    distanceKm: number;
    maxWindKts: number | null;
    pressureMb: number | null;
    advisoryUrl?: string;
    updated?: string;
  } | null;
  onExportDataset?: () => void;
  drivers?: {
    lags: { feature: string; bestLagDays: number; correlation: number }[];
    conditional: { feature: string; eventMean: number; nonEventMean: number; delta: number }[];
    importance: { feature: string; score: number }[];
  };
  mlDrivers?: {
    drivers?: { feature: string; shap: number; direction: number }[];
    lagTests?: { feature: string; bestLagDays: number | null; pValue: number | null }[];
    metrics?: { auc?: number; f1?: number };
    band?: Array<{ year: number; mean: number; low: number; high: number }>;
  };
}

export function HurricanePredictor({
  regionName,
  regionId,
  sst,
  chlorophyll,
  activeStorm,
  onExportDataset,
  drivers,
  mlDrivers
}: HurricanePredictorProps) {
  const [annualProjection, setAnnualProjection] = useState<Array<{ year: number; risk: number }>>([]);
  const [mlBand, setMlBand] = useState<Array<{ year: number; mean: number; low: number; high: number }> | null>(null);
  const [loadingProjection, setLoadingProjection] = useState(true);
  const [hoverSeasonal, setHoverSeasonal] = useState<{ label: string; value: number; x: number; y: number } | null>(null);
  const [hoverAnnual, setHoverAnnual] = useState<{ label: string; value: number; x: number; y: number } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const CONFIDENCE_BAND = 8; // +/- band for simple uncertainty display

  // Use the ML band directly if present; otherwise fallback projection
  useEffect(() => {
    if (mlDrivers?.band?.length) {
      setMlBand(mlDrivers.band);
    }
  }, [mlDrivers]);

  useEffect(() => {
    let mounted = true;
    setLoadingProjection(true);
    getAnnualHurricaneProjection(1980, 10)
      .then(series => {
        if (mounted) setAnnualProjection(series.slice(-30)); // last 20 yrs + 10yr outlook
      })
      .catch(() => {
        if (mounted) setAnnualProjection([]);
      })
      .finally(() => {
        if (mounted) setLoadingProjection(false);
      });
    return () => {
      mounted = false;
    };
  }, [regionId]);
  // Simple hurricane risk calculation based on SST
  // Hurricane formation typically requires SST > 26.5°C
  const getHurricaneRisk = (temp: number) => {
    if (temp >= 28.5) return { level: 'high', color: 'red', percentage: 75 };
    if (temp >= 27.5) return { level: 'moderate', color: 'orange', percentage: 45 };
    if (temp >= 26.5) return { level: 'low', color: 'yellow', percentage: 20 };
    return { level: 'minimal', color: 'green', percentage: 5 };
  };

  const risk = getHurricaneRisk(sst);
  const chlValue = chlorophyll ?? 0;

  const baselineSeasonality = [5, 5, 8, 15, 35, 55, 75, 70, 50, 20, 10, 6]; // Jan..Dec %
  const seasonalRisk = baselineSeasonality.map(value => {
    const boost = sst >= 28 ? 10 : sst >= 27 ? 5 : 0;
    return Math.min(90, value + boost);
  });
  const seasonalSeries = useMemo(
    () =>
      seasonalRisk.map((value, idx) => ({
        month: new Date(0, idx).toLocaleString('en', { month: 'short' }),
        value
      })),
    [seasonalRisk]
  );

  const fallbackSeasonal = useMemo(
    () =>
      Array.from({ length: 12 }, (_, idx) => ({
        month: new Date(0, idx).toLocaleString('en', { month: 'short' }),
        value: 40
      })),
    []
  );

  const displayAnnual = useMemo(() => {
    const source = mlBand && mlBand.length ? mlBand : annualProjection.map(row => ({ year: row.year, mean: row.risk, low: Math.max(0, row.risk - CONFIDENCE_BAND), high: Math.min(100, row.risk + CONFIDENCE_BAND) }));
    if (!source.length) return [];
    const byYear = new Map<number, { mean: number; low: number; high: number }>();
    for (const row of source) byYear.set(row.year, { mean: row.mean ?? row.low ?? row.high ?? 50, low: row.low ?? row.mean ?? 40, high: row.high ?? row.mean ?? 60 });
    let lastYear = Math.max(...byYear.keys());
    let last = byYear.get(lastYear) ?? { mean: 50, low: 42, high: 58 };
    if (lastYear < currentYear) {
      for (let y = lastYear + 1; y <= currentYear; y++) {
        byYear.set(y, last);
      }
      lastYear = currentYear;
    }
    const targetLast = currentYear + 10;
    for (let y = lastYear + 1; y <= targetLast; y++) {
      byYear.set(y, last);
    }
    return Array.from(byYear.entries())
      .map(([year, band]) => ({ year, risk: band.mean, low: band.low, high: band.high }))
      .sort((a, b) => a.year - b.year);
  }, [annualProjection, mlBand, currentYear]);

  const riskColors = {
    red: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      bar: 'bg-red-500'
    },
    orange: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-700',
      bar: 'bg-orange-500'
    },
    yellow: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      bar: 'bg-yellow-500'
    },
    green: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      bar: 'bg-green-500'
    }
  };

  const colors = riskColors[risk.color];

  // Post-hurricane recovery prediction
  const recoveryTime = sst >= 29 ? '12-18 months' : sst >= 27.5 ? '8-12 months' : '4-8 months';
  const bleachingRecovery = chlValue > 0.35 ? 'Slower due to algae competition' : 'Normal recovery expected';
  const now = new Date();
  const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });
  const isPeakSeason = now.getUTCMonth() >= 7 && now.getUTCMonth() <= 9;
  const currentMonthLabel = isPeakSeason ? `${currentMonth} (Peak Season)` : currentMonth;


  const localSummary = useMemo(() => {
    const seasonal = seasonalSeries.length ? seasonalSeries : fallbackSeasonal;
    const maxSeason = seasonal.reduce((a, b) => (b.value > a.value ? b : a), seasonal[0]);
    const meanSeason =
      seasonal.reduce((sum, p) => sum + p.value, 0) / Math.max(1, seasonal.length);

    const annual = displayAnnual;
    const nextDecade = annual.filter(p => p.year >= currentYear);
    const futureAvg =
      nextDecade.reduce((sum, p) => sum + p.risk, 0) / Math.max(1, nextDecade.length || 1);

    const driversText = mlDrivers?.drivers?.length
      ? mlDrivers.drivers
          .slice(0, 3)
          .map(d => `${d.feature} (${d.direction >= 0 ? 'up' : 'down'})`)
          .join(', ')
      : drivers?.importance?.slice(0, 2).map(d => d.feature).join(', ');

    return [
      `Right now the ocean looks ${risk.level} for storm formation—about ${risk.percentage}% risk. The biggest bump is in ${maxSeason.month} (around ${maxSeason.value.toFixed(0)}%).`,
      `On average through the year we sit near ${meanSeason.toFixed(0)}%. Peak season is still late summer (Aug–Oct), nudged a bit by today’s SST of ${sst.toFixed(1)}°C.`,
      `Looking out over the next decade, the risk line hovers near ${futureAvg ? futureAvg.toFixed(0) : '—'}% with roughly ±${CONFIDENCE_BAND}% wiggle room. That’s a situational guide—always check NHC/official outlooks for real decisions.`,
      driversText ? `What seems to move the needle most here: ${driversText}.` : 'We don’t have ML driver rankings yet, so this is a simple heuristic read.',
      `Bottom line: use this as a quick read; follow official advisories for actions.`
    ].join('\n');
  }, [seasonalSeries, fallbackSeasonal, displayAnnual, currentYear, mlDrivers, drivers, risk, sst, CONFIDENCE_BAND]);

  async function handleAiExplain() {
    setAiLoading(true);
    setAiError(null);
    try {
      const payload = {
        regionName,
        seasonal: seasonalSeries.length ? seasonalSeries : fallbackSeasonal,
        annual: displayAnnual,
        drivers: mlDrivers ?? drivers
      };
      const resp = await fetch('/api/ai-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        let detail = '';
        try {
          const errJson = await resp.json();
          detail = errJson?.error ? `: ${errJson.error}` : '';
        } catch {
          /* ignore */
        }
        throw new Error(`AI request failed (${resp.status}${detail})`);
      }
      const json = await resp.json();
      setAiSummary(json.text ?? 'No AI response');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI request failed';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-gray-900 mb-2">Hurricane Risk Assessment</h2>
        <div className="flex items-center gap-3">
          <p className="text-gray-600">Environmental conditions analysis for {regionName}</p>
          {onExportDataset && (
            <button
              type="button"
              onClick={onExportDataset}
              className="text-sm text-blue-700 underline hover:text-blue-900"
            >
              Download training CSV
            </button>
          )}
        </div>
      </div>

      {/* Risk Level Card */}
      <div className={`border rounded-2xl p-6 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-gray-600 mb-2">Hurricane Formation Risk</p>
            <div className="flex items-baseline gap-3">
              <span className={`text-5xl ${colors.text}`}>
                {risk.percentage}%
              </span>
              <span className="text-gray-500">{risk.level.toUpperCase()}</span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${colors.bg}`}>
            <Wind className={`w-8 h-8 ${colors.text}`} />
          </div>
        </div>
        
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
          <div 
            className={`h-full ${colors.bar} transition-all duration-500`}
            style={{ width: `${risk.percentage}%` }}
          />
        </div>

        <p className="text-gray-700">
          {risk.level === 'high' && 'Ocean temperatures are highly conducive to tropical cyclone formation. Monitor closely during hurricane season.'}
          {risk.level === 'moderate' && 'Conditions support hurricane development. Seasonal monitoring recommended.'}
          {risk.level === 'low' && 'Current conditions present low risk for hurricane formation.'}
          {risk.level === 'minimal' && 'Ocean temperatures are below typical hurricane formation thresholds.'}
        </p>
      </div>

      {activeStorm && (
        <Card className="border-l-4 border-l-orange-500 p-4 bg-orange-50">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-orange-700 font-semibold">Nearest Active Storm</p>
              <p className="text-lg text-gray-900 font-semibold">{activeStorm.name}</p>
              <p className="text-gray-700">
                {activeStorm.distanceKm.toFixed(0)} km away
                {activeStorm.maxWindKts ? ` · ${activeStorm.maxWindKts} kt max wind` : ''}
                {activeStorm.pressureMb ? ` · ${activeStorm.pressureMb} mb` : ''}
              </p>
              {activeStorm.updated && (
                <p className="text-xs text-gray-500">Updated {new Date(activeStorm.updated).toLocaleString()}</p>
              )}
              {activeStorm.advisoryUrl && (
                <a
                  className="text-sm text-orange-700 underline"
                  href={activeStorm.advisoryUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open latest NHC advisory
                </a>
              )}
            </div>
            <Wind className="w-5 h-5 text-orange-600 mt-1" />
          </div>
        </Card>
      )}

      <Card className="p-4 border border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm text-gray-600">Next 12 months</p>
            <p className="text-gray-900 font-semibold">Seasonal Hurricane Probability</p>
          </div>
          <span className="text-xs text-gray-500">Heuristic: seasonality + current SST</span>
        </div>
        <div className="h-32 w-full relative">
          {hoverSeasonal && (
            <div
              className="absolute pointer-events-none text-xs px-2 py-1 bg-white/90 border border-gray-200 rounded shadow-sm"
              style={{
                left: `${(hoverSeasonal.x / 110) * 100}%`,
                top: `${(hoverSeasonal.y / 50) * 100}%`,
                transform: 'translate(-50%, -120%)'
              }}
            >
              <div className="font-semibold text-gray-800">{hoverSeasonal.label}</div>
              <div className="text-gray-700">{hoverSeasonal.value.toFixed(0)}%</div>
            </div>
          )}
          <svg
            viewBox="0 0 110 50"
            preserveAspectRatio="none"
            className="w-full h-full"
            onMouseLeave={() => setHoverSeasonal(null)}
            onMouseMove={e => {
              const data = seasonalSeries.length ? seasonalSeries : fallbackSeasonal;
              if (!data.length) return;
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * 110;
              let nearest = data[0];
              let nearestX = 14;
              let nearestY = 40 - (nearest.value / 100) * 32;
              data.forEach((p, i, arr) => {
                const x = 14 + (i / (arr.length - 1 || 1)) * 91;
                if (Math.abs(x - relX) < Math.abs(nearestX - relX)) {
                  nearest = p;
                  nearestX = x;
                  nearestY = 40 - (p.value / 100) * 32;
                }
              });
              setHoverSeasonal({ label: nearest.month, value: nearest.value, x: nearestX, y: nearestY });
            }}
          >
            <g stroke="#e5e7eb" strokeWidth="0.2">
              <line x1="14" y1="6" x2="14" y2="40" />
              <line x1="14" y1="40" x2="105" y2="40" />
              <line x1="14" y1="18" x2="105" y2="18" />
              <line x1="14" y1="29" x2="105" y2="29" />
            </g>
            <text x="8" y="11" fontSize="1.6" fill="#6b7280">100%</text>
            <text x="8" y="34" fontSize="1.6" fill="#6b7280">50%</text>
            <text x="8" y="49" fontSize="1.6" fill="#6b7280">0%</text>
            {(seasonalSeries.length ? seasonalSeries : fallbackSeasonal).map((point, idx, arr) => {
              const x = 14 + (idx / (arr.length - 1 || 1)) * 91;
              const y = 40 - (point.value / 100) * 32;
              return (
                <circle
                  key={point.month}
                  cx={x}
                  cy={y}
                  r="0.6"
                  fill="#ea580c"
                  stroke="none"
                  onMouseEnter={() => setHoverSeasonal({ label: point.month, value: point.value, x, y })}
                />
              );
            })}
            <polyline
              fill="none"
              stroke="#ea580c"
              strokeWidth="0.4"
              points={(seasonalSeries.length ? seasonalSeries : fallbackSeasonal)
                .map((p, i, arr) => {
                  const x = 14 + (i / (arr.length - 1 || 1)) * 91;
                  const y = 40 - (p.value / 100) * 32;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            {(seasonalSeries.length ? seasonalSeries : fallbackSeasonal).map((p, i, arr) => {
              if (i % 2 !== 0) return null;
              const x = 14 + (i / (arr.length - 1 || 1)) * 91;
              return (
                <text key={`label-${p.month}`} x={x} y="44" fontSize="1.6" fill="#6b7280" textAnchor="middle">
                  {p.month}
                </text>
              );
            })}
            <text x="58" y="6" fontSize="2.2" fill="#6b7280" textAnchor="middle">
              Month (Jan–Dec)
            </text>
            <text transform="translate(4 27) rotate(-90)" fontSize="2.2" fill="#6b7280" textAnchor="middle">
              Probability (%)
            </text>
          </svg>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Peaks align with climatology (Aug–Oct) and are nudged by present SST. Use official NHC forecasts for operational decisions.
        </p>
      </Card>

      <Card className="p-4 border border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm text-gray-600">Next decade outlook</p>
            <p className="text-gray-900 font-semibold">Annual Hurricane Probability</p>
          </div>
          <span className="text-xs text-gray-500">Historical IBTrACS + trend projection</span>
        </div>
        {loadingProjection ? (
          <p className="text-sm text-gray-600">Loading projection...</p>
        ) : annualProjection.length ? (
          <>
        <div className="h-40 w-full relative">
          {hoverAnnual && (
            <div
              className="absolute pointer-events-none text-xs px-2 py-1 bg-white/90 border border-gray-200 rounded shadow-sm"
              style={{
                left: `${(hoverAnnual.x / 110) * 100}%`,
                top: `${(hoverAnnual.y / 50) * 100}%`,
                transform: 'translate(-50%, -120%)'
              }}
            >
              <div className="font-semibold text-gray-800">{hoverAnnual.label}</div>
              <div className="text-gray-700">{hoverAnnual.value.toFixed(0)}%</div>
            </div>
          )}
          <svg
            viewBox="0 0 110 50"
            preserveAspectRatio="none"
            className="w-full h-full"
            onMouseLeave={() => setHoverAnnual(null)}
            onMouseMove={e => {
              if (!displayAnnual.length) return;
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * 110;
              let nearest = displayAnnual[0];
              let nearestX = 12;
              let nearestY = 45 - (nearest.risk / 100) * 37;
              displayAnnual.forEach((p, i, arr) => {
                const x = 12 + (i / Math.max(1, arr.length - 1)) * 93;
                if (Math.abs(x - relX) < Math.abs(nearestX - relX)) {
                  nearest = p;
                  nearestX = x;
                  nearestY = 45 - (p.risk / 100) * 37;
                }
              });
              setHoverAnnual({ label: String(nearest.year), value: nearest.risk, x: nearestX, y: nearestY });
            }}
          >
            <g stroke="#e5e7eb" strokeWidth="0.2">
              <line x1="12" y1="8" x2="12" y2="45" />
              <line x1="12" y1="45" x2="105" y2="45" />
              <line x1="12" y1="18" x2="105" y2="18" />
              <line x1="12" y1="30" x2="105" y2="30" />
            </g>
            <text x="7" y="10" fontSize="1.8" fill="#6b7280">100%</text>
            <text x="7" y="32" fontSize="1.8" fill="#6b7280">50%</text>
            <text x="7" y="48" fontSize="1.8" fill="#6b7280">0%</text>
            {displayAnnual.map((point, idx) => {
              const x = 12 + (idx / Math.max(1, displayAnnual.length - 1)) * 93;
              const y = 45 - (point.risk / 100) * 37;
              const isFuture = point.year > currentYear;
              return (
                <circle
                  key={point.year}
                  cx={x}
                  cy={y}
                  r="0.7"
                  fill={isFuture ? "#f97316" : "#2563eb"}
                  stroke="none"
                  onMouseEnter={() => setHoverAnnual({ label: String(point.year), value: point.risk, x, y })}
                  onMouseLeave={() => setHoverAnnual(null)}
                />
              );
            })}
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="0.45"
              style={{ pointerEvents: 'none' }}
              points={displayAnnual
                .map((p, i, arr) => {
                  const x = 12 + (i / Math.max(1, arr.length - 1)) * 93;
                  const y = 45 - (p.risk / 100) * 37;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
            <polygon
              fill="#2563eb"
              fillOpacity="0.06"
              stroke="none"
              style={{ pointerEvents: 'none' }}
              points={
                displayAnnual
                  .map((p, i, arr) => {
                    const x = 12 + (i / Math.max(1, arr.length - 1)) * 93;
                    const yHigh = 45 - ((p.high ?? Math.min(100, p.risk + CONFIDENCE_BAND)) / 100) * 37;
                    return `${x},${yHigh}`;
                  })
                  .join(' ') +
                ' ' +
                displayAnnual
                  .slice()
                  .reverse()
                  .map((p, idx) => {
                    const i = displayAnnual.length - 1 - idx;
                    const x = 12 + (i / Math.max(1, displayAnnual.length - 1)) * 93;
                    const yLow = 45 - ((p.low ?? Math.max(0, p.risk - CONFIDENCE_BAND)) / 100) * 37;
                    return `${x},${yLow}`;
                  })
                  .join(' ')
              }
            />
            {displayAnnual.map((p, i, arr) => {
              const show = i % 3 === 0 || i === 0 || i === arr.length - 1;
              if (!show) return null;
              const x = 12 + (i / Math.max(1, arr.length - 1)) * 93;
              return (
                <text key={`label-${p.year}`} x={x} y="49" fontSize="1.6" fill="#6b7280" textAnchor="middle">
                  {p.year}
                </text>
              );
            })}
            <text x="58" y="5" fontSize="2.2" fill="#6b7280" textAnchor="middle">
              Year (history + forecast)
            </text>
            <text transform="translate(3 27) rotate(-90)" fontSize="2.2" fill="#6b7280" textAnchor="middle">
              Probability (%)
            </text>
          </svg>
        </div>
            <p className="text-xs text-gray-600 mt-2">
              Projection is a heuristic based on the past ~30 years of Atlantic tracks. Counts are scaled to a 0–100 risk score; check NHC and seasonal outlooks for operational decisions.
            </p>
          </>
        ) : (
          <>
            <div className="h-40 w-full flex items-center justify-center text-gray-600 text-sm">
              Using fallback projection while tracks load.
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 border border-blue-200 bg-blue-50/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <p className="text-xs text-blue-700">AI assist</p>
            <p className="text-gray-900 font-semibold">Gemini summary of these charts</p>
            <p className="text-xs text-gray-600">Uses your seasonal + decade curves and drivers to give a 4–6 bullet recap.</p>
          </div>
          <button
            type="button"
            onClick={handleAiExplain}
            disabled={aiLoading}
            className="self-start sm:self-auto px-3 py-2 text-sm rounded-md text-white disabled:opacity-50 shadow-sm border"
            style={{
              backgroundColor: '#f97316', // coral/orange
              borderColor: '#fb923c',
              color: '#fff'
            }}
          >
            {aiLoading ? 'Asking Gemini…' : 'Ask Gemini'}
          </button>
        </div>
        {aiError && <p className="text-sm text-red-600 mb-2">{aiError}</p>}
        {aiSummary ? (
          <div className="text-sm text-gray-800 whitespace-pre-line leading-relaxed border border-white/80 bg-white/70 rounded-md p-3">
            {aiSummary}
          </div>
        ) : (
          <div className="text-sm text-gray-700">
            Click “Ask Gemini” to generate a summary of the charts and drivers.
          </div>
        )}
      </Card>

      {(mlDrivers || drivers) && (
        <details className="border border-gray-200 rounded-2xl bg-white">
          <summary className="cursor-pointer select-none p-4 text-gray-900 font-semibold flex items-center justify-between">
            <span>Drivers & lags</span>
            <span className="text-xs text-gray-500">{mlDrivers ? 'ML-informed (XGBoost + Granger)' : 'Heuristic correlations'}</span>
          </summary>
          <div className="p-4 pt-0">
            {mlDrivers ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Top SHAP drivers</p>
                    <div className="space-y-1">
                      {(mlDrivers.drivers ?? []).map(item => (
                        <div key={item.feature} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.feature}</span>
                          <span className="text-gray-900">
                            {item.shap.toFixed(2)} {item.direction >= 0 ? '↑' : '↓'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Lag causality (Granger)</p>
                    <div className="space-y-1">
                      {(mlDrivers.lagTests ?? []).map(item => (
                        <div key={item.feature} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.feature}</span>
                          <span className="text-gray-900">
                            lag {item.bestLagDays ?? 0}d · p={item.pValue?.toFixed(3) ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {mlDrivers.metrics && (
                  <div className="flex gap-2 flex-wrap text-xs text-gray-700">
                    {mlDrivers.metrics.auc && <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded-full">AUC {mlDrivers.metrics.auc.toFixed(2)}</span>}
                    {mlDrivers.metrics.f1 && <span className="px-2 py-1 bg-blue-50 text-blue-800 rounded-full">F1 {mlDrivers.metrics.f1.toFixed(2)}</span>}
                  </div>
                )}
              </div>
            ) : (
              drivers && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Best lag correlations</p>
                      <div className="space-y-1">
                        {drivers.lags.map(item => (
                          <div key={item.feature} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.feature}</span>
                            <span className="text-gray-900">
                              lag {item.bestLagDays}d · {item.correlation.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Conditional differences (event vs non-event)</p>
                      <div className="space-y-1">
                        {drivers.conditional.map(item => (
                          <div key={item.feature} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.feature}</span>
                            <span className="text-gray-900">
                              Δ {item.delta.toFixed(2)} (event {item.eventMean.toFixed(2)} / none {item.nonEventMean.toFixed(2)})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Feature importance (proxy)</p>
                    <div className="flex gap-2 flex-wrap">
                      {drivers.importance.map(item => (
                        <span key={item.feature} className="px-2 py-1 bg-blue-50 text-blue-800 text-xs rounded-full">
                          {item.feature}: {item.score}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )
            )}
          </div>
        </details>
      )}

      {/* Contributing Factors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-2xl p-5 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <Thermometer className="w-5 h-5 text-red-500" />
            <h3 className="text-gray-900">Sea Surface Temperature</h3>
          </div>
          <p className="text-3xl mb-2">{sst.toFixed(1)}°C</p>
          <p className="text-gray-600">
            {sst >= 26.5 ? 'Above hurricane formation threshold (26.5°C)' : 'Below hurricane formation threshold'}
          </p>
        </div>

        <div className="border border-gray-200 rounded-2xl p-5 bg-white">
          <div className="flex items-center gap-3 mb-3">
            <Activity className="w-5 h-5 text-blue-500" />
            <h3 className="text-gray-900">Ocean Heat Content</h3>
          </div>
          <p className="text-3xl mb-2">
            {sst >= 28 ? 'High' : sst >= 27 ? 'Moderate' : 'Low'}
          </p>
          <p className="text-gray-600">
            Available energy for storm intensification
          </p>
        </div>
      </div>

      {/* Hurricane Season Timeline */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white">
        <h3 className="text-gray-900 mb-4">Atlantic Hurricane Season</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Peak Season</span>
            <span className="text-gray-900">August - October</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Official Season</span>
            <span className="text-gray-900">June 1 - November 30</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-700">Current Month</span>
            <span className="text-gray-900">{currentMonthLabel}</span>
          </div>
        </div>
      </div>

      {/* Post-Hurricane Impact Prediction */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white">
        <h3 className="text-gray-900 mb-4">Post-Hurricane Coral Recovery Forecast</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Expected Recovery Time</span>
              <span className="text-gray-900">{recoveryTime}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: '35%' }} />
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-gray-700">
              <strong>Recovery Factors:</strong> {bleachingRecovery}. High SST levels may slow natural recovery processes. 
              Storm surge and wave action can damage already stressed coral structures.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Physical Damage Risk</p>
              <p className="text-gray-900">{sst >= 29 ? 'High' : 'Moderate'}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-1">Sedimentation Risk</p>
              <p className="text-gray-900">{chlValue > 0.35 ? 'High' : 'Low'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="border border-orange-200 rounded-2xl p-5 bg-orange-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-gray-900 mb-2">Model Limitations</h3>
            <p className="text-gray-700">
              This is a simplified prediction based on SST and ocean conditions. Actual hurricane formation depends on many factors 
              including atmospheric conditions, wind shear, moisture, and pressure systems. For official forecasts, consult NOAA 
              National Hurricane Center.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
