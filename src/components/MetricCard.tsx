import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { MetricData } from '../types/coral';

interface MetricCardProps {
  title: string;
  value: number | null;
  unit: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  status?: 'good' | 'warning' | 'alert';
  size?: 'small' | 'large';
  onClick?: () => void;
}

export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trend = 'stable',
  status = 'good',
  size = 'small',
  onClick
}: MetricCardProps) {
  const statusColors = {
    good: 'border-green-200 bg-green-50/50',
    warning: 'border-orange-200 bg-orange-50/50',
    alert: 'border-red-200 bg-red-50/50'
  };

  const trendIcons = {
    up: <ArrowUp className="w-4 h-4" />,
    down: <ArrowDown className="w-4 h-4" />,
    stable: <Minus className="w-4 h-4" />
  };

  const trendColors = {
    up: 'text-red-600',
    down: 'text-green-600',
    stable: 'text-gray-500'
  };

  return (
    <div
      className={`border rounded-2xl p-5 transition-all ${statusColors[status]} ${
        onClick ? 'cursor-pointer hover:shadow-md' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-3">
        <span className="text-gray-600">{title}</span>
        <span className={`flex items-center ${trendColors[trend]}`}>
          {trendIcons[trend]}
        </span>
      </div>
      
      <div className="flex items-baseline gap-2">
        {value !== null ? (
          <>
            <span className={size === 'large' ? 'text-5xl' : 'text-3xl'}>
              {value.toFixed(value < 10 ? 1 : 0)}
            </span>
            <span className="text-gray-500">{unit}</span>
          </>
        ) : (
          <span className="text-3xl text-gray-400">--</span>
        )}
      </div>
      
      {subtitle && (
        <div className="mt-2 text-gray-500">
          {subtitle}
        </div>
      )}
    </div>
  );
}
