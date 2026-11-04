import AeiosPanel from '../components/AeiosPanel';
import DispersionPanel from '../components/DispersionPanel';
import DispersionTwin from '../components/DispersionTwin';
import ForecastPanel from '../components/ForecastPanel';
import SatellitePanel from '../components/SatellitePanel';
import SmokeTracerPanel from '../components/SmokeTracerPanel';
import { RevealOnScroll } from '../motion/scroll';
import type { SiteId } from '../lib/api';
import { Hero, ViewRoot, type Hourly } from './shared';

/*
 * Views that wrap one existing panel. Each panel still renders its own <section id> and heading, so the view root does not
 * repeat the id (ownsId={false}). The panels mount only while their view is open (maps, WebGL and polling start on demand).
 */

export function DispersionView({ hourly, index }: { hourly: Hourly; index: number }) {
  return (
    <ViewRoot id="dispersion" ownsId={false}>
      <Hero id="dispersion" />
      <RevealOnScroll><DispersionPanel hourly={hourly} index={index} /></RevealOnScroll>
    </ViewRoot>
  );
}

export function TwinView() {
  return (
    <ViewRoot id="twin" ownsId={false}>
      <Hero id="twin" />
      <RevealOnScroll><DispersionTwin /></RevealOnScroll>
    </ViewRoot>
  );
}

export function SmokeView({ site }: { site: SiteId }) {
  return (
    <ViewRoot id="smoke" ownsId={false}>
      <Hero id="smoke" />
      <RevealOnScroll><SmokeTracerPanel site={site} /></RevealOnScroll>
    </ViewRoot>
  );
}

export function SatelliteView({ site }: { site: SiteId }) {
  return (
    <ViewRoot id="satellite" ownsId={false}>
      <Hero id="satellite" />
      <RevealOnScroll><SatellitePanel site={site} /></RevealOnScroll>
    </ViewRoot>
  );
}

/** AEIOS sensors and local model, then the gateway's PM2.5 forecast (section #pm-forecast). */
export function AeiosView() {
  return (
    <ViewRoot id="aeios" ownsId={false}>
      <Hero id="aeios" />
      <RevealOnScroll><AeiosPanel /></RevealOnScroll>
      <RevealOnScroll><ForecastPanel /></RevealOnScroll>
    </ViewRoot>
  );
}
