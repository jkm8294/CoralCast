export interface ReefSite {
  id: string;
  name: string;
  coordinates: [number, number];
  status?: 'good' | 'warning' | 'alert';
  description?: string;
}

export interface Region {
  id: string;
  name: string;
  centroid: [number, number];
  bbox: [[number, number], [number, number]];
  reefs: ReefSite[];
}

export interface MetricData {
  value: number | null;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  status: 'good' | 'warning' | 'alert';
}

export interface CoralHealthData {
  chi: MetricData & { score: number };
  sst: MetricData;
  dhw: MetricData;
  bleachingAlert: MetricData & { level: number };
  chlorophyllA: MetricData;
  lastUpdated: string;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface TrendData {
  metric: string;
  data: TimeSeriesPoint[];
  unit: string;
}
