import { useEffect, useRef, useState } from 'react';
import { Download, File, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { mediaLabel, type MediaAsset } from './domain';
import { loadMedia } from './mediaStore';
import { formatDuration } from './recording';

export function useBlobURL(blob: Blob | null) {
  const [url, setURL] = useState<string | null>(null);
  useEffect(() => { if (!blob) { setURL(null); return; } const next=URL.createObjectURL(blob);setURL(next);return()=>URL.revokeObjectURL(next); },[blob]);
  return url;
}
export function useMediaURL(assetId: string | undefined) {
  const [blob,setBlob]=useState<Blob|null>(null);
  const [missing,setMissing]=useState(false);
  useEffect(()=>{let active=true;setBlob(null);setMissing(false);if(!assetId)return;loadMedia(assetId).then(value=>{if(active){setBlob(value);setMissing(!value);}}).catch(()=>{if(active)setMissing(true);});return()=>{active=false;};},[assetId]);
  return {url:useBlobURL(blob),missing};
}
function announcePlayback(element:HTMLMediaElement){window.dispatchEvent(new CustomEvent('aws-playback',{detail:element}));}
function useExclusivePlayback(element:React.RefObject<HTMLMediaElement|null>){useEffect(()=>{function pauseOther(e:Event){if((e as CustomEvent).detail!==element.current)element.current?.pause();}window.addEventListener('aws-playback',pauseOther);return()=>window.removeEventListener('aws-playback',pauseOther);},[]);}
export function VoicePlayer({url,duration=0,initialPeaks}:{url:string;duration?:number;initialPeaks?:number[]}) {
  const audio=useRef<HTMLAudioElement>(null);
  const wave=useRef<HTMLDivElement>(null);const [barCount,setBarCount]=useState(48);
  useEffect(()=>{const node=wave.current;if(!node)return;const observer=new ResizeObserver(()=>setBarCount(Math.max(24,Math.min(500,Math.floor(node.clientWidth/4)))));observer.observe(node);return()=>observer.disconnect();},[]);
  const [playing,setPlaying]=useState(false),[time,setTime]=useState(0),[total,setTotal]=useState(duration),[rate,setRate]=useState(1),[error,setError]=useState(false);
  const [peaks,setPeaks]=useState<number[]>(initialPeaks||[]);
  useExclusivePlayback(audio);
  useEffect(()=>{if(initialPeaks?.length){setPeaks(initialPeaks);return;}let alive=true;let context:AudioContext|null=null;fetch(url).then(r=>r.arrayBuffer()).then(async bytes=>{context=new AudioContext();const data=await context.decodeAudioData(bytes);if(!alive)return;const channel=data.getChannelData(0);const values=Array.from({length:48},(_,i)=>{const start=Math.floor(i*channel.length/48),end=Math.floor((i+1)*channel.length/48);let sum=0;for(let j=start;j<end;j+=4)sum+=channel[j]**2;return Math.sqrt(sum/Math.max(1,(end-start)/4));});const max=Math.max(.01,...values);setPeaks(values.map(v=>v/max));if(Number.isFinite(data.duration))setTotal(data.duration);}).catch(()=>undefined).finally(()=>{void context?.close().catch(()=>undefined);});return()=>{alive=false;};},[url]);
  const bars=peaks.length?Array.from({length:barCount},(_,i)=>peaks[Math.min(peaks.length-1,Math.floor(i*peaks.length/barCount))]):Array(barCount).fill(.12);
  return <div className={`voice-player ${playing?'is-playing':''}`}>
    <audio ref={audio} src={url} preload="metadata" onPlay={()=>{setPlaying(true);announcePlayback(audio.current!);}} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);setTime(0);}} onTimeUpdate={()=>setTime(audio.current?.currentTime||0)} onLoadedMetadata={()=>{const d=audio.current?.duration;if(d&&Number.isFinite(d))setTotal(d);}} onError={()=>setError(true)}/>
    <button type="button" className="voice-play" aria-label={playing?'Приостановить голосовое сообщение':'Воспроизвести голосовое сообщение'} onClick={()=>{if(playing)audio.current?.pause();else void audio.current?.play().catch(()=>setError(true));}}>{playing?<Pause/>:<Play/>}</button>
    <div className="voice-track"><div ref={wave} className="voice-wave" aria-hidden="true">{bars.map((p,i)=><i key={i} className={total&&i/barCount<=time/total?'played':''} style={{height:`${3+Math.min(1,p)*21}px`}}/>)}</div><input type="range" min={0} max={total||1} step="0.05" value={Math.min(time,total||1)} aria-label="Позиция голосового сообщения" onChange={e=>{const t=Number(e.target.value);if(audio.current)audio.current.currentTime=t;setTime(t);}}/><span className="voice-time">{formatDuration(playing?time:total)}</span></div>
    <button type="button" className="voice-speed" aria-label={`Скорость воспроизведения ${rate}×`} onClick={()=>{const n=rate===1?1.5:rate===1.5?2:1;setRate(n);if(audio.current)audio.current.playbackRate=n;}}>{rate}×</button>
    {error&&<a className="voice-download" href={url} download="voice-message">Скачать</a>}
  </div>;
}
export function CirclePlayer({url,duration=0,videoRef}:{url:string;duration?:number;videoRef?:React.RefObject<HTMLVideoElement|null>}){
 const internalVideo=useRef<HTMLVideoElement>(null);const video=videoRef||internalVideo;
 const [playing,setPlaying]=useState(false),[muted,setMuted]=useState(true),[time,setTime]=useState(0),[error,setError]=useState(false),[total,setTotal]=useState(duration);
 useExclusivePlayback(video);
 useEffect(()=>{const node=video.current;if(!node)return;const observer=new IntersectionObserver(entries=>{const visible=entries[0]?.isIntersecting;if(visible&&node.muted&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)void node.play().catch(()=>undefined);else if(!visible)node.pause();},{threshold:.6});observer.observe(node);return()=>observer.disconnect();},[url]);
 return <div className={`circle-player ${playing?'is-playing':''}`}><video ref={video} src={url} playsInline muted={muted} loop={muted} onVolumeChange={()=>setMuted(video.current?.muted??true)} preload="metadata" onPlay={()=>{setPlaying(true);if(!video.current?.muted)announcePlayback(video.current!);}} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onTimeUpdate={()=>setTime(video.current?.currentTime||0)} onLoadedMetadata={()=>{const d=video.current?.duration;if(d&&Number.isFinite(d))setTotal(d);}} onError={()=>setError(true)}/>
 <svg className="circle-playback-progress" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="98" pathLength="100" strokeDasharray={`${total?time/total*100:0} 100`}/></svg>
 <button type="button" className={`circle-play ${playing?'playing':''}`} aria-label={muted?'Включить звук видеокружка':playing?'Приостановить видеокружок':'Воспроизвести видеокружок'} onClick={()=>{const n=video.current;if(!n)return;if(muted){n.currentTime=0;n.muted=false;setMuted(false);void n.play().catch(()=>setError(true));}else if(playing)n.pause();else void n.play().catch(()=>setError(true));}}>{muted?<VolumeX/>:playing?<Pause/>:<Play/>}</button><span className="circle-duration">{formatDuration(playing&&!muted?Math.max(0,total-time):total)} {muted?<VolumeX size={11}/>:<Volume2 size={11}/>}</span>{error&&<a className="media-fallback" href={url} download="video-circle">Скачать видеокружок</a>}</div>;
}
export default function MediaView({asset}:{asset:MediaAsset}){
 const {url,missing}=useMediaURL(asset.id);
 if(missing)return <div className="media-missing">{mediaLabel(asset.kind)}<small>Файл недоступен в этом браузере</small></div>;
 if(!url)return <div className="media-loading">Загрузка медиа…</div>;
 if(asset.kind==='photo')return <a className="photo-media" href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={asset.name} loading="lazy"/></a>;
 if(asset.kind==='voice')return <VoicePlayer url={url} duration={asset.duration}/>;
 if(asset.kind==='circle')return <CirclePlayer url={url} duration={asset.duration}/>;
 if(asset.kind==='video')return <video className="video-media" src={url} controls playsInline preload="metadata" aria-label={asset.name}/>;
 return <a className="file-media" href={url} download={asset.name}><File size={24}/><span>{asset.name}<small>{Math.max(1,Math.round(asset.size/1024))} КБ</small></span><Download size={17}/></a>;
}

