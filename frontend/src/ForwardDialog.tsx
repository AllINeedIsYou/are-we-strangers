import { useEffect,useRef,useState } from 'react';
import { Search,X } from 'lucide-react';
import type {Chat} from './domain';
export default function ForwardDialog({chats,count,onClose,onForward}:{chats:Chat[];count:number;onClose:()=>void;onForward:(chatId:string)=>void}){
 const ref=useRef<HTMLDialogElement>(null);const [search,setSearch]=useState('');
 useEffect(()=>{ref.current!.showModal();ref.current!.querySelector('input')?.focus();return()=>ref.current?.close();},[]);
 const targets=chats.filter(chat=>chat.name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru')));
 return <dialog ref={ref} className="modal glass forward-dialog" aria-label="Переслать сообщения" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><header><h2>Переслать{count>1?` · ${count}`:''}</h2><button className="icon-button" aria-label="Закрыть пересылку" onClick={onClose}><X/></button></header><label className="forward-search"><Search size={16}/><input autoFocus aria-label="Найти получателя" placeholder="Поиск" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="forward-list">{targets.map(chat=><button className="forward-contact" key={chat.id} onClick={()=>onForward(chat.id)}><span className="avatar">{chat.initial}</span><span><strong>{chat.name}</strong><small>{chat.online?'В сети':'был(а) недавно'}</small></span></button>)}{!targets.length&&<p className="empty-search">Никого не нашли</p>}</div></dialog>;
}
