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
 while((node=walker.nextNode())){const parent=node.parentElement!;if(['BUTTON','SVG','STYLE'].includes(parent.tagName)||!parent.getClientRects().length)continue;const style=getComputedStyle(parent);if(style.display==='none')continue;ctx.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;ctx.fillStyle=style.color;ctx.textBaseline='top';const text=node.textContent||'';const re=/\S+/g;let match:RegExpExecArray|null;while((match=re.exec(text))){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);const r=range.getBoundingClientRect();ctx.fillText(match[0],r.left-bounds.left,r.top-bounds.top+1);}}
 for(const svg of element.querySelectorAll<SVGSVGElement>('svg')){
  const r=svg.getBoundingClientRect();if(!r.width)continue;try{const copy=svg.cloneNode(true) as SVGSVGElement;copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('color',getComputedStyle(svg).color);const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(copy));await img.decode();ctx.drawImage(img,r.left-bounds.left,r.top-bounds.top,r.width,r.height);}catch{/* Optional icons do not block deletion. */}
 }
 return canvas;
}
export async function animateMessageDeletion(ids:string[]){
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const rows=[...document.querySelectorAll<HTMLElement>('[data-message-id]')].filter(row=>ids.includes(row.dataset.messageId||''));
 await Promise.all(rows.map(async row=>{
  const bubble=row.querySelector<HTMLElement>('.bubble');if(!bubble)return;const bounds=bubble.getBoundingClientRect();if(bounds.bottom<0||bounds.top>innerHeight)return;
  let source:HTMLCanvasElement;try{source=await snapshot(bubble);}catch{return;}
  const overlay=document.createElement('canvas');overlay.className='deletion-dust';overlay.width=Math.ceil(bounds.width+160);overlay.height=Math.ceil(bounds.height+110);overlay.style.cssText=`position:fixed;pointer-events:none;z-index:100;left:${bounds.left-40}px;top:${bounds.top-60}px;width:${overlay.width}px;height:${overlay.height}px`;
  const ctx=overlay.getContext('2d')!;const pixels=source.getContext('2d')!.getImageData(0,0,source.width,source.height).data;
  const particles:{x:number;y:number;r:number;g:number;b:number;a:number;delay:number;vx:number;vy:number}[]=[];
  const step=Math.max(2,Math.ceil(Math.sqrt(source.width*source.height/6500)));
  for(let y=0;y<source.height;y+=step)for(let x=0;x<source.width;x+=step){const i=(y*source.width+x)*4;if(pixels[i+3]>20)particles.push({x,y,r:pixels[i],g:pixels[i+1],b:pixels[i+2],a:pixels[i+3]/255,delay:(1-x/source.width)*.22+Math.random()*.12,vx:25+Math.random()*90,vy:-35+Math.random()*70});}
  document.body.append(overlay);bubble.style.visibility='hidden';row.classList.add('is-deleting');
  await new Promise<void>(resolve=>{let start:number|undefined;function draw(now:number){start??=now;const t=(now-start)/1000;ctx.clearRect(0,0,overlay.width,overlay.height);for(const p of particles){const v=Math.max(0,Math.min(1,(t-p.delay)/.65));ctx.fillStyle=`rgba(${p.r},${p.g},${p.b},${p.a*(1-v)})`;ctx.fillRect(p.x+40+p.vx*v,p.y+60+p.vy*v-18*v*v,Math.max(.5,step*(1-v*.55)),Math.max(.5,step*(1-v*.55)));}if(t<1.05&&row.isConnected)requestAnimationFrame(draw);else resolve();}requestAnimationFrame(draw);});
  overlay.remove();
  const height=row.getBoundingClientRect().height;await row.animate([{height:`${height}px`,minHeight:`${height}px`,marginTop:getComputedStyle(row).marginTop},{height:'0px',minHeight:'0px',marginTop:'0px'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'}).finished.catch(()=>undefined);
 }));
}
