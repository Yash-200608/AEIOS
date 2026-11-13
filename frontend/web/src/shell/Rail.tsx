import { Fragment } from 'react';
import { m } from 'motion/react';
import MotionReady from '../motion/MotionReady';
import { useMotionPolicy } from '../motion/useMotionPolicy';
import { VIEW_GROUPS, type ViewId } from './viewRegistry';

/*
 * The navigation rail: 72 px of icons that widens to 248 px over the content on hover or keyboard focus, so the stage keeps
 * its full width. An accent bar slides between items when the view changes (a shared layout animation; an instant move under
 * reduced motion). Labels are always in the accessibility tree; only their visibility changes.
 */
export default function Rail({ view, onOpen }: { view: ViewId; onOpen: (id: ViewId) => void }) {
  const { reduced } = useMotionPolicy();
  return (
    <MotionReady>
      <aside id="primary-nav" className="dk-rail" aria-label="Primary navigation">
        <div className="dk-rail__brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div className="dk-rail__brand-text">
            <div className="brand-name">AEIOS<span> / SENTINEL</span></div>
            <div className="brand-caption">ENVIRONMENTAL INTELLIGENCE</div>
          </div>
        </div>
        {VIEW_GROUPS.map(({ group, label, views }) => (
          <Fragment key={group}>
            <div className="dk-rail__group" aria-hidden="true"><span>{group}</span></div>
            <nav className="dk-rail__nav" aria-label={label}>
              {views.map(({ id, label: name, icon: Icon }) => {
                const active = view === id;
                return (
                  <button key={id} type="button" className={active ? 'dk-rail__item is-active' : 'dk-rail__item'} aria-current={active ? 'page' : undefined} onClick={() => onOpen(id)}>
                    {active && (
                      <m.span
                        layoutId="rail-active" className="dk-rail__active" aria-hidden="true"
                        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
                      />
                    )}
                    <span className="dk-rail__icon"><Icon size={18} aria-hidden="true" /></span>
                    <span className="dk-rail__label">{name}</span>
                  </button>
                );
              })}
            </nav>
          </Fragment>
        ))}
        <div className="dk-rail__foot">
          <span className="dk-rail__label">AEIOS WEATHER SYSTEM v0.1.0</span>
        </div>
      </aside>
    </MotionReady>
  );
}

