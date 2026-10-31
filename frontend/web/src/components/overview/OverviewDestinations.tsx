import { ArrowRight } from 'lucide-react';

const DEST = [
  { id: 'air-quality', name: 'Air quality', note: 'CAMS pollutant profiles and the PM2.5 / PM10 forecast.' },
  { id: 'dispersion', name: 'Pollution dispersion', note: 'Ventilation, mixing height and inversion in detail.' },
  { id: 'forecast', name: 'Forecast', note: 'Temperature, rain and the daily outlook.' },
  { id: 'smoke', name: 'Smoke origin', note: 'Back-trajectories against satellite fire detections.' },
  { id: 'station', name: 'Station network', note: 'Site map and raw station telemetry.' },
];

export default function OverviewDestinations({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <nav className="cc-dest" aria-labelledby="cc-dest-h">
      <h2 id="cc-dest-h" className="cc-h2">Inspect next</h2>
      <ul>
        {DEST.map((d) => (
          <li key={d.id}>
            <a href={`#${d.id}`} onClick={(e) => { e.preventDefault(); onNavigate(d.id); }}>
              <strong>{d.name} <ArrowRight size={16} aria-hidden="true" /></strong>
              <span>{d.note}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
