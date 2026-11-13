import { useEffect, useState } from 'react';
import { aqiCategory, gaugePosition } from '../components/overview/model';
import DeckCard from './DeckCard';
import { useCountUp } from './useCountUp';

const ARC = Math.PI * 50; // length of the half circle drawn below

/* Regional (CAMS) US AQI as an arc gauge. Labelled as modelled; a missing value draws an empty arc and "no reading". */
export default function AirCard({ aqi, pm25, warning, available }: { aqi: number | null; pm25: string | null; warning: string; available: boolean }) {
  const pos = gaugePosition(aqi, { min: 0, max: 500, scale: 'linear' });
  const target = pos ? pos.pos : 0;
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(target)); // one frame after mount, so the arc sweeps in
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const text = useCountUp(aqi === null ? null : Math.round(aqi));
  const category = aqiCategory(aqi);
  return (
    <DeckCard title="Regional air" source="regional" sourceDetail="CAMS · ~45 km">
      <div className="dk-arc">
        <svg viewBox="0 0 120 70" aria-hidden="true">
          <path d="M10 60 A50 50 0 0 1 110 60" className="dk-arc__track" />
          <path d="M10 60 A50 50 0 0 1 110 60" className="dk-arc__fill" style={{ strokeDasharray: ARC, strokeDashoffset: ARC * (1 - drawn) }} />
        </svg>
        <div className="dk-arc__read">
          {text === null ? <span className="dk-stat__value--none">no reading</span> : <span className="ax-num dk-arc__num">{text}</span>}
          <small>US AQI (modelled)</small>
        </div>
      </div>
      <p className="dk-card__note">{available ? `${category ?? ''}${pm25 ? ` · PM2.5 ${pm25} µg/m³` : ''}` : warning || 'Air-quality model unavailable.'}</p>
      {available && warning && <p className="dk-card__note">{warning}</p>}
    </DeckCard>
  );
}
