import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { Button } from './ui/button';
import { DetailMetric, DetailHistoricalPoint } from '../types/detail';

interface DetailViewProps {
  title: string;
  metric: DetailMetric;
  historicalData: DetailHistoricalPoint[];
  onBack: () => void;
}

export function DetailView({ title, metric, historicalData, onBack }: DetailViewProps) {
  const statusConfig = {
    good: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      icon: TrendingUp
    },
    warning: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-700',
      icon: AlertTriangle
    },
    alert: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      icon: AlertTriangle
    }
  };

  const config = statusConfig[metric.status];
  const StatusIcon = config.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <h2 className="text-gray-900">{title}</h2>
      </div>

      {/* Current Status Card */}
      <div className={`border rounded-2xl p-6 ${config.bg} ${config.border}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-gray-600 mb-2">Current Reading</p>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl">{metric.current.toFixed(2)}</span>
              <span className="text-gray-500">{metric.unit}</span>
            </div>
          </div>
          <div className={`p-3 rounded-xl ${config.bg}`}>
            <StatusIcon className={`w-8 h-8 ${config.text}`} />
          </div>
        </div>
        
        <div className="flex items-center gap-2 mb-4">
          <span className={`px-3 py-1 rounded-full border ${config.border} ${config.text}`}>
            {metric.status.charAt(0).toUpperCase() + metric.status.slice(1)}
          </span>
          {metric.trend === 'up' && <TrendingUp className="w-4 h-4 text-red-600" />}
          {metric.trend === 'down' && <TrendingDown className="w-4 h-4 text-green-600" />}
        </div>

        <p className="text-gray-700">{metric.impact}</p>
      </div>

      {/* Historical Trend */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white">
        <h3 className="text-gray-900 mb-4">30-Day Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={historicalData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis 
              tick={{ fontSize: 12, fill: '#6b7280' }}
              tickLine={{ stroke: '#e5e7eb' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px 12px'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="#0ea5e9" 
              strokeWidth={2}
              fill="url(#colorValue)"
            />
            {historicalData[0]?.baseline !== undefined && (
              <Line 
                type="monotone" 
                dataKey="baseline" 
                stroke="#9ca3af" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-4 flex items-center gap-4 text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-4 h-1 bg-sky-500"></div>
            <span>Current</span>
          </div>
          {historicalData[0]?.baseline !== undefined && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-1 bg-gray-400 border-t-2 border-dashed border-gray-400"></div>
              <span>Seasonal Baseline</span>
            </div>
          )}
        </div>
      </div>

      {/* Thresholds */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white">
        <h3 className="text-gray-900 mb-4">Thresholds</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
            <span className="text-gray-700">Good</span>
            <span className="text-green-700">
              {metric.threshold.good} {metric.unit}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="text-gray-700">Warning</span>
            <span className="text-orange-700">
              {metric.threshold.warning} {metric.unit}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-gray-700">Alert</span>
            <span className="text-red-700">
              {metric.threshold.alert} {metric.unit}
            </span>
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="border border-blue-200 rounded-2xl p-6 bg-blue-50">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-gray-900 mb-2">Recommendation</h3>
            <p className="text-gray-700">{metric.recommendation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
