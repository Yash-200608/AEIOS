import { AlertTriangle } from 'lucide-react';
import './overview.css';
import { EmptyState } from '../../design/primitives';
import { compass } from '../../lib/api';
import { CALM_WIND_KMH, VENTILATION_POOR } from '../../lib/derived';
import { EnterOnce, RevealControls, RevealGroup, RevealRoot } from '../../motion/reveal';
import { ALERT_WINDOW_HOURS, fixed, useOverviewModel, type OverviewProps } from '../../deck/useOverviewModel';
import AlertSummary from './AlertSummary';
import EnvironmentalAssessment from './EnvironmentalAssessment';
import OutlookRibbon from './OutlookRibbon';
import SituationHeader from './SituationHeader';
import SystemRail from './SystemRail';
import LocalObservations from './LocalObservations';
import OverviewDestinations from './OverviewDestinations';
import RegionalContext from './RegionalContext';
import { istTime } from './format';

export type { OverviewProps };

/** The Briefing: the evidence behind the command deck's headline. Every value comes from useOverviewModel. */
export default function Overview(p: OverviewProps) {
  const {
    loadState, loaded, failed, reading, observation, packetAgo, values, pmWhy, localAqi, headline, stationState, cls, evidence, limits, health,
    outcome, outlookRows, column, feeds, feed, aqiNumber, modelHour, vc, wind, inv, fixtureName,
  } = useOverviewModel(p);

  return (
    <section id="briefing" className="page-section" aria-label="Briefing">
      {/* The Mission Reveal starts when the briefing is on screen. */}
      <RevealRoot className="cc" start="visible">
        {fixtureName && (
          <div className="cc-dev" role="note"><AlertTriangle size={16} aria-hidden="true" /> <span><strong>Development fixture &quot;{fixtureName}&quot;.</strong> Illustrative state for visual checks, not real data. Not present in production builds.</span></div>
        )}
        <RevealControls />
        <SituationHeader
          cls={cls} loadState={loadState} site={p.title} subtitle={p.subtitle} lat={p.lat} lon={p.lon} feed={feed}
          modelFetched={istTime(p.lastUpdated)} modelHour={modelHour} stationNode={reading.node} stationState={stationState}
          stationAgo={!loaded ? 'checking…' : failed ? 'unknown (gateway data unavailable)' : packetAgo}
        />
        {p.forecastMeta?.warning && (
          <div style={{ marginTop: 'var(--aeios-space-6)' }}><EmptyState kind="stale" title="Weather model feed is a cached run">{p.forecastMeta.warning}</EmptyState></div>
        )}
        <div className="cc-band">
          <RevealGroup group="assessment" className="cc-band__main">
            <EnvironmentalAssessment
              loadState={loadState} evidence={evidence} limits={limits} hourLabel={modelHour} column={column} onNavigate={p.onNavigate} onRetry={p.onRetry}
              criteria={{ vc, wind, inv, blh: column.blh, poorAt: VENTILATION_POOR, calmKmh: CALM_WIND_KMH }}
            />
          </RevealGroup>
          <RevealGroup group="evidence" className="cc-band__side">
            <LocalObservations loaded={loaded} failed={failed} state={observation} node={reading.node} headline={headline} values={values} last={reading.packet ? values : null} packetAgo={packetAgo} pmWhy={pmWhy} aqi={localAqi} />
          </RevealGroup>
        </div>
        <SystemRail feeds={feeds} rows={health} onNavigate={p.onNavigate} />
        <div className="cc-band cc-band--b">
          <RevealGroup group="outlook" className="cc-band__alerts"><AlertSummary outcome={outcome} windowHours={ALERT_WINDOW_HOURS} onNavigate={p.onNavigate} /></RevealGroup>
          <RevealGroup group="outlook" className="cc-band__outlook"><OutlookRibbon rows={outlookRows} poorAt={VENTILATION_POOR} loadState={loadState} onNavigate={p.onNavigate} /></RevealGroup>
        </div>
        <div className="cc-grid">
          <EnterOnce className="cc-span-12">
            <RegionalContext
              weather={{ temp: fixed(p.current.temperature_2m, 1), humidity: fixed(p.current.relative_humidity_2m), wind: fixed(p.current.wind_speed_10m, 1), windDir: compass(p.current.wind_direction_10m) ? `from ${compass(p.current.wind_direction_10m)}` : '', pressure: fixed(p.current.pressure_msl), uv: fixed(p.current.uv_index, 1) }}
              aqi={aqiNumber} aqPm25={fixed((p.aq?.current as any)?.pm2_5)} aqWarning={p.aqWarning} aqAvailable={p.aq !== null}
            />
          </EnterOnce>
          <EnterOnce className="cc-span-12"><OverviewDestinations onNavigate={p.onNavigate} /></EnterOnce>
        </div>
      </RevealRoot>
    </section>
  );
}
