import { useEffect, useRef, type RefObject } from 'react';

export default function useAutoHistory({ scroll, boundary, viewKey, enabled, history, load, direction = 'older' }: {
  scroll: RefObject<HTMLDivElement | null>;
  boundary: RefObject<HTMLDivElement | null>;
  viewKey: string;
  enabled: boolean;
  history?: { loading: boolean; hasOlder: boolean; error: string };
  load: () => Promise<void>;
  direction?: 'older' | 'newer';
}) {
  const current = useRef({ viewKey, enabled, history, load });
  current.current = { viewKey, enabled, history, load };

  useEffect(() => {
    const root = scroll.current, target = boundary.current;
    if (!root || !target || !enabled || !history?.hasOlder || history.loading || history.error) return;
    let active = true, pending = false;
    const observer = new IntersectionObserver(entries => {
      const next = current.current;
      if (!active || pending || next.viewKey !== viewKey || !next.enabled
        || !next.history?.hasOlder || next.history.loading || next.history.error
        || document.visibilityState !== 'visible' || root.clientHeight === 0
        || !entries.some(entry => entry.isIntersecting)) return;
      pending = true;
      void next.load().finally(() => { pending = false; });
    }, { root, rootMargin: direction === 'older' ? '160px 0px 0px 0px' : '0px 0px 160px 0px' });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); };
  }, [scroll, boundary, viewKey, enabled, history?.loading, history?.hasOlder, history?.error, direction]);
}
