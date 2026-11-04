import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Menu, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { scrollBehavior } from './motion/useMotionPolicy';
import { ScrollProgress } from './motion/scroll';
import type { SceneWeather } from './components/WeatherScene';
import { SmokeBanner } from './components/SmokeAlerts';
import { api, type SiteId, type WeatherPayload } from './lib/api';
import ViewStage from './shell/ViewStage';
import { useViewRoute } from './shell/useViewRoute';
import { focusViewHeading } from './shell/focusHeading';
import { DEFAULT_VIEW, VIEW_ALIASES, VIEW_BY_ID, VIEW_GROUPS, VIEW_IDS, type ViewId } from './shell/viewRegistry';
import OverviewView from './views/OverviewView';
import AirQualityView from './views/AirQualityView';
import ForecastView from './views/ForecastView';
import AtmosphereView from './views/AtmosphereView';
import SimulationView, { SIMULATION_OUTPUT_ID } from './views/SimulationView';
import StationView from './views/StationView';
import { AeiosView, DispersionView, SatelliteView, SmokeView, TwinView } from './views/PanelViews';
import { ModelRunContext, type LoadState, type ModelRunState, type StationState } from './views/shared';
import './shell/views.css';

type Layer = SceneWeather['layer'];

const SITES: Record<SiteId, { title: string; subtitle: string; lat: number; lon: number; code: string }> = {
  sgt: { title: 'SGT University', subtitle: 'Budhera campus · Gurugram', lat: 28.4782417, lon: 76.9040528, code: 'AEIOS-SGT-01' },
  chandu: { title: 'Chandu village', subtitle: 'Gurugram · Haryana', lat: 28.475, lon: 76.9167, code: 'AEIOS-CHD-01' },
};

const COMPACT_QUERY = '(max-width: 980px)';

