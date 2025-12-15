export interface DetailMetric {
  current: number;
  unit: string;
  status: 'good' | 'warning' | 'alert';
  trend: 'up' | 'down' | 'stable';
  threshold: {
    good: number;
    warning: number;
    alert: number;
  };
  impact: string;
  recommendation: string;
}

export interface DetailHistoricalPoint {
  date: string;
  value: number;
  baseline?: number;
}

export interface DetailMetricPayload {
  metric: DetailMetric;
  historicalData: DetailHistoricalPoint[];
}
