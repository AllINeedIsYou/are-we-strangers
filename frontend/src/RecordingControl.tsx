import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Camera, LockKeyhole, Mic, Pause, Play, Send, Square, Trash2, X } from 'lucide-react';
import { useRecorder } from './useRecorder';
import { CirclePlayer, VoicePlayer, VideoTimeline, useBlobURL } from './MediaView';
import { formatDuration, type RecordingKind } from './recording';
import type { MediaAsset } from './domain';

export default function RecordingControl({slot,scene,onComplete,onActive,disabled=false,requestStream}:{slot:RefObject<HTMLDivElement|null>;scene:RefObject<HTMLElement|null>;onComplete:(asset:MediaAsset)=>void;onActive:(active:boolean)=>void;disabled?:boolean;requestStream?:(kind:RecordingKind)=>Promise<MediaStream>}) {
  const [mode,setMode]=useState<RecordingKind>(()=>{try{return localStorage.getItem('aws.recordMode')==='circle'?'circle':'voice';}catch{return 'voice';}});
  useEffect(()=>{try{localStorage.setItem('aws.recordMode',mode);}catch{/* mode remains available in memory */}},[mode]);
  const [locked,setLocked]=useState(false);
  const [menu,setMenu]=useState(false);
  const [offset,setOffset]=useState({x:0,y:0});
  const rec=useRecorder(onComplete,requestStream);
  const active=rec.phase!=='idle';
  const activeRef=useRef(active);activeRef.current=active;
  const lockedRef=useRef(locked);lockedRef.current=locked;
  const gesture=useRef<{x:number;y:number;held:boolean;timer:ReturnType<typeof setTimeout>}|null>(null);
  const suppress=useRef(false);
  const live=useRef<HTMLVideoElement>(null);
  const previewURL=useBlobURL(rec.blob);
  const onActiveRef=useRef(onActive);onActiveRef.current=onActive;
  useEffect(()=>{onActiveRef.current(active);},[active]);
  useEffect(()=>()=>onActiveRef.current(false),[]);
  useEffect(()=>{if(live.current){live.current.srcObject=rec.stream;if(rec.stream)void live.current.play().catch(()=>undefined);}},[rec.stream,rec.phase]);
  useEffect(()=>()=>{if(gesture.current)clearTimeout(gesture.current.timer);},[]);
  function pointerDown(event:PointerEvent<HTMLButtonElement>){
    if(disabled||active||event.button!==0)return;
    event.currentTarget.setPointerCapture(event.pointerId);setOffset({x:0,y:0});
    const next={x:event.clientX,y:event.clientY,held:false,timer:setTimeout(()=>{next.held=true;setLocked(false);lockedRef.current=false;void rec.start(mode);},220)};
    gesture.current=next;
  }
  function pointerMove(event:PointerEvent<HTMLButtonElement>){
    const g=gesture.current;if(!g||lockedRef.current)return;
    if(g.held)setOffset({x:Math.max(-100,Math.min(0,event.clientX-g.x)),y:Math.max(-90,Math.min(0,event.clientY-g.y))});
    if(event.clientX-g.x < -100){clearTimeout(g.timer);gesture.current=null;suppress.current=true;setOffset({x:0,y:0});rec.cancel();return;}
    if(g.held && g.y-event.clientY>85){setLocked(true);lockedRef.current=true;setOffset({x:0,y:0});}
  }
  function pointerUp(){setOffset({x:0,y:0});const g=gesture.current;if(!g)return;clearTimeout(g.timer);gesture.current=null;suppress.current=true;if(g.held){if(!lockedRef.current)rec.stop(true);}else{setMode(value=>value==='voice'?'circle':'voice');}}
  function choose(kind:RecordingKind){setMenu(false);setMode(kind);setLocked(true);lockedRef.current=true;void rec.start(kind);}
  return <>
    <div className={`record-action-wrap ${active&&!locked?'is-dragging-record':''} ${locked&&active?'is-record-locked':''}`} style={{'--record-drag-x':`${offset.x*.3}px`,'--record-drag-y':`${offset.y*.75}px`,'--lock-progress':Math.min(1,-offset.y/85)} as React.CSSProperties}>
      <button type="button" className={`icon-button glass round record-action ${active?'red-glass recording-action':''}`} disabled={disabled||rec.phase==='saving'} aria-label={active ? rec.phase==='preview'||locked?'Отправить запись':'Остановить и прослушать запись' : mode==='voice'?'Голосовое: удерживать для записи, нажать для кружка':'Кружок: удерживать для записи, нажать для голосового'} aria-haspopup={!active?'menu':undefined}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={()=>{if(gesture.current)clearTimeout(gesture.current.timer);gesture.current=null;setOffset({x:0,y:0});rec.cancel();}}
        onContextMenu={e=>{e.preventDefault();if(!active)setMenu(v=>!v);}}
        onClick={e=>{if(suppress.current){suppress.current=false;return;}if(active){if(rec.phase==='preview')rec.send();else rec.stop(locked);}else if(e.detail===0)choose(mode);}}
        onKeyDown={e=>{if(e.key==='Escape'){rec.cancel();setMenu(false);}if(e.key==='ArrowUp'&&!active){e.preventDefault();setMenu(v=>!v);}}}>
        <span key={active?rec.phase:mode} className="action-glyph">{active ? rec.phase==='preview'||locked?<Send/>:<Square/> : mode==='voice'?<Mic/>:<Camera/>}</span>
      </button>
      {menu&&!active&&<div className="record-mode-menu glass" role="menu" aria-label="Режим записи"><button role="menuitem" onClick={()=>choose('voice')}><Mic size={17}/>Голосовое</button><button role="menuitem" onClick={()=>choose('circle')}><Camera size={17}/>Видеокружок</button><button className="text-button" onClick={()=>setMenu(false)}>Закрыть</button></div>}
      {!locked && rec.phase==='recording'&&<span className="record-lock glass"><LockKeyhole size={16}/><span>↑</span><svg className="lock-progress" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" pathLength="100" strokeDasharray={`${Math.min(100,-offset.y/85*100)} 100`}/></svg></span>}
    </div>
    {active&&slot.current&&createPortal(<div className="inline-recording" aria-label="Запись сообщения">
      <button type="button" className="icon-button record-trash" aria-label="Удалить запись" onClick={rec.cancel}><Trash2/></button>
      {rec.phase==='saving'?<span className="record-hint" role="status">Отправляем запись…</span>:rec.phase==='preview'&&previewURL ? <div className="record-review">{rec.kind==='voice'?<VoicePlayer url={previewURL} duration={rec.duration} initialPeaks={rec.peaks}/>:<><button type="button" className="icon-button" aria-label="Воспроизвести предпросмотр кружка" onClick={()=>{const n=live.current;if(n){n.muted=false;void n.play().catch(()=>undefined);}}}><Play/></button><VideoTimeline url={previewURL} duration={rec.duration} video={live}/></>}</div> : <>
        <span className="record-counter"><i/>{formatDuration(rec.duration)}</span>
        <span className="live-wave" aria-hidden="true">{rec.peaks.slice(-32).map((p,i)=><i key={i} style={{height:`${4+p*23}px`}}/>)}</span>
        <span className="record-hint">{rec.phase==='requesting'?'Ожидаем разрешение…':locked?'Запись закреплена':'← Сдвинь для отмены'}</span>
        {locked&&<button type="button" className="icon-button" aria-label={rec.phase==='paused'?'Продолжить запись':'Пауза записи'} onClick={rec.phase==='paused'?rec.resume:rec.pause}>{rec.phase==='paused'?<Play/>:<Pause/>}</button>}
        {locked&&<button type="button" className="icon-button" aria-label="Завершить запись и открыть предпросмотр" onClick={()=>rec.stop()}><Square/></button>}
      </>}
    </div>,slot.current)}
    {active&&rec.kind==='circle'&&scene.current&&createPortal(<div className={`circle-record-stage ${rec.phase==='preview'?'is-preview':''}`}>
      <div className="record-circle" style={{'--voice-level':rec.level,'--circle-drag-y':`${offset.y*.35}px`} as React.CSSProperties}>
        {rec.stream?<video ref={live} muted autoPlay playsInline/>:previewURL?<CirclePlayer url={previewURL} duration={rec.duration} videoRef={live}/>:<Camera/>}
        <svg className="record-circle-progress" viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="117" pathLength="100" strokeDasharray={`${Math.min(100,rec.duration/60*100)} 100`}/></svg>
      </div><span className="circle-record-time">{formatDuration(rec.duration)}</span>
      <button type="button" className="icon-button circle-cancel" aria-label="Отменить запись кружка" onClick={rec.cancel}><X/></button>
    </div>,scene.current)}
    {rec.error&&slot.current&&createPortal(<div className="record-error" role="alert">{rec.error}<button type="button" aria-label="Закрыть ошибку записи" onClick={rec.cancel}><X size={16}/></button></div>,slot.current.closest('.composer-area')||slot.current.parentElement!)}
  </>;
}
