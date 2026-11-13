import { useEffect, useState } from 'react';
import { m } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import MotionReady from '../motion/MotionReady';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import type { SiteId } from '../lib/api';
import { VIEW_BY_ID, type ViewId } from './viewRegistry';

const SITES: ReadonlyArray<{ id: SiteId; name: string }> = [
  { id: 'sgt', name: 'SGT University' },
  { id: 'chandu', name: 'Chandu village' },
];

const istClock = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });

/** HH:mm in IST, refreshed on the minute. */
function useIstClock(): string {
  const [now, setNow] = useState(() => istClock.format(new Date()));
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(istClock.format(new Date()));
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

/*
 * The top bar: where you are, which site, what time it is there, refresh and the account. The site switch is a radio group
 * whose thumb slides between the two sites (instant under reduced motion).
 */
export default function TopBar({ view, site, onSite, loading, onRefresh, userEmail, onSignOut }: {
  view: ViewId; site: SiteId; onSite: (site: SiteId) => void; loading: boolean; onRefresh: () => void; userEmail: string; onSignOut?: () => void;
}) {
  const { reduced } = useMotionPolicy();
  const clock = useIstClock();
  return (
    <MotionReady>
      <header className="dk-top">
        <div className="breadcrumb"><span>AEIOS</span><i>/</i><b aria-current="page">{VIEW_BY_ID[view].label}</b></div>
        <div className="dk-top__actions">
          <div className="dk-sites" role="radiogroup" aria-label="Observation site">
            {SITES.map(({ id, name }) => {
              const on = site === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} className={on ? 'dk-sites__opt is-on' : 'dk-sites__opt'} onClick={() => onSite(id)}>
                  {on && <m.span layoutId="site-thumb" className="dk-sites__thumb" aria-hidden="true" transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 38 }} />}
                  <span className="dk-sites__name">{name}</span>
                </button>
              );
            })}
          </div>
          <span className="dk-clock" title="India Standard Time, UTC+05:30"><b>{clock}</b> IST</span>
          <button type="button" className="icon-button" onClick={onRefresh} title="Refresh weather data" aria-label="Refresh weather data"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
          <button type="button" className="avatar-chip" onClick={onSignOut} title={userEmail ? `${userEmail} — click to sign out` : 'Sign out'} aria-label={userEmail ? `Sign out ${userEmail}` : 'Sign out'}>{(userEmail[0] || 'A').toUpperCase()}</button>
        </div>
      </header>
    </MotionReady>
  );
}