export function VideoTimeline({url,duration,video}:{url:string;duration:number;video:React.RefObject<HTMLVideoElement|null>}){
 const [frames,setFrames]=useState<string[]>([]),[time,setTime]=useState(0);
 useEffect(()=>{let active=true;const sample=document.createElement('video');sample.muted=true;sample.preload='auto';sample.src=url;const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d')!;
  function waitFor(event:string){return new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);sample.removeEventListener(event,finish);resolve();};const timer=setTimeout(finish,1200);sample.addEventListener(event,finish,{once:true});});}
  async function capture(){await waitFor('loadeddata');const images:string[]=[];for(let i=0;i<8&&active;i++){const ready=waitFor('seeked');sample.currentTime=Math.max(.01,duration*(i+.1)/8);await ready;if(!active)return;try{ctx.drawImage(sample,0,0,48,48);images.push(canvas.toDataURL('image/jpeg',.65));setFrames([...images]);}catch{/* Wait for a decodable frame. */}}}void capture();return()=>{active=false;sample.removeAttribute('src');sample.load();};
 },[url,duration]);
 useEffect(()=>{const timer=setInterval(()=>setTime(video.current?.currentTime||0),150);return()=>clearInterval(timer);},[video]);
 return <div className="video-review-track"><span className="video-film" aria-hidden="true">{frames.map((frame,i)=><img key={i} src={frame} alt=""/>)}</span><input type="range" min={0} max={duration||1} value={Math.min(time,duration)} step="0.05" aria-label="Позиция предпросмотра кружка" onChange={event=>{const t=Number(event.target.value);if(video.current)video.current.currentTime=t;setTime(t);}}/><time>{formatDuration(time)} / {formatDuration(duration)}</time></div>;
}
