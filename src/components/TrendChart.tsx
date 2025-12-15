import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendData } from '../types/coral';

interface TrendChartProps {
  trendData?: TrendData | null;
}

export function TrendChart({ trendData }: TrendChartProps) {
  if (!trendData || trendData.data.length === 0) {
    return (
      <div className="border border-gray-200 rounded-2xl p-5 bg-white">
        <h3 className="text-gray-700 mb-4">Trend</h3>
        <div className="h-[200px] flex items-center justify-center text-gray-400">
          No live history yet.
        </div>
      </div>
    );
  }

  const chartData = trendData.data.map(point => ({
    date: new Date(point.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: Number(point.value.toFixed(2))
  }));

  return (
    <div className="border border-gray-200 rounded-2xl p-5 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-gray-700">{trendData.metric} trend</h3>
        <span className="text-sm text-gray-500">Last {chartData.length} samples</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} tickLine={{ stroke: '#e5e7eb' }} />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={{ stroke: '#e5e7eb' }}
            domain={['dataMin - 1', 'dataMax + 1']}
            label={{ value: trendData.unit, angle: -90, position: 'insideLeft', fill: '#6b7280' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '8px 12px'
            }}
            labelStyle={{ color: '#374151', marginBottom: '4px' }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ fill: '#0ea5e9', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
