import { RotateCcw, SkipForward } from 'lucide-react';

/**
 * Skip / Replay for one reveal twin. Real buttons with accessible names; the state line is plain text (not a live region).
 * Skip is never disabled: disabling it when the reveal ends would drop keyboard focus, and animations must not move focus.
 */
export default function RevealControls({
  state,
  engine,
  skipLabel,
  replayLabel,
  onSkip,
  onReplay,
}: {
  state: 'playing' | 'done';
  engine: string;
  skipLabel: string;
  replayLabel: string;
  onSkip: () => void;
  onReplay: () => void;
}) {
  return (
    <div className="ml-controls ml-reveal__controls">
      <button type="button" className="ax-btn" aria-label={skipLabel} onClick={onSkip}>
        <SkipForward size={15} aria-hidden="true" /> Skip
      </button>
      <button type="button" className="ax-btn" aria-label={replayLabel} onClick={onReplay}>
        <RotateCcw size={15} aria-hidden="true" /> Replay
      </button>
      <span className="ml-status">
        {engine} reveal: <b>{state === 'playing' ? 'playing' : 'done'}</b>
      </span>
    </div>
  );
}
