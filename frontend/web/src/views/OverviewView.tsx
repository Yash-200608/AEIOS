import type { ComponentProps } from 'react';
import { ArrowDown, Layers, MapPin } from 'lucide-react';
import GlobeHero, { type GlobeSite } from '../components/globe/GlobeHero';
import Overview from '../components/overview/Overview';
import { scrollBehavior } from '../motion/useMotionPolicy';
import { focusViewHeading } from '../shell/focusHeading';
import { ViewRoot } from './shared';

const coord = (value: number, pos: string, neg: string) => `${Math.abs(value).toFixed(4)}° ${value >= 0 ? pos : neg}`;

/*
 * The landing view: the globe intro flies in to the selected site, then the command center (the existing Overview, unchanged).
 * The chips only state facts the page already shows elsewhere: the site's reference coordinates and which kinds of evidence
 * the command center combines. The call to action scrolls to the command center and moves focus to its situation statement.
 */
export default function OverviewView({ primary, secondary, overview }: { primary: GlobeSite; secondary?: GlobeSite; overview: ComponentProps<typeof Overview> }) {
  const openCommandCenter = () => {
    const target = document.getElementById('overview');
    if (!target) return;
    target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    focusViewHeading(target);
  };
  return (
    <ViewRoot id="overview" ownsId={false}>
      <GlobeHero
        primary={primary}
        secondary={secondary}
        kicker="AEIOS SENTINEL"
        title={<>Environmental intelligence for <span>{primary.name}</span></>}
      >
        <ul className="ov-hero-chips">
          <li className="ov-hero-chip"><MapPin size={13} aria-hidden="true" /> <span className="ax-mono">{coord(primary.lat, 'N', 'S')}, {coord(primary.lon, 'E', 'W')}</span></li>
          <li className="ov-hero-chip"><Layers size={13} aria-hidden="true" /> Regional model + AEIOS station</li>
        </ul>
        <button type="button" className="ov-hero-cta" onClick={openCommandCenter}>
          Open the command center <ArrowDown size={15} aria-hidden="true" />
        </button>
      </GlobeHero>
      <Overview {...overview} />
    </ViewRoot>
  );
}
