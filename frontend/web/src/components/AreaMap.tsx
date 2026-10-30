import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import type { SiteId } from '../lib/api';

const SITES = [
  { id: 'sgt' as SiteId, name: 'SGT University', position: [28.4782417, 76.9040528] as [number, number], color: '#00e5ff' },
  { id: 'chandu' as SiteId, name: 'Chandu village', position: [28.4750, 76.9167] as [number, number], color: '#efbd76' },
];

function FitSites() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(SITES.map((site) => site.position), { padding: [32, 32] });
  }, [map]);
  return null;
}

export default function AreaMap({ selected, onSelect }: { selected: SiteId; onSelect: (site: SiteId) => void }) {
  return (
    <MapContainer center={[28.477, 76.910]} zoom={14} scrollWheelZoom={false} className="area-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitSites />
      {SITES.map((site) => (
        <CircleMarker
          key={site.id}
          center={site.position}
          radius={selected === site.id ? 10 : 7}
          pathOptions={{ color: site.color, fillColor: site.color, fillOpacity: 0.78, weight: 2 }}
          eventHandlers={{ click: () => onSelect(site.id) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{site.name}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
