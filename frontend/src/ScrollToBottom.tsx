import { useEffect, useState, type RefObject } from 'react';
import { ChevronDown } from 'lucide-react';

export default function ScrollToBottom({ scroll, enabled, onActivate, forceVisible = false }: {
  scroll: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  onActivate: () => void;
  forceVisible?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = scroll.current;
    if (!node || !enabled) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      setVisible(node.clientHeight > 0 && node.scrollHeight - node.clientHeight - node.scrollTop > 8);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener('scroll', schedule, { passive: true });
    schedule();
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', schedule);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scroll, enabled]);

  if (!enabled || (!visible && !forceVisible)) return null;
  return <button className="scroll-to-bottom icon-button glass" type="button" aria-label="К последним сообщениям" onClick={() => {
    onActivate();
    const node = scroll.current;
    node?.scrollTo({ top: node.scrollHeight, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }}><ChevronDown size={24} aria-hidden="true" /></button>;
}
