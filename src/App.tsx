import { useMemo, useState } from 'react';
import { HomeView } from './components/HomeView';
import { DetailView } from './components/DetailView';
import { HurricanePredictor } from './components/HurricanePredictor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { REGIONS } from './data/mockData';
import { Waves, Menu } from 'lucide-react';
import { Button } from './components/ui/button';
import { useLiveRegionData } from './hooks/useLiveRegionData';
import { useRegionDashboardData } from './hooks/useRegionDashboardData';
import { downloadStormTrainingCsv } from './data/trainingDataset';
import type { DetailMetricPayload } from './types/detail';

type ViewType = 'home' | 'temperature' | 'chlorophyll' | 'hurricane';

function DataUnavailable({
  title,
  onBack,
  loading,
  message
}: {
  title: string;
  onBack: () => void;
  loading?: boolean;
  message?: string;
}) {
  return (
    <div className="border rounded-2xl p-8 bg-white">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-gray-900">{title}</h2>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
      <p className="text-gray-600">
        {loading ? 'Fetching live observations for this region...' : message ?? 'This metric does not have a reliable live feed yet.'}
      </p>
    </div>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [selectedRegion, setSelectedRegion] = useState(REGIONS[0].id);

  const region = useMemo(() => REGIONS.find(r => r.id === selectedRegion) || REGIONS[0], [selectedRegion]);

  const liveRegion = useLiveRegionData(region);
  const dashboard = useRegionDashboardData(region);

  const handleExportTraining = () => {
    void downloadStormTrainingCsv(region, 2000);
  };

  const handleMetricClick = (metric: ViewType) => {
    setActiveView(metric);
  };

  const handleBack = () => {
    setActiveView('home');
  };

  const temperatureDetail: DetailMetricPayload | undefined = dashboard.details.temperature;
  const chlorophyllDetail: DetailMetricPayload | undefined = dashboard.details.chlorophyll;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div
        className="relative h-[300px] bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url('https://images.unsplash.com/photo-1719042575585-e9d866f43210?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3JhbCUyMHJlZWYlMjB1bmRlcndhdGVyfGVufDF8fHx8MTc2MTYxMzk4MHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral')`
        }}
      >
        <div className="absolute inset-0 flex flex-col">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 text-white">
              <Waves className="w-8 h-8" />
              <span className="text-xl">CoralCast</span>
            </div>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
              <Menu className="w-6 h-6" />
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                <SelectTrigger className="w-full h-14 bg-white/95 backdrop-blur-sm border-none shadow-lg">
                  <SelectValue placeholder="Select reef region" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="mt-4 bg-white/95 backdrop-blur-sm rounded-xl p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600">{region.name}</p>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-4xl">
                        {dashboard.summary?.chi.score != null ? dashboard.summary.chi.score : '—'}
                      </span>
                      <span className="text-gray-500">CHI Score</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-600">SST</p>
                    <p className="text-2xl">
                      {dashboard.summary?.sst.value != null ? `${dashboard.summary.sst.value.toFixed(1)}°C` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: 'home', label: 'Overview' },
              { id: 'temperature', label: 'Temperature' },
              { id: 'chlorophyll', label: 'Chlorophyll' },
              { id: 'hurricane', label: 'Hurricane Risk' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id as ViewType)}
                className={`px-4 py-3 whitespace-nowrap transition-all ${
                  activeView === tab.id
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        {activeView === 'home' && (
          <HomeView
            region={region}
            data={dashboard.summary}
            dataLoading={dashboard.loading}
            trendData={dashboard.trend}
            onMetricClick={handleMetricClick}
            liveData={liveRegion.data}
            liveLoading={liveRegion.loading}
            liveError={liveRegion.error}
          />
        )}

        {activeView === 'temperature' &&
          (temperatureDetail ? (
            <DetailView
              title="Sea Surface Temperature"
              metric={temperatureDetail.metric}
              historicalData={temperatureDetail.historicalData}
              onBack={handleBack}
            />
          ) : (
            <DataUnavailable title="Sea Surface Temperature" onBack={handleBack} loading={dashboard.loading} />
          ))}

        {activeView === 'chlorophyll' &&
          (chlorophyllDetail ? (
            <DetailView
              title="Chlorophyll-a Concentration"
              metric={chlorophyllDetail.metric}
              historicalData={chlorophyllDetail.historicalData}
              onBack={handleBack}
            />
          ) : (
            <DataUnavailable title="Chlorophyll-a Concentration" onBack={handleBack} loading={dashboard.loading} />
          ))}

        {activeView === 'hurricane' &&
          (dashboard.hurricaneInputs.sst != null || dashboard.hurricaneInputs.activeStorm ? (
            <HurricanePredictor
              regionName={region.name}
              regionId={region.id}
              sst={dashboard.hurricaneInputs.sst ?? 0}
              chlorophyll={dashboard.hurricaneInputs.chlorophyll}
              activeStorm={dashboard.hurricaneInputs.activeStorm}
              drivers={dashboard.drivers}
              onExportDataset={handleExportTraining}
            />
          ) : (
            <DataUnavailable title="Hurricane Risk" onBack={handleBack} loading={dashboard.loading} />
          ))}
      </div>
    </div>
  );
}
