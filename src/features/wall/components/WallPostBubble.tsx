import type {WallImages,WallPost} from '../models'
import {audioDuration} from '../presentation-models'
import {WallAudioPlayer} from './WallAudioPlayer'
import {WallPhoto} from './WallPhoto'

export function WallPostBubble({post,images,timezone,onMediaRetry,showDuration=false}:{post:WallPost;images:WallImages;timezone:string;onMediaRetry?:()=>void;showDuration?:boolean}){
  const author=post.participant_name||post.author_name
  const date=new Intl.DateTimeFormat('es-PY',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(post.created_at))
  return <article className="ww-bubble" aria-label={'Buenos deseos de '+author}>
    <header><span className="ww-avatar" aria-hidden="true">{author.slice(0,1).toLocaleUpperCase('es-PY')}</span><div><p className="ww-author">{author}</p><p className="ww-identity">{post.participant_name?'Nombre declarado · invitación de '+post.author_name:'Titular de la invitación'}</p></div></header>
    {post.body?<p className="ww-message">{post.body}</p>:null}
    {post.media.some(media=>media.kind==='photo')?<div className="ww-photos">{post.media.filter(media=>media.kind==='photo').map((media,index)=>{
      const image=images[media.id]
      return image?<WallPhoto key={media.id} small={image.urls[1]??image.urls[0]!} large={image.urls[0]!} author={author} index={index} {...(onMediaRetry?{onRetry:onMediaRetry}:{})} />:<p key={media.id} className="ww-media-placeholder ww-photo-placeholder">Fotografía privada · cargando cuando sea visible</p>
    })}</div>:null}
    {post.media.filter(media=>media.kind==='audio').map(media=><div key={media.id}>{showDuration&&media.duration_seconds?<p className="ww-audio-duration">Nota de voz · {audioDuration(media.duration_seconds)}</p>:null}{images[media.id]?<WallAudioPlayer src={images[media.id]?.urls[0]} author={author} />:<p className="ww-media-placeholder ww-audio-placeholder">Nota de voz privada · cargando cuando sea visible</p>}</div>)}
    <time dateTime={post.created_at} className="ww-time">{date}</time>
  </article>
}
