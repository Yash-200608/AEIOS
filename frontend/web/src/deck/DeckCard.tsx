import { useRef, type PointerEvent, type ReactNode } from 'react';
import { SourceLabel, type SourceKind } from '../design/primitives';

/* A card on the command deck: a cursor-following highlight (--mx/--my, written once per frame) and a lift on hover (CSS). */
export default function DeckCard({ title, source, sourceDetail, className, children, ...data }: {
  title: string; source?: SourceKind; sourceDetail?: string; className?: string; children: ReactNode; [k: `data-${string}`]: string | undefined;
}) {
  const ref = useRef<HTMLElement>(null);
  const raf = useRef(0);
  const onMove = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || raf.current) return;
    const { clientX, clientY } = e;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${clientX - r.left}px`);
      el.style.setProperty('--my', `${clientY - r.top}px`);
    });
  };
  return (
    <section ref={ref} className={className ? `dk-card ${className}` : 'dk-card'} onPointerMove={onMove} {...data}>
      <header className="dk-card__head">
        <h2 className="dk-card__title">{title}</h2>
        {source && <SourceLabel kind={source} detail={sourceDetail} />}
      </header>
      <div className="dk-card__body">{children}</div>
    </section>
  );
}
