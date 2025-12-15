import { MetricCard } from './MetricCard';
import { TrendChart } from './TrendChart';
import { CoralHealthData, TrendData } from '../types/coral';
import { AlertCircle } from 'lucide-react';

interface TodayViewProps {
  data: CoralHealthData;
  trendData: TrendData;
  onMetricClick?: (metric: string) => void;
}

export function TodayView({ data, trendData, onMetricClick }: TodayViewProps) {
  const getHealthMessage = (score: number) => {
    if (score >= 80) return 'Excellent coral health conditions';
    if (score >= 65) return 'Moderate heat stress detected';
    if (score >= 50) return 'Elevated bleaching risk';
    return 'Critical bleaching alert';
  };

  const getBleachingAlertText = (level: number) => {
    const alerts = ['No Stress', 'Watch', 'Warning', 'Alert Level 1', 'Alert Level 2'];
    return alerts[level] || 'Unknown';
  };

  return (
    <div className="space-y-6">
      {/* Health Status Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <h2 className="text-gray-600 mb-2">Coral Health Outlook</h2>
            <p className="text-gray-800">
              {getHealthMessage(data.chi.score)}
            </p>
            <p className="text-gray-500 mt-2">
              Last updated: {new Date(data.lastUpdated).toLocaleString()}
            </p>
          </div>
          {data.chi.status !== 'good' && (
            <AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Primary Metric - CHI */}
      <MetricCard
        title="Coral Health Index"
        value={data.chi.score}
        unit="0-100"
        trend={data.chi.trend}
        status={data.chi.status}
        size="large"
        onClick={() => onMetricClick?.('chi')}
      />

      {/* Secondary Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          title="Sea Surface Temperature"
          value={data.sst.value}
          unit={data.sst.unit}
          trend={data.sst.trend}
          status={data.sst.status}
          onClick={() => onMetricClick?.('sst')}
        />
        <MetricCard
          title="Degree Heating Weeks"
          value={data.dhw.value}
          unit={data.dhw.unit}
          subtitle="Heat stress"
          trend={data.dhw.trend}
          status={data.dhw.status}
          onClick={() => onMetricClick?.('dhw')}
        />
        <MetricCard
          title="Bleaching Alert"
          value={data.bleachingAlert.level}
          unit={getBleachingAlertText(data.bleachingAlert.level)}
          trend={data.bleachingAlert.trend}
          status={data.bleachingAlert.status}
          onClick={() => onMetricClick?.('bleaching')}
        />
        <MetricCard
          title="Chlorophyll-a"
          value={data.chlorophyllA.value}
          unit={data.chlorophyllA.unit}
          trend={data.chlorophyllA.trend}
          status={data.chlorophyllA.status}
          onClick={() => onMetricClick?.('chlorophyll')}
        />
      </div>

      {/* Trend Chart */}
      <TrendChart trendData={trendData} />

      {/* Info Footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <p className="text-gray-600">
          <strong>About CHI:</strong> The Coral Health Index is a 0-100 score with penalties for heat stress (DHW), 
          high SST, bleaching alerts, and elevated chlorophyll-a levels. Higher scores indicate better coral conditions.
        </p>
        <p className="text-gray-500 mt-2">
          v0.2 - Mock data from the CoralCast prototype API
        </p>
      </div>
    </div>
  );
}
