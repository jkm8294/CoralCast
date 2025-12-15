import { Region } from '../types/coral';
import { MapContainer, Marker, Popup, Rectangle, TileLayer, useMap } from 'react-leaflet';
import L, { LatLngBoundsExpression } from 'leaflet';
import { useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';

interface MapViewProps {
  region: Region;
  healthScore?: number | null;
}

interface MapBoundsUpdaterProps {
  bounds: LatLngBoundsExpression;
}

function MapBoundsUpdater({ bounds }: MapBoundsUpdaterProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.fitBounds(bounds, { padding: [24, 24], animate: true });
  }, [map, bounds]);

  return null;
}

export function MapView({ region, healthScore }: MapViewProps) {
  const hasScore = typeof healthScore === 'number' && Number.isFinite(healthScore);
  const resolvedScore = hasScore ? (healthScore as number) : 0;

  // Determine color based on health score
  const getColor = (score: number) => {
    if (score >= 80) return '#10b981'; // green
    if (score >= 65) return '#f59e0b'; // orange
    if (score >= 50) return '#ef4444'; // red
    return '#dc2626'; // dark red
  };

  const getStatusText = (score: number) => {
    if (score >= 80) return 'Good';
    if (score >= 65) return 'Warning';
    return 'Alert';
  };

  const color = getColor(resolvedScore);

  const getReefStatusColor = (status?: 'good' | 'warning' | 'alert') => {
    if (status === 'good') return '#10b981';
    if (status === 'warning') return '#f59e0b';
    if (status === 'alert') return '#ef4444';
    return '#6b7280';
  };

  const getReefStatusLabel = (status?: 'good' | 'warning' | 'alert') => {
    if (!status) return 'Unknown';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const [[minLat, minLng], [maxLat, maxLng]] = region.bbox;
    return [
      [minLat, minLng],
      [maxLat, maxLng]
    ];
  }, [region.bbox]);

  const reefIcon = useMemo(
    () =>
      L.divIcon({
        html: '<div class="reef-marker-star"></div>',
        className: 'reef-marker-wrapper',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      }),
    []
  );

  const alertReefs = useMemo(
    () => region.reefs.filter(reef => reef.status === 'alert'),
    [region.reefs]
  );

  return (
    <div className="space-y-4">
      {/* Map Container */}
      <div className="w-full h-[500px] rounded-2xl border border-gray-200 overflow-hidden relative">
        <MapContainer
          key={region.id}
          bounds={bounds}
          center={region.centroid}
          scrollWheelZoom
          className="h-full w-full"
        >
          <MapBoundsUpdater bounds={bounds} />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          <Rectangle
            bounds={bounds}
            pathOptions={{ color, weight: 2, fillOpacity: 0.08 }}
          />

          {region.reefs.map(reef => (
            <Marker key={reef.id} position={reef.coordinates} icon={reefIcon}>
              <Popup>
                <div className="space-y-1">
                  <h4 className="font-semibold text-gray-900">{reef.name}</h4>
                  <p className="text-sm text-gray-600">
                    Status:{' '}
                    <span style={{ color: getReefStatusColor(reef.status) }}>
                      {getReefStatusLabel(reef.status)}
                    </span>
                  </p>
                  {reef.description && (
                    <p className="text-xs text-gray-500">{reef.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    Lat: {reef.coordinates[0].toFixed(4)}°, Lng: {reef.coordinates[1].toFixed(4)}°
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Info Card Overlay */}
        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-xl shadow-lg p-4 max-w-xs border border-gray-200">
          <h3 className="text-gray-900 mb-2">{region.name}</h3>
          <div className="space-y-1 text-gray-600 text-sm">
            <p>
              Health Score:{' '}
              <strong style={{ color }}>{hasScore ? resolvedScore : '—'}</strong>
            </p>
            <p>
              Status:{' '}
              <strong style={{ color }}>
                {hasScore ? getStatusText(resolvedScore) : 'Pending'}
              </strong>
            </p>
            <p className="pt-2 border-t border-gray-200">
              Focus sites: {region.reefs.length}
            </p>
            <p className="text-xs text-gray-500">
              Coordinates: {region.centroid[0].toFixed(4)}°, {region.centroid[1].toFixed(4)}°
            </p>
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500"></div>
            <span className="text-gray-600">Good (80+)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-orange-500"></div>
            <span className="text-gray-600">Warning (65-79)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500"></div>
            <span className="text-gray-600">Alert (&lt; 65)</span>
          </div>
        </div>
        <p className="text-gray-500 mt-3">
          Markers highlight the reef sites you are tracking across {region.name}. Click any stub to review its status and notes.
        </p>
        <p className="text-gray-400 mt-2">
          Basemap © OpenStreetMap contributors · Reef data from NOAA Coral Reef Watch and Allen Coral Atlas.
        </p>
      </div>
      
      {/* Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          className={`rounded-2xl p-5 border ${
            alertReefs.length
              ? 'border-rose-200 bg-rose-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm uppercase tracking-wide text-gray-600">Active Alerts</p>
              <h4 className="text-xl text-gray-900">
                {alertReefs.length ? `${alertReefs.length} reefs require attention` : 'No reefs on alert'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                Highlight urgent bleaching or heat stress advisories for {region.name}.
              </p>
            </div>
            <AlertTriangle
              className={`w-6 h-6 ${
                alertReefs.length ? 'text-rose-500' : 'text-emerald-500'
              }`}
            />
          </div>

          {alertReefs.length ? (
            <ul className="space-y-3">
              {alertReefs.map(reef => (
                <li
                  key={reef.id}
                  className="bg-white rounded-xl border border-rose-100 p-3"
                >
                  <p className="text-sm font-semibold text-gray-900">{reef.name}</p>
                  {reef.description && (
                    <p className="text-xs text-gray-600 mt-1">{reef.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Coordinates: {reef.coordinates[0].toFixed(2)}°, {reef.coordinates[1].toFixed(2)}°
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">
              Your monitored sites are stable. Use this panel to call out active alerts when they are issued.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
