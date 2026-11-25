import {useMemo} from 'react'
import type {WallAccess} from '../feed-models'
import {useWallFeed} from '../hooks/useWallFeed'
import {wallError} from '../models'
import {GuestWallComposer} from './GuestWallComposer'
import {LiveWallPost} from './LiveWallPost'
import '../wall.css'

export function GuestWall({token,recipient,partySize,timezone}:{token:string;recipient:string;partySize:number;timezone:string}){
  const access=useMemo<WallAccess>(()=>({kind:'guest',token}),[token]),wall=useWallFeed(access,'guest-wall'),data=wall.data
  const date=(value:string)=>new Intl.DateTimeFormat('es-PY',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value))
  return <section className="ww-section" id="buenos-deseos" aria-labelledby="ww-title">
    <div className="ww-heading"><p className="ww-kicker">PALABRAS QUE SE QUEDAN</p><h2 id="ww-title">Dejá tus<br />{' '}<em>buenos deseos.</em></h2><p>Hay abrazos que también se escriben.<br />Compartí algo lindo para este encuentro.</p></div>
    {wall.unavailable?<p role="alert" className="ww-empty">Tu invitación ya no está disponible para consultar este espacio.</p>:!data?<div className="ww-empty" role={wall.isError?'alert':'status'}>{wall.isError?<><p>{wallError(wall.error)}</p><button type="button" className="ww-text-button" onClick={()=>{void wall.refetch()}}>Volver a intentar</button></>:'Preparando un lugar para tus palabras…'}</div>:<>
      {data.can_post?<GuestWallComposer token={token} recipient={recipient} partySize={partySize} maximum={data.audio_max_seconds} onSubmitted={()=>{void wall.refetch()}} />:<div className="ww-empty"><p>{!data.enabled?'Las nuevas dedicatorias están en pausa.':Date.parse(data.server_time)<Date.parse(data.opens_at)?`Podrás compartir tus deseos desde el ${date(data.opens_at)}.`:'El período para enviar dedicatorias finalizó.'}</p><p>Los recuerdos aprobados siguen acá para compartirlos.</p></div>}
      <div className="ww-conversation"><header className="ww-chat-header"><div><span className="ww-chat-symbol" aria-hidden="true">♡</span><div><h3>Un encuentro, muchas voces</h3><p><span className="ww-live-dot" aria-hidden="true" />{wall.connection==='live'?'En vivo':'Actualización periódica'} · {timezone}</p></div></div><button type="button" className="ww-refresh" disabled={wall.isFetching} onClick={()=>{void wall.refetch()}} aria-label="Actualizar conversación">↻</button></header>
        <div className="ww-chat-history" aria-label="Conversación de buenos deseos">{data.posts.length===0?<div className="ww-chat-empty"><span aria-hidden="true">✳</span><p>Los primeros recuerdos están por llegar.</p><small>Acá aparecerán los mensajes que apruebe el anfitrión.</small></div>:data.posts.map(post=><LiveWallPost key={post.id} post={post} access={access} scope="guest-wall" timezone={timezone} />)}{data.syncing?<p role="status" className="ww-note">Cargando el historial completo… Los recuerdos anteriores se conservan.</p>:null}{wall.isError?<p role="status" className="ww-error">{wallError(wall.error)}</p>:null}</div>
        <p className="ww-chat-footer">Todos los recuerdos aprobados, en orden de envío.</p>
      </div>
    </>}
  </section>
}