export default function App({ userEmail = '', onSignOut }: { userEmail?: string; onSignOut?: () => void }) {
  const [site, setSite] = useState<SiteId>('sgt');
  const [days, setDays] = useState(15);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [aq, setAq] = useState<WeatherPayload | null>(null);
  const [forecastMeta, setForecastMeta] = useState<{ cached: boolean; stale: boolean; source: string; warning?: string } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [aqWarning, setAqWarning] = useState('');
  const [station, setStation] = useState<StationState>(null);
  const [hourIndex, setHourIndex] = useState(0);
  const [layer, setLayer] = useState<Layer>('wind');
  const [selectedDate, setSelectedDate] = useState('');
  const [simulation, setSimulation] = useState<any>(null);
  const [scenario, setScenario] = useState('dust_event');
  const [intensity, setIntensity] = useState(0.6);
  const [duration, setDuration] = useState(6);
  const [scenarioStart, setScenarioStart] = useState(3);
  const [simBusy, setSimBusy] = useState(false);
  const [simError, setSimError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  // Each sidebar item is its own view with its own URL (#/station); Back and Forward move between views.
  const route = useViewRoute<ViewId>(VIEW_IDS, DEFAULT_VIEW, VIEW_ALIASES);
  const view = route.view;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const drawerWasOpen = useRef(false);
  // A drawer closed by navigating hands focus to the new view's heading, not back to the menu button.
  const drawerFocusToView = useRef(false);
  const drawerOpenRef = useRef(drawerOpen);
  drawerOpenRef.current = drawerOpen;
  const [scenePaused, setScenePaused] = useState(false);

  // A cached (stale) weather model run is labelled in every view that shows model data, not only on the Overview.
  const modelRun: ModelRunState = forecastMeta?.stale && loadState === 'ready' ? { fetchedAt: lastUpdated } : null;

  const siteConfig = SITES[site];
  const otherSite = SITES[site === 'sgt' ? 'chandu' : 'sgt'];

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadState('loading');
    try {
      const [forecastResult, stationResult] = await Promise.all([
        api.forecast(site, days),
        api.observations(site).catch(() => null),
      ]);
      setWeather(forecastResult.data);
      setForecastMeta({ cached: forecastResult.cached, stale: forecastResult.stale, source: forecastResult.source, warning: forecastResult.warning });
      setStation(stationResult);
      setLastUpdated(forecastResult.fetched_at || new Date().toISOString());
      setLoadState('ready');
      const hourlyTimes = forecastResult.data.hourly?.time || [];
      const currentTime = String((forecastResult.data.current as any)?.time || '');
      if (currentTime && hourlyTimes.length) {
        let nearest = 0;
        let distance = Number.POSITIVE_INFINITY;
        hourlyTimes.forEach((time, i) => {
          const d = Math.abs(new Date(String(time)).getTime() - new Date(currentTime).getTime());
          if (Number.isFinite(d) && d < distance) { nearest = i; distance = d; }
        });
        setHourIndex(nearest);
      }
      const firstDate = String(forecastResult.data.daily?.time?.[0] || '');
      setSelectedDate((old) => old || firstDate);
    } catch (error) {
      setLoadState('error');
      console.error(error);
    }
    try {
      const air = await api.airQuality(site);
      setAq(air.data);
      setAqWarning(air.warning || (air.stale ? 'Showing a cached air-quality model run.' : ''));
    } catch (error) {
      setAq(null);
      setAqWarning(error instanceof Error ? error.message : 'Air-quality model feed unavailable.');
    }
  }, [site, days]);

  useEffect(() => { void load(); }, [load]);

  // Below 980 px the sidebar is an off-canvas drawer (it had no navigation at all on phones before).
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const on = () => { setCompact(mq.matches); if (!mq.matches) setDrawerOpen(false); };
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    // Focus enters the drawer on open and returns to the menu button on close; never on first render. A close caused by
    // navigation leaves focus to the view stage, which moves it to the new view's heading.
    if (drawerOpen) { drawerWasOpen.current = true; closeBtnRef.current?.focus(); }
    else if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      if (drawerFocusToView.current) drawerFocusToView.current = false;
      else menuBtnRef.current?.focus({ preventScroll: true });
    }
  }, [drawerOpen]);
  const closeDrawerForNavigation = () => {
    if (!drawerOpenRef.current) return;
    drawerFocusToView.current = true;
    setDrawerOpen(false);
  };
  // Back / Forward (or an in-app link) changed the view while the drawer was open.
  useEffect(() => { closeDrawerForNavigation(); }, [view]);
  const trapDrawer = (e: KeyboardEvent) => {
    if (!compact || !drawerOpen) return;
    if (e.key === 'Escape') { setDrawerOpen(false); return; }
    if (e.key !== 'Tab' || !sidebarRef.current) return;
    const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>('button, a[href]')).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const current = (weather?.current || {}) as Record<string, any>;
  const hourly = (weather?.hourly || {}) as Record<string, any[]>;
  const selectedHour = Math.max(0, Math.min(hourIndex, (hourly.time?.length || 1) - 1));
  const selectedTime = String(hourly.time?.[selectedHour] || current.time || '');

  const runSimulation = async () => {
    setSimBusy(true); setSimError('');
    try {
      const result = await api.simulate({ site_id: site, scenario, intensity, duration_hours: duration, start_hour: scenarioStart });
      setSimulation(result);
      setHourIndex(scenarioStart);
      // Keep the response in sight (on narrow screens the output panel sits below the controls).
      document.getElementById(SIMULATION_OUTPUT_ID)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    } catch (error) {
      setSimError(error instanceof Error ? error.message : 'Scenario run failed.');
    } finally { setSimBusy(false); }
  };

  const clearSimulation = () => setSimulation(null);

  /** Open a view (Overview's destinations call this with a view id). */
  const navigate = (section: string) => {
    closeDrawerForNavigation();
    route.navigate(section);
  };
  /** Sidebar item: opens the view, or, when it is already open, returns to its top and its heading. */
  const openView = (id: ViewId) => {
    closeDrawerForNavigation();
    if (route.navigate(id)) return;
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    focusViewHeading(document.querySelector(`[data-view-id="${id}"]`));
  };
  const skipToContent = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault(); // keeps the view's route in the address bar instead of '#main-content'
    document.getElementById('main-content')?.focus();
  };

  const renderView = (id: ViewId) => {
    switch (id) {
      case 'overview':
        return (
          <OverviewView
            primary={{ name: siteConfig.title, lat: siteConfig.lat, lon: siteConfig.lon }}
            secondary={{ name: otherSite.title, lat: otherSite.lat, lon: otherSite.lon }}
            overview={{
              site, title: siteConfig.title, subtitle: siteConfig.subtitle, lat: siteConfig.lat, lon: siteConfig.lon,
              loadState, forecastMeta, lastUpdated, current, hourly, selectedHour, selectedTime,
              aq, aqWarning, onRetry: () => void load(), onNavigate: navigate,
            }}
          />
        );
      case 'air-quality':
        return <AirQualityView aq={aq} aqWarning={aqWarning} />;
      case 'dispersion':
        return <DispersionView hourly={hourly} index={selectedHour} />;
      case 'twin':
        return <TwinView />;
      case 'forecast':
        return <ForecastView daily={weather?.daily as any} hourly={hourly} days={days} onDays={setDays} selectedDate={selectedDate} onSelectDate={setSelectedDate} onSelectHour={setHourIndex} />;
      case 'smoke':
        return <SmokeView site={site} />;
      case 'satellite':
        return <SatelliteView site={site} />;
      case 'atmosphere':
        return (
          <AtmosphereView
            siteTitle={siteConfig.title} current={current} hourly={hourly} selectedHour={selectedHour} selectedTime={selectedTime}
            onSelectHour={setHourIndex} simulation={simulation} onClearSimulation={clearSimulation}
            layer={layer} onLayer={setLayer} paused={scenePaused} onTogglePaused={() => setScenePaused((p) => !p)}
          />
        );
      case 'simulation':
        return (
          <SimulationView
            scenario={scenario} onScenario={setScenario} intensity={intensity} onIntensity={setIntensity}
            duration={duration} onDuration={setDuration} start={scenarioStart} onStart={setScenarioStart}
            busy={simBusy} error={simError} loadState={loadState} simulation={simulation} onRun={() => void runSimulation()}
          />
        );
      case 'aeios':
        return <AeiosView />;
      case 'station':
        return <StationView station={station} site={site} onSite={setSite} />;
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={skipToContent}>Skip to content</a>
      {drawerOpen && <div className="drawer-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />}
      <aside
        id="primary-nav" ref={sidebarRef} className={`sidebar ${drawerOpen ? 'is-open' : ''}`} aria-label="Primary navigation" onKeyDown={trapDrawer}
        {...(compact && !drawerOpen ? { 'aria-hidden': true, inert: '' as unknown as undefined } : {})}
      >
        <button ref={closeBtnRef} className="drawer-close" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}><X size={20} aria-hidden="true" /></button>
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /></div>
          <div><div className="brand-name">AEIOS<span> / SENTINEL</span></div><div className="brand-caption">ENVIRONMENTAL INTELLIGENCE</div></div>
        </div>
        {VIEW_GROUPS.map(({ group, label, views }) => (
          <Fragment key={group}>
            <div className="side-group-label">{group}</div>
            <nav className="side-nav" aria-label={label}>
              {views.map(({ id, label: name, icon: Icon }) => (
                <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => openView(id)}><Icon size={17} aria-hidden="true" /> {name}</button>
              ))}
            </nav>
          </Fragment>
        ))}
        <div className="sidebar-divider" />
        <div className="side-group-label">OBSERVATION ZONES</div>
        <button className={`site-link ${site === 'sgt' ? 'selected' : ''}`} onClick={() => setSite('sgt')}><span className="site-dot sgt-dot" /><span><b>SGT University</b><small>Budhera campus</small></span></button>
        <button className={`site-link ${site === 'chandu' ? 'selected' : ''}`} onClick={() => setSite('chandu')}><span className="site-dot chandu-dot" /><span><b>Chandu village</b><small>Gurugram, Haryana</small></span></button>
        <div className="sidebar-bottom">
          <div className="node-health-card">
            <div className="node-health-head">LOCAL EDGE NODE</div>
            <b>Raspberry Pi 5 · node-gateway</b>
            <small>Local model inference · syncs to cloud</small>
            <div className="health-foot"><span><ShieldCheck size={12} /> Real data only; live state is in Operational health</span></div>
          </div>
          <div className="side-footer">AEIOS WEATHER SYSTEM <span>v0.1.0</span></div>
        </div>
      </aside>

      <main id="main-content" tabIndex={-1} className="main-content" aria-hidden={compact && drawerOpen ? true : undefined}>
        <ScrollProgress />
        <header className="topbar">
          <div className="topbar-left">
            <button ref={menuBtnRef} className="menu-button" aria-label="Open navigation" aria-expanded={drawerOpen} aria-controls="primary-nav" onClick={() => setDrawerOpen(true)}><Menu size={20} aria-hidden="true" /></button>
            <div className="breadcrumb"><span>AEIOS</span><i>/</i><b aria-current="page">{VIEW_BY_ID[view].label}</b></div>
          </div>
          <div className="topbar-actions">
            <span className="timezone-chip">IST · UTC+05:30</span>
            <button className="icon-button" onClick={() => void load(false)} title="Refresh weather data" aria-label="Refresh weather data"><RefreshCw size={16} className={loadState === 'loading' ? 'spin' : ''} /></button>
            <button className="avatar-chip" onClick={onSignOut} title={userEmail ? `${userEmail} — click to sign out` : 'Sign out'} aria-label={userEmail ? `Sign out ${userEmail}` : 'Sign out'}>{(userEmail[0] || 'A').toUpperCase()}</button>
          </div>
        </header>

        <SmokeBanner />

        <ModelRunContext.Provider value={modelRun}>
          <ViewStage view={view} order={VIEW_IDS}>{renderView(view)}</ViewStage>
        </ModelRunContext.Provider>

        <footer className="app-footer"><div><b>AEIOS SENTINEL</b><span>Local environmental intelligence for SGT University and Chandu village.</span></div><div className="footer-provenance"><span>WEATHER: OPEN-METEO</span><span>AIR QUALITY: CAMS</span><span>TIMEZONE: ASIA/KOLKATA</span></div><div className="footer-disclaimer">External model data is regional context. Local station data, model forecasts and scenario simulations are always identified separately.</div></footer>
      </main>
    </div>
  );
}
