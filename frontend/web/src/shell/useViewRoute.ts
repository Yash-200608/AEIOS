import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/*
 * A tiny hash router for the command center's views (no library).
 *
 *  - Routes are '#/<viewId>'. The page-section anchors used before views existed ('#station') and a few aliases for sections
 *    inside a view ('#pm-forecast') still resolve; the address bar is then rewritten to the canonical '#/<viewId>' with
 *    replaceState (no extra history entry). An unknown route ('#/nope') shows the fallback view.
 *  - navigate() pushes a history entry, so Back and Forward move between views. popstate and hashchange are both handled;
 *    the second event for the same entry is a no-op.
 *  - A fragment that is not a route (the skip link's '#main-content') is an in-page jump and never changes the view.
 *  - In-app anchors (<a href="#smoke">, including ones whose own handler calls preventDefault and scrolls) are routed by one
 *    capture-phase click listener on the document, so a link to a view that is not mounted still opens it.
 *  - Scroll restoration is manual while the router is mounted: the stage scrolls each new view to its top itself, and the
 *    browser must not jump the outgoing view to an old position in the middle of the transition.
 *
 * The query string (?preview&fixture=normal) is never touched: only the fragment changes.
 */

type Parsed<T extends string> = { view: T; canonical: boolean } | { fragment: string };
type Aliases<T extends string> = Readonly<Record<string, T>>;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const keyOf = (target: string) => decode(target.replace(/^#/, '').replace(/^\//, '')).replace(/\/+$/, '');

function lookup<T extends string>(key: string, ids: readonly T[], aliases: Aliases<T>): T | null {
  if ((ids as readonly string[]).includes(key)) return key as T;
  return Object.prototype.hasOwnProperty.call(aliases, key) ? aliases[key] : null;
}

/** Pure: what a URL fragment means. `canonical` is false when the address bar should be rewritten to '#/<view>'. */
export function parseViewHash<T extends string>(hash: string, ids: readonly T[], fallback: T, aliases: Aliases<T> = {}): Parsed<T> {
  const raw = hash.replace(/^#/, '');
  if (raw === '') return { view: fallback, canonical: true }; // no fragment: the landing view, URL left alone
  const key = keyOf(raw);
  const known = lookup(key, ids, aliases);
  if (raw.startsWith('/')) return { view: known ?? fallback, canonical: known !== null && raw === `/${known}` };
  return known ? { view: known, canonical: false } : { fragment: key };
}

export type ViewRoute<T extends string> = {
  view: T;
  /** Open a view by id ('station'), route ('#/station') or legacy anchor ('#station'). False when nothing changed. */
  navigate: (target: string) => boolean;
};

export function useViewRoute<T extends string>(ids: readonly T[], fallback: T, aliases: Aliases<T> = {}): ViewRoute<T> {
  const config = useRef({ ids, fallback, aliases });
  useLayoutEffect(() => {
    config.current = { ids, fallback, aliases }; // read by event handlers and listeners, never during render
  });

  const [view, setView] = useState<T>(() => {
    const p = parseViewHash(typeof window === 'undefined' ? '' : window.location.hash, ids, fallback, aliases);
    return 'view' in p ? p.view : fallback;
  });
  const current = useRef(view);

  const apply = useCallback((next: T) => {
    current.current = next;
    setView(next);
  }, []);

  const navigate = useCallback(
    (target: string): boolean => {
      const c = config.current;
      const next = lookup(keyOf(target), c.ids, c.aliases);
      if (next === null) {
        // An unknown id from code is a programming error, not a reason to send the user back to the landing view.
        if (import.meta.env.DEV) console.warn(`[views] unknown view "${target}"`);
        return false;
      }
      if (next === current.current) return false;
      try {
        window.history.pushState({ aeiosView: next }, '', `#/${next}`);
      } catch {
        window.location.hash = `/${next}`; // pushState refused (sandboxed frame): the hashchange handler applies it
        return true;
      }
      apply(next);
      return true;
    },
    [apply],
  );

  useEffect(() => {
    const history = window.history;
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';

    const sync = () => {
      const c = config.current;
      const p = parseViewHash(window.location.hash, c.ids, c.fallback, c.aliases);
      if (!('view' in p)) return; // an in-page fragment, not a route
      if (!p.canonical) history.replaceState(history.state, '', `#/${p.view}`);
      if (p.view !== current.current) apply(p.view);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') ?? '';
      if (!href.startsWith('#') || keyOf(href) === '') return;
      const c = config.current;
      const next = lookup(keyOf(href), c.ids, c.aliases);
      if (next === null) return; // an in-page fragment (or an unknown route the hashchange handler resolves)
      if (!href.startsWith('#/') && next === current.current) return; // legacy anchor inside the open view: its own handler
      e.preventDefault();
      navigate(href);
    };

    sync(); // canonicalises a legacy or unknown initial fragment, and catches a change made before this effect ran
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
      document.removeEventListener('click', onClick, true);
      history.scrollRestoration = previousRestoration;
    };
  }, [apply, navigate]);

  return { view, navigate };
}
