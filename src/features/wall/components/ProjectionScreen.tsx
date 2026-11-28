import {useEffect,useMemo,useRef,useState} from 'react'
import {appUrl} from '../../../lib/env'
import type {WallAccess} from '../feed-models'
import {eventInitials} from '../presentation-models'
import type {ProjectionOptions} from '../presentation-models'
import {useWallFeed} from '../hooks/useWallFeed'
import {useConversationScroll} from '../hooks/useConversationScroll'
import {useOnlineStatus} from '../hooks/useOnlineStatus'
import {LiveWallPost} from './LiveWallPost'
import {ParticipationQr} from './ParticipationQr'
import {ProjectionToolbar} from './ProjectionToolbar'
import {shareWallScreen} from '../share'
import '../wall.css'
import '../projection.css'

export function ProjectionScreen({slug,credential,initialQr,initialOptions}:{slug:string;credential:string;initialQr:boolean;initialOptions:ProjectionOptions}){
  const access=useMemo<WallAccess>(()=>({kind:'projection',slug,access:credential}),[slug,credential]),query=useWallFeed(access,'projected-wall'),feed=query.data,online=useOnlineStatus()
  const shell=useRef<HTMLElement>(null),viewport=useRef<HTMLDivElement>(null)
  const [auto,setAuto]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches),[speed,setSpeed]=useState(28),[showQr,setShowQr]=useState(initialQr),[playingPost,setPlayingPost]=useState<string|null>(null),[fullscreenError,setFullscreenError]=useState(false),[options,setOptions]=useState(initialOptions),[presentation,setPresentation]=useState(initialOptions.presentation),[audioHint,setAudioHint]=useState('''),[shareNotice,setShareNotice]=useState('')
  const audioPlaying=Boolean(playingPost&&feed?.posts.some(post=>post.id===playingPost))
  const phase=useConversationScroll(viewport,Boolean(feed?.posts.length)&&auto&&!audioPlaying&&!query.unavailable,speed)
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.target instanceof HTMLElement&&event.target.closest('input,select,textarea'))return;if(event.key.toLowerCase()==='m'){event.preventDefault();setPresentation(value=>!value)}else if(event.key==='Escape')setPresentation(false)}
    const fullscreenChanged=()=>{if(!document.fullscreenElement)setPresentation(false)}
    window.addEventListener('keydown',key);document.addEventListener('fullscreenchange',fullscreenChanged)
    return()=>{window.removeEventListener('keydown',key);document.removeEventListener('fullscreenchange',fullscreenChanged)}
  },[])
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else{await shell.current?.requestFullscreen();setPresentation(true)}setFullscreenError(false)}catch{setFullscreenError(true)}}
  function mediaPlaying(target:EventTarget){if(!(target instanceof HTMLAudioElement))return;viewport.current?.querySelectorAll('audio').forEach(audio=>{if(audio!==target)audio.pause()});setPlayingPost(target.closest<HTMLElement>('[data-wall-post-id]')?.dataset.wallPostId??null)}
  function mediaPaused(){const audio=[...viewport.current?.querySelectorAll('audio')??[]].find(element=>!element.paused&&!element.ended);setPlayingPost(audio?.closest<HTMLElement>('[data-wall-post-id]')?.dataset.wallPostId??null)}
  function stopAudio(){viewport.current?.querySelectorAll('audio').forEach(audio=>audio.pause());setPlayingPost(null)}
  async function activateAudio(){
    const bounds=viewport.current?.getBoundingClientRect()
    const audio=[...viewport.current?.querySelectorAll('audio')??[]].map(element=>{const box=element.closest<HTMLElement>('[data-wall-post-id]')?.getBoundingClientRect();return {element,visible:box&&bounds?Math.max(0,Math.min(box.bottom,bounds.bottom)-Math.max(box.top,bounds.top)):0}}).filter(item=>item.element.getAttribute('src')&&item.visible>0).sort((a,b)=>b.visible-a.visible)[0]?.element
    if(!audio){setAudioHint('Buscá una nota de voz y tocá su botón de reproducción para habilitar el sonido.');return}
    try{await audio.play();audio.scrollIntoView({block:'nearest',behavior:'smooth'});setAudioHint('Sonido iniciado por el operador. Otras notas pueden requerir una nueva interacción.')}
    catch(error){setAudioHint(error instanceof DOMException&&error.name==='NotAllowedError'?'El navegador requiere que toques reproducir en la nota de voz.':'No pudimos reproducir esta nota. Usá Volver a cargar audio en el mensaje.')}
  }
  if(query.unavailable)return <main className="wp-shell"><div className="wp-error"><p className="wp-kicker">JOTOPA · BUENOS DESEOS</p><h1>Este encuentro<br />ya no está en pantalla.</h1><p>El enlace venció, fue revocado o el período de acceso terminó. Pedile un enlace nuevo a quien organiza.</p></div></main>
  if(!feed?.event)return <main className="wp-shell"><div className="wp-error"><p className="wp-kicker">JOTOPA · BUENOS DESEOS</p><h1>{query.isError?'No pudimos abrir la pantalla.':'Preparando los recuerdos…'}</h1><p>{query.isError?'Revisá la conexión y el enlace de proyección.':'Un encuentro, muchas voces.'}</p>{query.isError?<button type="button" onClick={()=>{void query.refetch()}}>Volver a intentar</button>:null}</div></main>
  const event=feed.event,participation=new URL('/e/'+event.slug+'/participar',appUrl).href
  async function shareScreen(){try{const result=await shareWallScreen(window.location.href,event.title);setShareNotice(result==='shared'?'Opciones para compartir abiertas.':result==='copied'?'Enlace público copiado.':'')}catch{setShareNotice('No pudimos compartir el enlace desde este navegador.')}}
  const date=new Intl.DateTimeFormat('es-PY',{day:'numeric',month:'long',year:'numeric',timeZone:event.timezone}).format(new Date(event.starts_at))
  const connected=online&&query.connection==='live'&&!query.isError
  const status=!online?'Sin conexión · historial conservado':connected?'En vivo':'Reconectando · reconciliación periódica'
  const motion=audioPlaying?'Recorrido en pausa mientras se escucha un audio.':!auto?'Recorrido en pausa. Podés explorar todos los recuerdos.':phase==='return'?'Volviendo suavemente al comienzo, sin perder mensajes.':phase==='end-pause'?'Una pausa para leer el último recuerdo. Después volvemos suavemente al comienzo.':phase==='start-pause'?'Una pausa antes de recorrer todos los recuerdos.':'El historial avanza completo, a ritmo de lectura.'
  return <main ref={shell} className={'wp-shell wp-theme-'+options.look} data-font={options.font} data-reading={options.size} data-presentation={presentation}>
    <div className="wp-frame" aria-label="Proyección de buenos deseos">
      <section className="wp-wall"><header className="wp-chat-header"><span className="wp-group-avatar" aria-hidden="true">{eventInitials(event.title)}</span><div className="wp-header-title"><p className="wp-header-kicker">UN ENCUENTRO, MUCHAS VOCES</p><h1>{event.title}</h1><p className={!online?'wp-status-offline':''}><span className="ww-live-dot" aria-hidden="true" />{status} · {feed.posts.length} {feed.posts.length===1?'recuerdo':'recuerdos'}</p></div><span className="wp-readonly">Solo recuerdos aprobados</span></header>
        <div ref={viewport} className="wp-history" tabIndex={0} aria-label="Historial completo de buenos deseos" onPointerDown={event=>{if(!(event.target instanceof Element)||!event.target.closest('audio'))setAuto(false)}} onWheel={()=>setAuto(false)} onTouchStart={()=>setAuto(false)} onKeyDown={event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))setAuto(false)}} onPlayCapture={event=>mediaPlaying(event.target)} onPauseCapture={mediaPaused} onEndedCapture={mediaPaused}>
          <p className="wp-history-start">Un espacio para celebrar juntos.</p>{feed.posts.length?feed.posts.map(post=><LiveWallPost key={post.id} post={post} access={access} scope="projected-wall" timezone={event.timezone} releaseOffscreen />):<div className="wp-no-messages"><span className="wp-empty-identity" aria-hidden="true">{eventInitials(event.title)}</span><h2>Los primeros recuerdos<br />están por llegar.</h2><p>{showQr?'Escaneá el QR y abrí tu invitación personal para compartir tus buenos deseos.':'Compartí tus buenos deseos desde el enlace personal de tu invitación.'}</p></div>}{feed.syncing?<p className="wp-history-start" role="status">Cargando el historial completo…</p>:null}
        </div>
        {!presentation?<ProjectionToolbar auto={auto} speed={speed} showQr={showQr} audioPlaying={audioPlaying} options={options} onOptions={setOptions} onAuto={()=>setAuto(value=>!value)} onSpeed={setSpeed} onLatest={()=>{setAuto(false);viewport.current?.scrollTo({top:viewport.current.scrollHeight,behavior:'instant'})}} onFullscreen={()=>{void fullscreen()}} onQr={()=>setShowQr(value=>!value)} onPresent={()=>setPresentation(true)} onShare={()=>{void shareScreen()}} onAudio={()=>{void activateAudio()}} onStopAudio={stopAudio} />:null}
      </section>
      <aside className="wp-side"><div><p className="wp-kicker">EL ENCUENTRO ES CON VOS</p><p className="wp-event-title" aria-hidden="true">{event.title}</p><p className="wp-date">{date}</p></div>{showQr?<ParticipationQr url={participation} />:<div className="wp-side-ornament" aria-hidden="true">✳</div>}<div className="wp-signature"><span>jotopa<i>.</i></span><p>Las palabras también abrazan.</p></div></aside>
    </div>
    {presentation?<button type="button" className="wp-operator-toggle" onClick={()=>setPresentation(false)} aria-label="Mostrar controles de pantalla">Controles <span aria-hidden="true">· M</span></button>:null}
    <p className={'wp-screen-note'+(presentation?' wp-presentation-note':'')} role="status">{motion}{fullscreenError?' El navegador no permitió pantalla completa.':null}{!online?' Sin conexión. Los recuerdos cargados permanecen visibles hasta revalidar el acceso.':query.isError?' Se interrumpió la conexión; estamos intentando actualizar.':null}{audioHint?' '+audioHint:null}{shareNotice?' '+shareNotice:null}</p>
  </main>
}
