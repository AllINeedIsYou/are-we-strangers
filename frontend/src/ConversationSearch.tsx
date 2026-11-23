import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, List, Search, X } from 'lucide-react';
import Avatar from './Avatar';
import { messageSummary, type Chat, type MediaAsset, type Message } from './domain';
import { findMessages, splitSearchText } from './search';
import useMessageSearch from './useMessageSearch';
import type { MessengerStore } from './messengerStore';

export function SearchText({text,query}:{text:string;query:string}) {
  return <>{splitSearchText(text,query).map((part,index)=>part.match?<mark key={index}>{part.text}</mark>:part.text)}</>;
}
export default function ConversationSearch({query,onQuery,messages,chat,ownName,ownAvatar,onNavigate,onClose,store,ownId,onExpired}:{query:string;onQuery:(query:string)=>void;messages:Message[];chat:Chat;ownName:string;ownAvatar?:MediaAsset;onNavigate:(id:string)=>void;onClose:()=>void;store?:MessengerStore|null;ownId:number;onExpired:()=>void}) {
  const [resultsOpen,setResultsOpen]=useState(false);
  const [activeId,setActiveId]=useState<string|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const resultsRef=useRef<HTMLDivElement>(null);
  const listId=useId();
  const remote=useMessageSearch(query,chat.serverId,ownId,store??null,!!store,onExpired);
  const results=store?remote.messages:findMessages(messages,query);
  const activeIndex=results.findIndex(message=>message.id===activeId);
  useEffect(()=>{
    const node=resultsRef.current;
    if(!node||!store||!resultsOpen||!remote.hasMore||remote.loading||remote.error)return;
    function inspect(){if(node && node.scrollHeight-node.scrollTop-node.clientHeight<100)void remote.loadMore();}
    node.addEventListener('scroll',inspect,{passive:true});
    return()=>node.removeEventListener('scroll',inspect);
  },[store,resultsOpen,remote.hasMore,remote.loading,remote.error,remote.loadMore]);
  useEffect(()=>{input.current?.focus({preventScroll:true});},[]);
  useEffect(()=>{setActiveId(null);setResultsOpen(!!query.trim());},[query]);
  useEffect(()=>{
    function outside(event:PointerEvent){if(!root.current?.contains(event.target as Node))setResultsOpen(false);}
    function escape(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')){event.preventDefault();onClose();}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[onClose]);
  useEffect(()=>{if(resultsOpen&&activeIndex>=0)resultsRef.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`)?.scrollIntoView({block:'nearest'});},[activeIndex,resultsOpen]);
  function choose(message:Message){setActiveId(message.id);setResultsOpen(false);onNavigate(message.id);input.current?.focus({preventScroll:true});}
  function navigate(direction:number){if(!results.length)return;const next=activeIndex<0?0:Math.max(0,Math.min(results.length-1,activeIndex+direction));choose(results[next]);}
  return <div ref={root} className="conversation-search">
    <div className="conversation-search-bar glass"><Search className="search-leading"/><input ref={input} role="combobox" aria-label="Текст для поиска в переписке" aria-controls={listId} aria-expanded={resultsOpen} aria-autocomplete="list" aria-activedescendant={resultsOpen&&activeIndex>=0?`${listId}-${activeIndex}`:undefined} placeholder="Поиск в этом чате" value={query} onChange={event=>onQuery(event.target.value)} onClick={()=>{if(query.trim())setResultsOpen(true);}} onKeyDown={event=>{
      if(event.key==='Enter'){event.preventDefault();if(resultsOpen&&results.length)choose(results[Math.max(0,activeIndex)]);else navigate(event.shiftKey?-1:1);}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(resultsOpen){const next=activeIndex<0?0:Math.max(0,Math.min(results.length-1,activeIndex+(event.key==='ArrowDown'?1:-1)));setActiveId(results[next]?.id||null);}else navigate(event.key==='ArrowUp'?1:-1);}
    }}/>
    {query&&<><span className="search-match-count" role="status" aria-live="polite">{remote.loading&&!results.length?'…':`${activeIndex<0?results.length:`${activeIndex+1} / ${results.length}`}${store&&remote.hasMore?'+':''}`}</span><button aria-label="Очистить запрос" onClick={()=>{onQuery('');input.current?.focus();}}><X/></button></>}
    <button aria-label="Предыдущее совпадение" disabled={!results.length||activeIndex===results.length-1} onClick={()=>navigate(1)}><ChevronUp/></button><button aria-label="Следующее совпадение" disabled={!results.length||activeIndex===0} onClick={()=>navigate(-1)}><ChevronDown/></button><button aria-label={resultsOpen?'Скрыть результаты поиска':'Показать результаты поиска'} aria-expanded={resultsOpen} disabled={!query.trim()} onClick={()=>setResultsOpen(value=>!value)}><List/></button><button aria-label="Закрыть поиск в переписке" onClick={onClose}><X/></button></div>
    <div className={`conversation-search-results glass ${resultsOpen?'search-results-open':''}`} inert={!resultsOpen} aria-hidden={!resultsOpen}>
      <div ref={resultsRef} id={listId} role="listbox" aria-label="Результаты поиска по переписке">{results.map((message,index)=><button key={message.id} id={`${listId}-${index}`} data-result-index={index} role="option" aria-selected={message.id===activeId} onClick={()=>choose(message)}><Avatar initial={message.own?ownName[0]:chat.initial} asset={message.own?ownAvatar:chat.avatar}/><span className="search-result-copy"><strong>{message.own?ownName:chat.name}</strong><span><SearchText text={messageSummary(message)} query={query}/></span></span><time>{message.time}</time></button>)}</div>
      {store&&remote.loading&&<p className="search-request-status" role="status">Ищем сообщения…</p>}
      {store&&remote.error&&<div className="search-request-status" role="alert"><p>{remote.error}</p><button onClick={remote.retry}>Повторить поиск</button></div>}
      {store&&remote.hasMore&&!remote.loading&&!remote.error&&<button className="search-more" onClick={()=>void remote.loadMore()}>Ещё результаты</button>}
      {!results.length&&(!store||(!remote.loading&&!remote.error&&!remote.hasMore))&&<div className="search-no-results"><Search/><p>Ничего не найдено</p><span>Попробуй другое слово или часть фразы</span></div>}
    </div>
  </div>;
}
