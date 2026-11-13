import { useEffect, useState, type ReactNode } from 'react';
import { Monitor } from 'lucide-react';
import { deskMode, MIN_WIDTH } from './deskMode';
import './shell.css';

/*
 * Desktop-only gate. Under MIN_WIDTH the dashboard is not rendered at all (its loops and WebGL stop with it) and a notice
 * takes its place. Between MIN_WIDTH and the design width the layout is scaled to fit through --desk-scale on <html>.
 * The check follows the window live, so widening it restores the dashboard without a reload.
 */
export default function DesktopGate({ children }: { children: ReactNode }) {
  const [desk, setDesk] = useState(() => deskMode(window.innerWidth));
  useEffect(() => {
    const on = () => setDesk(deskMode(window.innerWidth));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty('--desk-scale', String(desk.scale));
    html.dataset.deskMode = desk.mode;
    return () => {
      html.style.removeProperty('--desk-scale');
      delete html.dataset.deskMode;
    };
  }, [desk.mode, desk.scale]);

  if (desk.mode === 'blocked') {
    return (
      <main className="desk-gate" data-testid="desktop-gate">
        <div className="desk-gate__card">
          <Monitor size={28} aria-hidden="true" />
          <p className="desk-gate__brand">AEIOS / SENTINEL</p>
          <h1>AEIOS Sentinel is built for desktop screens</h1>
          <p>Open this dashboard on a computer, or widen this window to at least {MIN_WIDTH} pixels.</p>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
