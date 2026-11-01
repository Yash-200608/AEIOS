import { ArrowRight } from 'lucide-react';

const DEST = [
  { id: 'dispersion', name: 'Analyse dispersion', note: 'The full 48-hour ventilation and inversion chart.' },
  { id: 'air-quality', name: 'Compare air quality', note: 'CAMS pollutant profiles and the PM2.5 / PM10 forecast.' },
  { id: 'smoke', name: 'Trace smoke origin', note: 'Back-trajectories against satellite fire detections.' },
  { id: 'satellite', name: 'Inspect satellite layers', note: 'Imagery, aerosol and fire layers; a different evidence class.' },
  { id: 'forecast', name: 'Check the forecast', note: 'Temperature, rain and the daily outlook.' },
  { id: 'station', name: 'Review the station network', note: 'Site map and raw station telemetry.' },
];

export default function OverviewDestinations({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <nav className="cc-dest" aria-labelledby="cc-dest-h">
      <h2 id="cc-dest-h" className="cc-h2">Investigate further</h2>
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
