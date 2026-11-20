export type ArchiveBurnDirection = 'up' | 'out';

type Ember = { x: number; y: number; vx: number; vy: number; age: number; life: number; radius: number; phase: number; color: string };

// The real card is masked, so text and layout stay sharp at any size. Only the
// red embers are drawn on canvas; their radius is always measured in CSS pixels.
export function animateArchiveBurn(card: HTMLElement, direction: ArchiveBurnDirection, signal: AbortSignal): Promise<void> {
  if (signal.aborted || !card.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const initial = card.getBoundingClientRect();
  if (!initial.width || !initial.height || initial.bottom < 0 || initial.top > innerHeight) return Promise.resolve();
  const host = card.closest<HTMLDialogElement>('dialog[open]') ?? document.body;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve();
  canvas.className = 'archive-burn-embers';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.direction = direction;
  const insideDialog = host !== document.body;
  canvas.style.cssText = `position:${insideDialog ? 'absolute' : 'fixed'};left:0;top:0;pointer-events:none;z-index:150;`;
  const properties = ['clip-path', 'mask-image', '-webkit-mask-image', 'pointer-events', 'overflow'];
  const previous = properties.map(name => [name, card.style.getPropertyValue(name), card.style.getPropertyPriority(name)] as const);
  const previousMarker = card.dataset.archiveBurn;
  const embers: Ember[] = [];
  const colors = ['#ff294e', '#ed123d', '#c80a30', '#ff576d'];
  const phase = Math.random() * Math.PI * 2;
  const duration = 1120, tail = 270;
  let frame = 0, collapse: Animation | undefined, last = performance.now(), started = last, settled = false;
  let hostRect = insideDialog ? host.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
  let scale = Math.min(window.devicePixelRatio || 1, 1.5);
  let width = 0, height = 0;
  card.dataset.archiveBurn = direction;
  card.style.pointerEvents = 'none';
  host.append(canvas);

  return new Promise<void>(resolve => {
    function finish(reset: boolean) {
      cancelAnimationFrame(frame); clearTimeout(watchdog); canvas.remove();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      if (reset) {
        collapse?.cancel();
        for (const [name, value, priority] of previous) {
          if (value) card.style.setProperty(name, value, priority);
          else card.style.removeProperty(name);
        }
        if (previousMarker === undefined) delete card.dataset.archiveBurn;
        else card.dataset.archiveBurn = previousMarker;
        delete card.dataset.archiveBurnProgress;
        signal.removeEventListener('abort', abort);
      }
      if (!settled) { settled = true; resolve(); }
    }
    const abort = () => finish(true);
    const hide = () => finish(true);
    const visibility = () => { if (document.visibilityState === 'hidden') finish(true); };
    // Resolve even if the browser pauses animation frames in a hidden window.
    const watchdog = setTimeout(() => finish(true), duration + tail + 700);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide, { once: true });

    function resize() {
      hostRect = insideDialog ? host.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      if (width !== Math.ceil(hostRect.width) || height !== Math.ceil(hostRect.height)) {
        width = Math.ceil(hostRect.width); height = Math.ceil(hostRect.height);
        scale = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      }
      context!.setTransform(scale, 0, 0, scale, 0, 0);
    }
    function spark(x: number, y: number, dx: number, dy: number) {
      if (embers.length >= 650 || x < -20 || x > width + 20 || y < -25 || y > height + 25) return;
      embers.push({ x, y, vx: dx + (Math.random() - .5) * 30, vy: dy - 18 - Math.random() * 30, age: 0,
        life: 330 + Math.random() * 340, radius: .8 + Math.random() * 1.05, phase: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)] });
    }
    function draw(now: number) {
      if (signal.aborted || !card.isConnected) { finish(true); return; }
      resize(); context!.clearRect(0, 0, width, height);
      const elapsed = now - started, dt = Math.min(35, now - last); last = now;
      const progress = Math.min(1, elapsed / duration);
      const rect = card.getBoundingClientRect();
      const x = rect.left - hostRect.left, y = rect.top - hostRect.top;
      const w = initial.width, h = initial.height;
      card.dataset.archiveBurnProgress = progress.toFixed(3);
      if (progress < 1) {
        context!.save(); context!.beginPath(); context!.rect(x, y, w, h); context!.clip();
        context!.strokeStyle = '#ff3156'; context!.lineWidth = 1.5;
        context!.shadowColor = '#f71948'; context!.shadowBlur = 10;
        context!.beginPath();
        if (direction === 'up') {
          const front = h + 10 - (h + 25) * progress;
          const edge = (at: number) => front + Math.sin(at * .038 + phase + progress * 5) * 4 + Math.sin(at * .089 + phase * 2) * 2;
          const points = [`0px 0px`, `${w}px 0px`];
          for (let at = w; at >= 0; at -= Math.max(1, w / 60)) points.push(`${at.toFixed(1)}px ${Math.max(0, Math.min(h, edge(at))).toFixed(1)}px`);
          points.push(`0px ${Math.max(0, Math.min(h, edge(0))).toFixed(1)}px`);
          card.style.clipPath = `polygon(${points.join(',')})`;
          for (let at = 0; at <= w; at += 5) {
            const py = edge(at);
            if (at === 0) context!.moveTo(x + at, y + py); else context!.lineTo(x + at, y + py);
            if (py >= 0 && py <= h && Math.random() < .28 * dt / 16.7) spark(x + at + Math.random() * 5, y + py, (Math.random() - .5) * 28, -20 - Math.random() * 35);
          }
        } else {
          const radius = (Math.hypot(w, h) / 2 + 22) * progress;
          const mask = `radial-gradient(circle at 50% 50%, transparent ${Math.max(0, radius - 7)}px, #000 ${radius + 7}px)`;
          card.style.setProperty('mask-image', mask); card.style.setProperty('-webkit-mask-image', mask);
          const samples = Math.min(300, Math.max(24, Math.ceil(2 * Math.PI * radius / 6)));
          for (let i = 0; i <= samples; i++) {
            const angle = i / samples * Math.PI * 2;
            const r = radius + Math.sin(angle * 9 + phase + progress * 4) * 2;
            const px = w / 2 + Math.cos(angle) * r, py = h / 2 + Math.sin(angle) * r;
            if (i === 0) context!.moveTo(x + px, y + py); else context!.lineTo(x + px, y + py);
            if (px >= 0 && px <= w && py >= 0 && py <= h && Math.random() < .3 * dt / 16.7) {
              const speed = 18 + Math.random() * 40;
              spark(x + px, y + py, Math.cos(angle) * speed, Math.sin(angle) * speed);
            }
          }
        }
        context!.stroke(); context!.restore();
      } else if (!collapse) {
        if (direction === 'up') card.style.clipPath = 'inset(100% 0 0 0)';
        else { card.style.setProperty('mask-image', 'linear-gradient(transparent, transparent)'); card.style.setProperty('-webkit-mask-image', 'linear-gradient(transparent, transparent)'); }
        const style = getComputedStyle(card);
        card.style.overflow = 'hidden';
        collapse = card.animate([
          { height: `${rect.height}px`, minHeight: '0px', marginTop: style.marginTop, marginBottom: style.marginBottom, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, borderTopWidth: style.borderTopWidth, borderBottomWidth: style.borderBottomWidth },
          { height: '0px', minHeight: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', borderTopWidth: '0px', borderBottomWidth: '0px' },
        ], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
      }
      const remaining = Math.max(0, 1 - Math.max(0, elapsed - duration) / tail);
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i]; p.age += dt;
        if (p.age >= p.life) { embers.splice(i, 1); continue; }
        const life = p.age / p.life;
        p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000;
        context!.globalAlpha = (1 - life) * remaining * (.7 + Math.sin(p.phase + life * 9) * .25);
        context!.fillStyle = p.color;
        context!.beginPath(); context!.arc(p.x + Math.sin(p.phase + life * 4) * life * 3, p.y, p.radius * (1 - life * .45), 0, Math.PI * 2); context!.fill();
      }
      context!.globalAlpha = 1;
      if (elapsed < duration + tail) frame = requestAnimationFrame(draw);
      else finish(false);
    }
    frame = requestAnimationFrame(draw);
  });
}
