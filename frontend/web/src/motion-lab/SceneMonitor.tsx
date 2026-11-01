import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { SourceLabel } from '../design/primitives';
import WeatherScene, { type SceneWeather } from '../components/WeatherScene';

/*
 * 3D scene loop monitor: the real WeatherScene, fed the same model hour as the rest of the Lab, plus a readout of how many
 * WebGL frames it renders per second. The readout samples the scene host's data-scene-active / data-scene-frames attributes
 * once a second (a 1 s interval is the monitor's only timer; the scene's own loop is untouched). Scroll the scene away,
 * hide the tab, pause it or force reduced motion: renders/s should fall to 0.
 */
type Sample = { active: string; frames: number | null; perSecond: number | null };

export default function SceneMonitor({ weather, validLabel }: { weather: SceneWeather; validLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [sample, setSample] = useState<Sample>({ active: 'unknown', frames: null, perSecond: null });

  useEffect(() => {
    let previous: number | null = null;
    const id = window.setInterval(() => {
      const host = box.current?.querySelector('[data-scene-frames], [data-scene-active]');
      const raw = host ? Number.parseInt(host.getAttribute('data-scene-frames') ?? '', 10) : Number.NaN;
      const frames = Number.isFinite(raw) ? raw : null;
      setSample({
        active: host?.getAttribute('data-scene-active') ?? 'unknown',
        frames,
        perSecond: frames !== null && previous !== null ? Math.max(0, frames - previous) : null,
      });
      previous = frames;
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="ml-scene" data-testid="scene-monitor">
      <div className="ml-flow__bar">
        <SourceLabel kind="regional" detail={`Open-Meteo · valid ${validLabel}`} />
        <button
          type="button"
          className="ax-btn"
          aria-pressed={paused}
          aria-label={paused ? 'Resume 3D scene' : 'Pause 3D scene'}
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />} {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <div className="ml-scene__view" ref={box}>
        <WeatherScene weather={weather} paused={paused} />
      </div>
      <dl className="ml-scene__stats">
        <div>
          <dt>Render loop</dt>
          <dd>{sample.active === 'true' ? 'running' : sample.active === 'false' ? 'stopped' : 'not reported'}</dd>
        </div>
        <div>
          <dt>Frames rendered</dt>
          <dd className="ax-mono">{sample.frames ?? 'not reported'}</dd>
        </div>
        <div>
          <dt>Renders/s</dt>
          <dd className="ax-mono">{sample.perSecond ?? '…'}</dd>
        </div>
      </dl>
      <p className="ml-status">
        The frame counter is written every 10 frames, so renders/s moves in steps of 10. Schematic scene; heights are not to scale.
      </p>
    </div>
  );
}
