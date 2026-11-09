import { useLayoutEffect, useRef, type ReactNode } from 'react';

export default function CenteredAuth({ active, register, children }: { active: boolean; register: boolean; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = root.current;
    const form = element?.querySelector<HTMLElement>('.auth-form');
    const brand = element?.querySelector<HTMLElement>('.brand');
    if (!element || !form || !brand) return;
    function measure() {
      if (!element || !form || !brand) return;
      const style = getComputedStyle(element);
      const scale = Number(style.getPropertyValue('--auth-brand-scale')) || .78;
      const gap = parseFloat(style.getPropertyValue('--auth-brand-gap')) || 28;
      // offsetHeight is unaffected by the entrance transform, so measuring during
      // the animation cannot move its target or cause a jump at the end.
      const brandHeight = brand.offsetHeight * scale;
      element.style.setProperty('--auth-brand-height', `${brandHeight}px`);
      element.style.setProperty('--auth-content-height', `${brandHeight + gap + form.offsetHeight}px`);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(form); observer.observe(brand);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [active, register]);
  return <main ref={root} className={`auth-screen centered-auth ${active ? 'auth-open' : ''} ${register ? 'auth-register' : ''}`}>{children}</main>;
}
