// Runs the dispersion solver off the main thread and streams frames back as they are produced.
import { runDispersion, type Config, type Forcing, type Source } from './dispersion';

export type WorkerIn = { type: 'run'; cfg: Config; forcing: Forcing; sources: Source[] };
export type WorkerOut =
  | { type: 'frame'; t: number; c: Float32Array; progress: number }
  | { type: 'done'; diagnostics: ReturnType<typeof runDispersion>['diagnostics']; ms: number }
  | { type: 'error'; message: string };

const ctx = self as unknown as { postMessage: (m: WorkerOut, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null };

ctx.onmessage = (e) => {
  if (e.data.type !== 'run') return;
  try {
    const t0 = performance.now();
    const res = runDispersion(e.data.cfg, e.data.forcing, e.data.sources, (fr, progress) => {
      const copy = fr.c.slice();                          // the solver keeps its own frame; transfer a copy
      ctx.postMessage({ type: 'frame', t: fr.t, c: copy, progress }, [copy.buffer]);
    });
    ctx.postMessage({ type: 'done', diagnostics: res.diagnostics, ms: performance.now() - t0 });
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
