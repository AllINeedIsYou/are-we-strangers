import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { useBlobURL } from './MediaView';

type Point={x:number;y:number};
const side=320;
export default function AvatarCropDialog({file,onClose,onSave}:{file:File;onClose:()=>void;onSave:(blob:Blob)=>Promise<void>}){
 const dialog=useRef<HTMLDialogElement>(null),stage=useRef<HTMLDivElement>(null),preview=useRef<HTMLCanvasElement>(null);
 const bitmap=useRef<ImageBitmap|null>(null);
 const [dimensions,setDimensions]=useState({width:0,height:0});
 const [center,setCenter]=useState<Point>({x:160,y:160}),[zoom,setZoom]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const drag=useRef<Point|null>(null);const url=useBlobURL(file);
 const scale=dimensions.width?Math.min(side/dimensions.width,side/dimensions.height):1;
 const width=dimensions.width*scale,height=dimensions.height*scale,left=(side-width)/2,top=(side-height)/2;
 const radius=Math.min(width,height)*.43/zoom;
 function clamp(point:Point,r=radius){return {x:Math.max(left+r,Math.min(left+width-r,point.x)),y:Math.max(top+r,Math.min(top+height-r,point.y))};}
 useEffect(()=>{const node=dialog.current!;node.showModal();return()=>node.close();},[]);
 useEffect(()=>{let alive=true;let image:ImageBitmap|null=null;if(!file.type.startsWith('image/')||file.type==='image/svg+xml'||file.size>20*1024*1024){setError('Выбери фотографию JPG, PNG или WebP до 20 МБ.');return;}
 createImageBitmap(file).then(value=>{image=value;if(!alive){value.close();return;}bitmap.current=value;setDimensions({width:value.width,height:value.height});}).catch(()=>{if(alive)setError('Не удалось открыть фотографию. Попробуй JPG или PNG.');});return()=>{alive=false;image?.close();bitmap.current=null;};},[file]);
 function paint(canvas:HTMLCanvasElement){const image=bitmap.current;if(!image||!radius)return;const draw=canvas.getContext('2d')!;draw.clearRect(0,0,canvas.width,canvas.height);draw.drawImage(image,(center.x-radius-left)/scale,(center.y-radius-top)/scale,radius*2/scale,radius*2/scale,0,0,canvas.width,canvas.height);}
 useEffect(()=>{if(preview.current)paint(preview.current);},[center,zoom,dimensions]);
 function point(event:React.PointerEvent){const rect=stage.current!.getBoundingClientRect();return {x:(event.clientX-rect.left)*side/rect.width,y:(event.clientY-rect.top)*side/rect.height};}
 async function save(){if(!bitmap.current||busy)return;setBusy(true);setError('');try{const canvas=document.createElement('canvas');canvas.width=canvas.height=512;paint(canvas);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Не удалось сохранить область.')),'image/jpeg',.92));await onSave(blob);}catch(cause){setError(cause instanceof Error?cause.message:'Не удалось сохранить аватар.');setBusy(false);}}
 return <dialog ref={dialog} className="modal glass avatar-crop-dialog" aria-label="Выбрать область аватара" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
 <header><h2>Выбери аватар</h2><button type="button" className="icon-button" aria-label="Закрыть редактор аватара" disabled={busy} onClick={onClose}><X/></button></header>
 <p className="crop-hint">Перемещай круг — внутри него будущий аватар.</p>
 <div ref={stage} className="avatar-crop-stage" onPointerDown={event=>{if(!dimensions.width||busy)return;event.currentTarget.setPointerCapture(event.pointerId);const p=point(event);if(Math.hypot(p.x-center.x,p.y-center.y)<=radius)drag.current={x:p.x-center.x,y:p.y-center.y};else{drag.current={x:0,y:0};setCenter(clamp(p));}}} onPointerMove={event=>{if(!drag.current)return;const p=point(event);setCenter(clamp({x:p.x-drag.current.x,y:p.y-drag.current.y}));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
 {url&&<img src={url} alt="Фотография для аватара" draggable={false}/>}
 {dimensions.width>0&&<><svg viewBox="0 0 320 320" aria-hidden="true"><defs><mask id="avatar-crop-mask"><rect width="320" height="320" fill="white"/><circle cx={center.x} cy={center.y} r={radius} fill="black"/></mask></defs><rect width="320" height="320" fill="#000a" mask="url(#avatar-crop-mask)"/><circle cx={center.x} cy={center.y} r={radius} fill="none" stroke="#fff" strokeWidth="1.5"/></svg><div className="crop-handle" role="slider" tabIndex={0} aria-label="Положение круга аватара" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(center.x/side*100)} aria-valuetext={`По горизонтали ${Math.round(center.x/side*100)}%, по вертикали ${Math.round(center.y/side*100)}%`} style={{left:`${(center.x-radius)/side*100}%`,top:`${(center.y-radius)/side*100}%`,width:`${radius*2/side*100}%`,height:`${radius*2/side*100}%`}} onKeyDown={e=>{const step=e.shiftKey?10:2;const delta:Record<string,Point>={ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}};const d=delta[e.key];if(d){e.preventDefault();setCenter(clamp({x:center.x+d.x,y:center.y+d.y}));}}}/></>}
 </div>
 <div className="crop-adjust"><Minus size={17}/><input type="range" aria-label="Масштаб области аватара" min="1" max="3" step=".01" value={zoom} disabled={!dimensions.width||busy} onChange={e=>{const value=Number(e.target.value);const r=Math.min(width,height)*.43/value;setZoom(value);setCenter(clamp(center,r));}}/><Plus size={17}/><canvas ref={preview} width="64" height="64" aria-label="Предпросмотр аватара"/></div>
 {error&&<p className="inline-error" role="alert">{error}</p>}
 <div className="modal-actions"><button className="secondary" disabled={busy} onClick={onClose}>Отмена</button><button className="primary" disabled={!dimensions.width||busy} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить аватар'}</button></div>
 </dialog>;
}
