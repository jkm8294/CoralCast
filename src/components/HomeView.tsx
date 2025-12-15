import { MapView } from './MapView';
import { MetricCard } from './MetricCard';
import { CoralHealthData, Region, TrendData } from '../types/coral';
import { LiveRegionSummary } from '../hooks/useLiveRegionData';
import { ArrowRight } from 'lucide-react';
import { TrendChart } from './TrendChart';

interface HomeViewProps {
  region: Region;
  data?: CoralHealthData | null;
  dataLoading?: boolean;
  trendData?: TrendData | null;
  onMetricClick: (metric: ViewType) => void;
  liveData?: LiveRegionSummary | null;
  liveLoading?: boolean;
  liveError?: string | null;
}

type ViewType = 'home' | 'temperature' | 'chlorophyll' | 'hurricane';

export function HomeView({
  region,
  data,
  dataLoading,
  trendData,
  onMetricClick,
  liveData,
  liveLoading,
  liveError
}: HomeViewProps) {
  const getHealthMessage = (score: number) => {
    if (score >= 80) return 'Excellent coral health conditions';
    if (score >= 65) return 'Moderate heat stress detected';
    if (score >= 50) return 'Elevated bleaching risk';
    return 'Critical bleaching alert';
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Pending';
    return new Date(timestamp).toLocaleString();
  };

  const chiScore = data?.chi.score ?? null;
  const chiMessage = chiScore != null ? getHealthMessage(chiScore) : dataLoading ? 'Loading real metrics…' : 'Waiting for live feeds...';
  const lastUpdated = data?.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Pending';

  const renderLiveValue = (value: number | null | undefined, unit: string) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    const formatted = value.toLocaleString(undefined, {
      maximumFractionDigits: Math.abs(value) >= 10 ? 1 : 2
    });
    return `${formatted}${unit ? ` ${unit}` : ''}`.trim();
  };

  const bleachingUnit =
    data?.bleachingAlert != null
      ? data.bleachingAlert.level === 0
        ? 'No Stress'
        : `Alert ${data.bleachingAlert.level}`
      : '';

  return (
    <div className="space-y-6">
      {/* CHI Score Card */}
      <div
        className="border rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200 cursor-pointer hover:shadow-lg transition-all"
        onClick={() => onMetricClick('temperature')}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-600 mb-1">Coral Health Index</p>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl">{chiScore != null ? chiScore : '—'}</span>
              <span className="text-gray-500">/ 100</span>
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-gray-700">{chiMessage}</p>
        <p className="text-gray-500 mt-2">
          Last updated: {lastUpdated}
        </p>
      </div>

      {/* Live Data Card */}
      {(liveLoading || liveError || (liveData && liveData.metrics.length)) && (
        <div className="border border-gray-200 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-gray-900 mb-1">Live Observations</h3>
              <p className="text-sm text-gray-500">
                {liveLoading
                  ? 'Fetching latest data streams...'
                  : liveError
                  ? 'Live feeds temporarily unavailable.'
                  : liveData?.notes}
              </p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Updated</p>
              <p className="font-medium text-gray-700">{formatTimestamp(liveData?.timestamp)}</p>
            </div>
          </div>

          {liveError && (
            <p className="mt-4 text-sm text-rose-600">
              {liveError}
            </p>
          )}

          {liveData && liveData.metrics.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
              {liveData.metrics.map(metric => (
                <div
                  key={metric.id}
                  className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                >
                  <p className="text-sm text-gray-500">{metric.label}</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">
                    {renderLiveValue(metric.value, metric.unit)}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">{metric.source}</p>
                </div>
              ))}
            </div>
          )}

          {liveData?.reefSamples?.length ? (
            <div className="mt-6">
              <h4 className="text-sm text-gray-600 mb-2">Satellite Sampling (last swath)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {liveData.reefSamples.map(sample => (
                  <div
                    key={sample.reefId}
                    className="border border-gray-200 rounded-xl p-4 bg-white"
                  >
                    <p className="text-sm font-semibold text-gray-900">{sample.reefName}</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-600">
                      <div className="flex items-center justify-between">
                        <span>Chlorophyll</span>
                        <span className="font-medium text-gray-800">
                          {renderLiveValue(sample.chlorophyll ?? null, sample.chlorophyllUnit ?? '')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>SST</span>
                        <span className="font-medium text-gray-800">
                          {renderLiveValue(sample.sst ?? null, sample.sstUnit ?? '')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
      </div>
      )}

      {/* Map Section */}
      <div>
        <h3 className="text-gray-900 mb-3">Reef Coverage Map</h3>
        <MapView region={region} healthScore={data?.chi.score ?? null} />
      </div>

      <TrendChart trendData={trendData} />

      {/* Metric Cards Grid */}
      <div>
        <h3 className="text-gray-900 mb-3">Key Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            title="Temperature (SST)"
            value={data?.sst.value ?? null}
            unit={data?.sst.unit ?? '°C'}
            subtitle="Sea surface temp"
            trend={data?.sst.trend}
            status={data?.sst.status}
            onClick={() => onMetricClick('temperature')}
          />
          <MetricCard
            title="Chlorophyll-a"
            value={data?.chlorophyllA.value ?? null}
            unit={data?.chlorophyllA.unit ?? 'mg/m³'}
            subtitle="Algae levels"
            trend={data?.chlorophyllA.trend}
            status={data?.chlorophyllA.status}
            onClick={() => onMetricClick('chlorophyll')}
          />
        </div>
      </div>

      {/* Additional Metrics */}
      <div>
        <h3 className="text-gray-900 mb-3">Heat Stress Indicators</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            title="Degree Heating Weeks"
            value={data?.dhw.value ?? null}
            unit={data?.dhw.unit ?? '°C-weeks'}
            subtitle="Cumulative heat stress"
            trend={data?.dhw.trend}
            status={data?.dhw.status}
          />
          <MetricCard
            title="Bleaching Alert Level"
            value={data?.bleachingAlert.level ?? null}
            unit={bleachingUnit}
            subtitle="NOAA CRW status"
            trend={data?.bleachingAlert.trend}
            status={data?.bleachingAlert.status}
          />
        </div>
      </div>
    </div>
  );
}
