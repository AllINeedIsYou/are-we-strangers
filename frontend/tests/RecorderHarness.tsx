import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RecordingControl from '../src/RecordingControl';
import MediaView from '../src/MediaView';
import type { MediaAsset } from '../src/domain';
import type { RecordingKind } from '../src/recording';
import '../src/styles.css';
import '../src/refinements.css';
import '../src/media.css';
import '../src/experience.css';
import '../src/polish.css';

function Harness() {
  const [asset,setAsset]=useState<MediaAsset|null>(null);
  const [active,setActive]=useState(false);
  const [released,setReleased]=useState(false);
  const cleanup=useRef<(()=>void)|null>(null);
  const slot=useRef<HTMLDivElement>(null);
  const scene=useRef<HTMLElement>(null);
  async function syntheticStream(mode: RecordingKind) {
    setReleased(false);
    const context = new AudioContext();
    await context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain(); gain.gain.value = 0;
    const destination = context.createMediaStreamDestination();
    oscillator.connect(gain); gain.connect(destination); oscillator.start();
    const result = new MediaStream(destination.stream.getTracks());
    let frame = 0;
    let count = 0;
    if (mode === 'circle') {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 240;
      const draw = canvas.getContext('2d')!;
      function render() {
        draw.fillStyle = '#1c0b13'; draw.fillRect(0, 0, 240, 240);
        draw.fillStyle = '#9e1230'; draw.beginPath(); draw.arc(120 + Math.sin(count++ / 15) * 35, 120, 38, 0, Math.PI * 2); draw.fill();
        frame = requestAnimationFrame(render);
      }
      render(); canvas.captureStream(24).getVideoTracks().forEach(track => result.addTrack(track));
    }
    cleanup.current = () => {
      cancelAnimationFrame(frame); oscillator.stop(); void context.close();
      setReleased(result.getTracks().every(track => track.readyState === 'ended'));
      cleanup.current = null;
    };
    return result;
  }
  return <main ref={scene} className="conversation" style={{height:'100dvh',display:'flow-root'}}><h1 style={{padding:30}}>Тест записи</h1><p style={{padding:'0 30px'}}>Искусственный поток. Камера и микрофон не используются.</p>{asset&&<section style={{padding:30}}><h2>Запись сохранена</h2><p>{asset.kind} · {asset.mime} · {asset.size} байт</p><MediaView asset={asset}/></section>}<p role="status" style={{padding:30}}>{released?'Все дорожки остановлены':'Нет завершённого потока'}</p><div className={`composer-area ${active?'is-recording':''}`}><div className="composer"><div ref={slot} className="composer-input glass"><textarea rows={1} disabled={active} placeholder="Сообщение…"/></div><RecordingControl slot={slot} scene={scene} requestStream={syntheticStream} onActive={value=>{setActive(value);if(!value)cleanup.current?.();}} onComplete={next=>{setAsset(next);cleanup.current?.();}}/></div></div></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Harness/></React.StrictMode>);
