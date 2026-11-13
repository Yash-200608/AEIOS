import { useEffect, useRef, useState } from 'react';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { decodeFrame } from './motionMath';

/*
 * Text that decodes into place when it changes (and once on first appearance when `playOnMount` is set). The real text is
 * always in a visually hidden span and the animated span is aria-hidden, so assistive technology never reads the scramble. Reduced
 * motion and a hidden tab show the final text at once.
 */
export default function DecodeText({ text, className, durationMs = 700, playOnMount = false }: { text: string; className?: string; durationMs?: number; playOnMount?: boolean }) {
  const { reduced } = useMotionPolicy();
  const [shown, setShown] = useState(text);
  const previous = useRef<string | null>(playOnMount ? null : text);

  useEffect(() => {
    if (previous.current === text) return;
    previous.current = text;
    if (reduced || document.hidden) {
      setShown(text);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / durationMs;
      setShown(t >= 1 ? text : decodeFrame(text, t, Math.random));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, reduced, durationMs]);

  return (
    <span className={className}>
      <span className="dk-sr">{text}</span>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
