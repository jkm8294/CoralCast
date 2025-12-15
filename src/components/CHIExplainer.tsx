import { ArrowLeft, Thermometer, Droplets, Activity, FlaskConical, Users, TrendingUp, Calculator } from 'lucide-react';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

interface CHIExplainerProps {
  onBack: () => void;
  currentScore: number;
}

export function CHIExplainer({ onBack, currentScore }: CHIExplainerProps) {
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500';
    if (score >= 70) return 'bg-green-500';
    if (score >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Optimal';
    if (score >= 70) return 'Moderate Stress';
    if (score >= 50) return 'Elevated Stress';
    return 'Severe Degradation';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div>
          <h2 className="text-gray-900">How the Coral Health Index is Measured</h2>
          <p className="text-gray-600">A composite metric blending environmental, biological, and human impact indicators</p>
        </div>
      </div>

      {/* Current Score Display */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-cyan-50">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-gray-600 mb-2">Current CHI Score</p>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl">{currentScore}</span>
              <span className="text-gray-500">/ 100</span>
            </div>
            <p className="text-gray-700 mt-2">{getScoreLabel(currentScore)}</p>
          </div>
          <Calculator className="w-12 h-12 text-blue-600" />
        </div>
        
        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full ${getScoreColor(currentScore)} transition-all duration-500`}
            style={{ width: `${currentScore}%` }}
          />
        </div>
      </div>

      {/* Score Interpretation Ranges */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white">
        <h3 className="text-gray-900 mb-4">Score Interpretation</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div>
              <p className="text-gray-900">90–100: Optimal Reef Health</p>
              <p className="text-gray-600">Stable conditions, thriving ecosystem</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white">
              100
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
            <div>
              <p className="text-gray-900">70–89: Moderate Stress</p>
              <p className="text-gray-600">Early warming or minor acidification</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white">
              80
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div>
              <p className="text-gray-900">50–69: Elevated Stress</p>
              <p className="text-gray-600">Possible bleaching onset</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center text-white">
              60
            </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
            <div>
              <p className="text-gray-900">Below 50: Severe Degradation</p>
              <p className="text-gray-600">Active bleaching or bloom risk</p>
            </div>
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center text-white">
              40
            </div>
          </div>
        </div>
      </div>

      {/* 1. Environmental Indicators */}
      <div className="border border-blue-200 rounded-2xl p-6 bg-blue-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Thermometer className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-gray-900">1. Environmental Indicators</h3>
            <p className="text-gray-600">Core physical and chemical signals</p>
          </div>
        </div>
        
        <div className="space-y-3 bg-white rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Sea Surface Temperature (SST)</strong></p>
              <p className="text-gray-600">High temperatures indicate bleaching risk</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Chlorophyll Concentration</strong></p>
              <p className="text-gray-600">Elevated levels suggest nutrient-rich waters and potential algal bloom conditions</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Turbidity</strong></p>
              <p className="text-gray-600">High turbidity means sediment or runoff stress, reducing sunlight for photosynthesis</p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Biological Indicators */}
      <div className="border border-green-200 rounded-2xl p-6 bg-green-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <Activity className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-gray-900">2. Biological Indicators</h3>
            <p className="text-gray-600">Health of living reef components</p>
          </div>
        </div>
        
        <div className="space-y-3 bg-white rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Live Coral Cover (%)</strong></p>
              <p className="text-gray-600">The proportion of living coral versus dead or algae-covered substrate</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Biodiversity Index</strong></p>
              <p className="text-gray-600">Species richness and abundance of key reef organisms (fish, invertebrates, algae)</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Bleaching Extent</strong></p>
              <p className="text-gray-600">Derived from satellite imagery and diver reports</p>
            </div>
          </div>
        </div>
        
        <p className="text-gray-600 mt-3 text-sm">
          Collected through surveys, imagery, or eDNA analysis
        </p>
      </div>

      {/* 3. Human & Ecosystem Pressure */}
      <div className="border border-purple-200 rounded-2xl p-6 bg-purple-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-purple-100 rounded-xl">
            <Users className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-gray-900">3. Human & Ecosystem Pressure Indicators</h3>
            <p className="text-gray-600">Contextual variables that explain stress drivers</p>
          </div>
        </div>
        
        <div className="space-y-3 bg-white rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Coastal Development Density</strong></p>
              <p className="text-gray-600">Proximity to urban or industrial zones</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Tourism & Fishing Intensity</strong></p>
              <p className="text-gray-600">Boat traffic, dive activity, and fishing effort data</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-purple-500 mt-2"></div>
            <div>
              <p className="text-gray-900"><strong>Runoff & Nutrient Load</strong></p>
              <p className="text-gray-600">Agricultural and wastewater discharges</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Forecasting & Modeling */}
      <div className="border border-orange-200 rounded-2xl p-6 bg-orange-50">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-orange-100 rounded-xl">
            <TrendingUp className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h3 className="text-gray-900">4. Forecasting & Modeling Layer</h3>
            <p className="text-gray-600">Machine learning predictions</p>
          </div>
        </div>
        
        <div className="bg-white rounded-xl p-4 space-y-3">
          <p className="text-gray-700">
            All data sources feed into a <strong>machine learning model</strong> (e.g., XGBoost or Random Forest) 
            trained on historical reef outcomes.
          </p>
          
          <div className="p-4 bg-orange-50 rounded-lg">
            <p className="text-gray-900 mb-2"><strong>The model learns:</strong></p>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-orange-500">•</span>
                <span>How parameter combinations predict bleaching events</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500">•</span>
                <span>Algal bloom formation patterns</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500">•</span>
                <span>Oxygen stress conditions</span>
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-gray-600 mb-1">Normalization</p>
              <p className="text-gray-900">0–1 scale</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-gray-600 mb-1">Weighting</p>
              <p className="text-gray-900">By correlation</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-gray-600 mb-1">Output</p>
              <p className="text-gray-900">0–100 CHI</p>
            </div>
          </div>
        </div>
      </div>

      {/* Forecast Timeline */}
      <div className="border border-gray-200 rounded-2xl p-6 bg-white">
        <h3 className="text-gray-900 mb-4">Forecast Capabilities</h3>
        <p className="text-gray-700 mb-4">
          The output includes both a <strong>current score</strong> and a <strong>7–90 day forecast</strong> of likely change.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
            <p className="text-gray-600 mb-1">7-Day Forecast</p>
            <p className="text-2xl text-blue-600">Short-term</p>
            <p className="text-gray-600 mt-2">Immediate stress events</p>
          </div>
          <div className="p-4 border border-green-200 rounded-lg bg-green-50">
            <p className="text-gray-600 mb-1">30-Day Forecast</p>
            <p className="text-2xl text-green-600">Medium-term</p>
            <p className="text-gray-600 mt-2">Seasonal patterns</p>
          </div>
          <div className="p-4 border border-purple-200 rounded-lg bg-purple-50">
            <p className="text-gray-600 mb-1">90-Day Forecast</p>
            <p className="text-2xl text-purple-600">Long-term</p>
            <p className="text-gray-600 mt-2">Climate trends</p>
          </div>
        </div>
      </div>

      {/* Data Sources Footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <h3 className="text-gray-900 mb-3">Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <FlaskConical className="w-4 h-4 text-gray-600 mt-1 flex-shrink-0" />
            <div>
              <p className="text-gray-900">NOAA Coral Reef Watch</p>
              <p className="text-gray-600">SST, DHW, Bleaching Alerts</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <FlaskConical className="w-4 h-4 text-gray-600 mt-1 flex-shrink-0" />
            <div>
              <p className="text-gray-900">NASA MODIS</p>
              <p className="text-gray-600">Chlorophyll-a, Ocean Color</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <FlaskConical className="w-4 h-4 text-gray-600 mt-1 flex-shrink-0" />
            <div>
              <p className="text-gray-900">NOAA ERDDAP</p>
                <p className="text-gray-600">Chlorophyll, Turbidity, Climatology</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <FlaskConical className="w-4 h-4 text-gray-600 mt-1 flex-shrink-0" />
            <div>
              <p className="text-gray-900">Allen Coral Atlas</p>
              <p className="text-gray-600">Reef Coverage Mapping</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
