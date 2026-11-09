/* Rasterize only visible message content locally; no screenshots or uploads. */
async function snapshot(element:HTMLElement){
 const bounds=element.getBoundingClientRect();const canvas=document.createElement('canvas');canvas.width=Math.ceil(bounds.width);canvas.height=Math.ceil(bounds.height);const ctx=canvas.getContext('2d')!;
 const circle=element.classList.contains('circle-bubble'),photo=element.classList.contains('photo-bubble');
 ctx.fillStyle=element.classList.contains('red-glass')?'#730017':'#252528';ctx.beginPath();ctx.roundRect(0,0,bounds.width,bounds.height,circle?bounds.width/2:20);if(!circle&&!photo)ctx.fill();
 for(const media of element.querySelectorAll<HTMLImageElement|HTMLVideoElement>('img,video')){
  const r=media.getBoundingClientRect();if(!r.width||!r.height)continue;
  try{ctx.save();ctx.beginPath();ctx.roundRect(r.left-bounds.left,r.top-bounds.top,r.width,r.height,circle?r.width/2:12);ctx.clip();ctx.drawImage(media,r.left-bounds.left,r.top-bounds.top,r.width,r.height);ctx.restore();}catch{/* A loading image may not have a frame yet. */}
 }
 const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null;
 while((node=walker.nextNode())){
  const parent=node.parentElement!;
  if(['BUTTON','SVG','STYLE'].includes(parent.tagName)||!parent.getClientRects().length)continue;
  const style=getComputedStyle(parent);
  if(style.display==='none')continue;
  ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.fillStyle=style.color;ctx.textBaseline='top';
  const text=node.textContent||'',re=/\S+/g;
  let match:RegExpExecArray|null;
  while((match=re.exec(text))){
   const range=document.createRange();
   const end=match.index+match[0].length;
   let start=match.index;
   while(start<end){
    // A long word can wrap over many lines. Paint each rendered line so its
    // white letters remain in the snapshot instead of disappearing off-canvas.
    range.setStart(node,start);range.setEnd(node,end);
    let last=end;
    if(range.getClientRects().length>1){
     let low=start+1,high=end;
     while(low<high){
      const middle=Math.ceil((low+high)/2);
      range.setEnd(node,middle);
      if(range.getClientRects().length<=1)low=middle;else high=middle-1;
     }
     last=low;
    }
    range.setEnd(node,last);
    const r=range.getBoundingClientRect();
    ctx.fillText(text.slice(start,last),r.left-bounds.left,r.top-bounds.top+1);
    start=last;
   }
  }
 }
 for(const svg of element.querySelectorAll<SVGSVGElement>('svg')){
  const r=svg.getBoundingClientRect();if(!r.width)continue;try{const copy=svg.cloneNode(true) as SVGSVGElement;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('color',getComputedStyle(svg).color);const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(copy));await img.decode();ctx.drawImage(img,r.left-bounds.left,r.top-bounds.top,r.width,r.height);}catch{/* Optional icons do not block deletion. */}
 }
 return canvas;
}
export async function animateMessageDeletion(ids: string[], signal?: AbortSignal) {
 if (signal?.aborted || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
 const rows = [...document.querySelectorAll<HTMLElement>('[data-message-id]')].filter(row => ids.includes(row.dataset.messageId || ''));
 await Promise.all(rows.map(async row => {
  const bubble = row.querySelector<HTMLElement>('.bubble');
  if (!bubble) return;
  const bounds = bubble.getBoundingClientRect();
  if (bounds.bottom < 0 || bounds.top > innerHeight) return;
  const visibility = bubble.style.visibility;
  let overlay: HTMLCanvasElement | undefined, collapse: Animation | undefined, frame = 0;
  let finishDust: (() => void) | undefined;
  let completed = false;
  const cancel = () => {
   cancelAnimationFrame(frame); overlay?.remove(); collapse?.cancel();
   bubble.style.visibility = visibility; row.classList.remove('is-deleting'); finishDust?.();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
   let source: HTMLCanvasElement;
   try { source = await snapshot(bubble); } catch { return; }
   if (signal?.aborted || !row.isConnected) return;
   overlay = document.createElement('canvas'); overlay.className = 'deletion-dust';
   overlay.width = Math.ceil(bounds.width + 160); overlay.height = Math.ceil(bounds.height + 110);
   overlay.style.cssText = `position:fixed;pointer-events:none;z-index:100;left:${bounds.left-40}px;top:${bounds.top-60}px;width:${overlay.width}px;height:${overlay.height}px`;
   const ctx = overlay.getContext('2d')!;
   const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data;
   const particles: { x:number; y:number; r:number; g:number; b:number; a:number; delay:number; vx:number; vy:number; phase:number; sway:number }[] = [];
   const particleRadius = 1.35; // CSS pixels; sampling density must never enlarge the dust.
   const visibleTop = Math.max(0, -bounds.top - 100);
   const visibleBottom = Math.min(source.height, innerHeight - bounds.top + 100);
   const step = Math.max(3, Math.ceil(Math.sqrt(source.width * (visibleBottom - visibleTop) / 24000)));
   for (let y=Math.floor(visibleTop/step)*step; y<visibleBottom; y+=step) for (let x=0; x<source.width; x+=step) {
    let px=Math.min(source.width-1,Math.floor(x+Math.random()*step));
    let py=Math.min(source.height-1,Math.floor(y+Math.random()*step));
    let i=(py*source.width+px)*4;
    // Keep the bright foreground: a random background sample must not erase
    // white lettering, timestamps or check marks from the dust colours.
    let brightness=540;
    for(let sy=y;sy<Math.min(y+step,source.height);sy++)for(let sx=x;sx<Math.min(x+step,source.width);sx++){
     const sample=(sy*source.width+sx)*4;
     const light=pixels[sample]+pixels[sample+1]+pixels[sample+2];
     if(pixels[sample+3]>80&&light>brightness){brightness=light;px=sx;py=sy;i=sample;}
    }
    if(pixels[i+3]>20)particles.push({
     x:px+(Math.random()-.5)*step*.7,y:py+(Math.random()-.5)*step*.7,
     r:pixels[i],g:pixels[i+1],b:pixels[i+2],a:pixels[i+3]/255,
     delay:(1-px/source.width)*.22+Math.random()*.12,
     vx:25+Math.random()*90,vy:-35+Math.random()*70,phase:Math.random()*Math.PI*2,sway:3+Math.random()*7,
    });
   }

   document.body.append(overlay); bubble.style.visibility = 'hidden'; row.classList.add('is-deleting');
   await new Promise<void>(resolve => {
    finishDust = resolve;
    let start: number | undefined;
    function draw(now: number) {
     start ??= now;
     const t=(now-start)/1000;
     ctx.clearRect(0,0,overlay!.width,overlay!.height);
     for (const p of particles) {
      const v=Math.max(0,Math.min(1,(t-p.delay)/.65));
      if (v === 1) continue;
      ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},${p.a*(1-v)})`;
      ctx.beginPath();
      ctx.arc(p.x+40+p.vx*v+Math.sin(p.phase+v*5)*p.sway*v,p.y+60+p.vy*v-18*v*v+Math.cos(p.phase+v*4)*p.sway*v,particleRadius*(1-v*.55),0,Math.PI*2);
      ctx.fill();
     }
     if (t<1.05 && row.isConnected && !signal?.aborted) frame=requestAnimationFrame(draw); else resolve();
    }
    frame=requestAnimationFrame(draw);
   });
   if (signal?.aborted) return;
   overlay.remove();
   const height=row.getBoundingClientRect().height;
   collapse=row.animate([{height:`${height}px`,minHeight:`${height}px`,marginTop:getComputedStyle(row).marginTop},{height:'0px',minHeight:'0px',marginTop:'0px'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
   await collapse.finished.catch(() => undefined);
   completed = true;
  } finally {
   overlay?.remove(); signal?.removeEventListener('abort', cancel);
   if (signal?.aborted || !completed) cancel();
  }
 }));
}
