import { useEffect, useRef, type RefObject } from 'react';

type Options = {
  scroll: RefObject<HTMLDivElement | null>;
  viewKey: string;
  selectedIds: string[];
  limit: number;
  onSelect: (ids: string[]) => void;
  onMenu: (id: string, x: number, y: number) => void;
};

type Gesture = {
  input: 'mouse' | 'touch';
  pointer: number;
  anchor: string;
  initial: string[];
  x: number;
  y: number;
  currentY: number;
  armed: boolean;
  dragging: boolean;
  edge: string | undefined;
};

export default function useDragSelection(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const { scroll, viewKey } = options;

  useEffect(() => {
    const node = scroll.current;
    if (!node || !viewKey) return;
    let gesture: Gesture | null = null;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let suppressClickUntil = 0;

    function stop() {
      gesture = null;
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      frame = 0;
      node!.classList.remove('drag-selecting');
    }

    function start(input: Gesture['input'], pointer: number, target: EventTarget | null, x: number, y: number) {
      suppressClickUntil = 0;
      if (gesture || !(target instanceof Element)) return;
      if (target.closest('button:not(.selection-check), a, input, video, audio')) return;
      if (input === 'touch' && !target.closest('.bubble, .selection-check')) return;
      const anchor = target.closest<HTMLElement>('[data-message-id]')?.dataset.messageId;
      if (!anchor) return;
      gesture = { input, pointer, anchor, initial: latest.current.selectedIds, x, y, currentY: y, armed: input === 'mouse', dragging: false, edge: undefined };
      if (input === 'touch') {
        hold = setTimeout(() => { if (gesture) gesture.armed = true; }, 450);
      }
    }

    function selectTo(current: Gesture, y: number) {
      const rows = [...node!.querySelectorAll<HTMLElement>('[data-message-id]')];
      const anchor = rows.findIndex(row => row.dataset.messageId === current.anchor);
      if (anchor < 0) { stop(); return; }
      let low = 0, high = rows.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (rows[middle].getBoundingClientRect().bottom < y) low = middle + 1;
        else high = middle;
      }
      if (current.edge === rows[low].dataset.messageId) return;
      current.edge = rows[low].dataset.messageId;
      const selection = new Set(current.initial);
      const removing = selection.has(current.anchor);
      const direction = low < anchor ? -1 : 1;
      for (let index = anchor; index !== low + direction; index += direction) {
        const id = rows[index].dataset.messageId!;
        if (removing) selection.delete(id);
        else if (selection.size < latest.current.limit) selection.add(id);
      }
      latest.current.onSelect([...selection]);
    }

    function selectionBounds() {
      const bounds = node!.getBoundingClientRect();
      const style = getComputedStyle(node!);
      const top = bounds.top + (parseFloat(style.scrollPaddingTop) || 0);
      const bottom = bounds.bottom - (parseFloat(style.scrollPaddingBottom) || 0);
      return { top, bottom: Math.max(top, bottom) };
    }

    function autoScroll() {
      frame = 0;
      const current = gesture;
      if (!current?.dragging) return;
      const { top, bottom } = selectionBounds();
      const y = Math.max(top, Math.min(bottom, current.currentY));
      const distance = y < top + 32 ? y - (top + 32) : Math.max(0, y - (bottom - 32));
      const previousScroll = node!.scrollTop;
      if (distance) node!.scrollTop += Math.sign(distance) * Math.ceil(Math.abs(distance) / 3);
      selectTo(current, y);
      if (gesture && node!.scrollTop !== previousScroll) frame = requestAnimationFrame(autoScroll);
    }

    function move(x: number, y: number, event: Event) {
      const current = gesture;
      if (!current) return;
      current.currentY = y;
      const vertical = Math.abs(y - current.y);
      const horizontal = Math.abs(x - current.x);
      if (!current.armed) {
        if (Math.hypot(horizontal, vertical) > 9) stop();
        return;
      }
      if (!current.dragging && vertical >= 7 && vertical >= horizontal * .5) {
        current.dragging = true;
        node!.classList.add('drag-selecting');
        window.getSelection()?.removeAllRanges();
      }
      if (current.dragging) {
        if (event.cancelable) event.preventDefault();
        if (!frame) frame = requestAnimationFrame(autoScroll);
      }
    }

    function finish(cancelled: boolean) {
      const current = gesture;
      if (!current) return;
      if (current.dragging) {
        suppressClickUntil = performance.now() + 450;
        if (!cancelled) {
          const { top, bottom } = selectionBounds();
          selectTo(current, Math.max(top, Math.min(bottom, current.currentY)));
        }
      } else if (!cancelled && current.input === 'touch' && current.armed) {
        suppressClickUntil = performance.now() + 450;
        latest.current.onMenu(current.anchor, current.x, current.y);
      }
      stop();
    }

    const mouseDown = (event: PointerEvent) => { if (event.pointerType === 'mouse' && event.button === 0) start('mouse', event.pointerId, event.target, event.clientX, event.clientY); };
    const mouseMove = (event: PointerEvent) => { if (gesture?.input === 'mouse' && gesture.pointer === event.pointerId) { if (event.buttons & 1) move(event.clientX, event.clientY, event); else finish(true); } };
    const mouseUp = (event: PointerEvent) => { if (gesture?.input === 'mouse' && gesture.pointer === event.pointerId && event.button === 0) finish(false); };
    const pointerCancel = (event: PointerEvent) => { if (gesture?.input === 'mouse' && gesture.pointer === event.pointerId) finish(true); };
    const touchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { finish(true); return; }
      const touch = event.changedTouches[0];
      start('touch', touch.identifier, event.target, touch.clientX, touch.clientY);
    };
    const changedTouch = (event: TouchEvent) => gesture?.input === 'touch' && Array.from(event.changedTouches).find(touch => touch.identifier === gesture?.pointer);
    const touchMove = (event: TouchEvent) => { const touch = changedTouch(event); if (touch) move(touch.clientX, touch.clientY, event); };
    const touchEnd = (event: TouchEvent) => {
      if (!changedTouch(event)) return;
      if (gesture?.armed && event.cancelable) event.preventDefault();
      finish(event.type === 'touchcancel');
    };
    const click = (event: MouseEvent) => {
      if (event.detail && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
    };
    const contextMenu = (event: MouseEvent) => {
      if (gesture?.input === 'touch' || gesture?.dragging) { event.preventDefault(); event.stopPropagation(); }
    };
    const dragStart = (event: DragEvent) => { if (gesture) event.preventDefault(); };
    const blur = () => finish(true);
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (!gesture?.dragging && !latest.current.selectedIds.length) return;
      event.preventDefault();
      finish(true);
      latest.current.onSelect([]);
    };

    node.addEventListener('pointerdown', mouseDown);
    window.addEventListener('pointermove', mouseMove);
    window.addEventListener('pointerup', mouseUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', keyDown);
    node.addEventListener('touchstart', touchStart, { passive: true });
    node.addEventListener('touchmove', touchMove, { passive: false });
    node.addEventListener('touchend', touchEnd, { passive: false });
    node.addEventListener('touchcancel', touchEnd);
    node.addEventListener('click', click, true);
    node.addEventListener('contextmenu', contextMenu, true);
    node.addEventListener('dragstart', dragStart);
    return () => {
      stop();
      node.removeEventListener('pointerdown', mouseDown);
      window.removeEventListener('pointermove', mouseMove);
      window.removeEventListener('pointerup', mouseUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', keyDown);
      node.removeEventListener('touchstart', touchStart);
      node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('touchend', touchEnd);
      node.removeEventListener('touchcancel', touchEnd);
      node.removeEventListener('click', click, true);
      node.removeEventListener('contextmenu', contextMenu, true);
      node.removeEventListener('dragstart', dragStart);
    };
  }, [scroll, viewKey]);
}
