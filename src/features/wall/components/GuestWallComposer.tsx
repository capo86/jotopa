import {useEffect,useRef,useState} from 'react'
import {useMutation} from '@tanstack/react-query'
import {optimizeImage} from '../../invitation-design/media'
import {beginPost,cancelPost,submitPost,uploadPostAudio,uploadPostPhoto} from '../api'
import {draftSchema,wallError} from '../models'
import type {PreparedPhoto,WallDraft} from '../models'
import {VoiceRecorder} from './VoiceRecorder'
import {AudioPreview} from './AudioPreview'
import {normalizeAudio} from '../audio'

type Attempt={draft:WallDraft;photos:PreparedPhoto[];audio:Blob|null;postId?:string}
export function GuestWallComposer({token,recipient,partySize,maximum,onSubmitted}:{token:string;recipient:string;partySize:number;maximum:number;onSubmitted:()=>void}){
  const [body,setBody]=useState(''),[participant,setParticipant]=useState(''),[photos,setPhotos]=useState<PreparedPhoto[]>([]),[audio,setAudio]=useState<Blob|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sealed,setSealed]=useState(false),[thanked,setThanked]=useState(false)
  const attempt=useRef<Attempt|null>(null),urls=useRef(new Set<string>())
  useEffect(()=>()=>{for(const url of urls.current)URL.revokeObjectURL(url)},[])
  function clearDraft(){for(const photo of photos){URL.revokeObjectURL(photo.preview);urls.current.delete(photo.preview)}setPhotos([]);setBody('');setParticipant('');setAudio(null);attempt.current=null;setSealed(false)}
  const send=useMutation({retry:false,gcTime:0,mutationFn:async(value:Attempt)=>{
    const result=await beginPost(token,value.draft);value.postId=result.post_id
    if(result.status==='draft'){
      await Promise.all([...value.photos.map((photo,index)=>uploadPostPhoto(token,result.post_id,index,photo)),...(value.audio?[uploadPostAudio(token,result.post_id,value.audio)]:[])])
      await submitPost(token,result.post_id)
    }
  },onSuccess:()=>{clearDraft();setThanked(true);onSubmitted()}})
  const discard=useMutation({retry:false,gcTime:0,mutationFn:async()=>{if(attempt.current?.postId)await cancelPost(token,attempt.current.postId)},onSuccess:()=>{clearDraft();send.reset();setError('')}})
  async function selectPhotos(files:FileList|null){
    if(!files?.length)return
    setError('');setBusy(true)
    const prepared:PreparedPhoto[]=[]
    try{
      if(photos.length+files.length>3)throw new Error('photo_limit')
      for(const file of files){const result=await optimizeImage(file);const preview=URL.createObjectURL(result.small);urls.current.add(preview);prepared.push({id:crypto.randomUUID(),...result,preview})}
      setPhotos(current=>[...current,...prepared])
    }catch(cause){for(const photo of prepared){URL.revokeObjectURL(photo.preview);urls.current.delete(photo.preview)}setError(cause instanceof Error&&cause.message==='photo_limit'?'Podés adjuntar hasta 3 fotografías.':wallError(cause))}finally{setBusy(false)}
  }
  async function selectAudio(file:File|undefined){if(!file)return;setBusy(true);setError('');try{setAudio(await normalizeAudio(file,maximum))}catch(cause){setError(wallError(cause))}finally{setBusy(false)}}
  function submit(){setError('');setThanked(false);if(!attempt.current){const result=draftSchema.safeParse({body,...(participant.trim()?{participant_name:participant.trim()}:{}),photo_count:photos.length,audio_count:audio?1:0,request_id:crypto.randomUUID()});if(!result.success){setError('Escribí un mensaje o adjuntá una foto o un audio.');return}attempt.current={draft:result.data,photos,audio};setSealed(true)}send.mutate(attempt.current)}
  const locked=sealed||busy||send.isPending||discard.isPending
  return <div className="ww-compose">
    <div className="ww-compose-heading"><span aria-hidden="true" className="ww-compose-mark">♡</span><div><h3>Un recuerdo empieza con unas palabras.</h3><p>Podés participar aunque no asistas. Cada mensaje se revisa antes de publicarse.</p></div></div>
    {thanked?<p role="status" className="ww-success">¡Gracias por compartir tus buenos deseos! Tu mensaje será revisado antes de publicarse</p>:null}
    <form onSubmit={event=>{event.preventDefault();submit()}}>
      <p className="ww-sender">Desde la invitación de <strong>{recipient}</strong></p>
      {partySize>1?<label className="ww-field">¿Quién de esta invitación escribe? <span>Opcional · este nombre se mostrará como declarado</span><input maxLength={80} value={participant} disabled={locked} onChange={event=>setParticipant(event.target.value)} placeholder="Tu nombre, si sos acompañante" /></label>:null}
      <label className="ww-field"><span className="sr-only">Tu mensaje de buenos deseos</span><textarea maxLength={2000} rows={4} value={body} disabled={locked} onChange={event=>setBody(event.target.value)} placeholder="Un deseo, una anécdota, algo que salga del corazón…" /></label>
      <div className="ww-compose-meta"><span>{body.length}/2000</span><span>Solo lo aprobado aparece en la conversación</span></div>
      {photos.length?<div className="ww-previews">{photos.map((photo,index)=><figure key={photo.id}><img src={photo.preview} alt={`Vista previa de la fotografía ${index+1}`} width="180" height="180" /><button type="button" disabled={locked} aria-label={`Quitar fotografía ${index+1}`} onClick={()=>{URL.revokeObjectURL(photo.preview);urls.current.delete(photo.preview);setPhotos(current=>current.filter(item=>item.id!==photo.id))}}>×</button></figure>)}</div>:null}
      {audio?<div className="ww-audio-preview"><p className="ww-note">Escuchá tu nota de voz antes de enviarla</p><AudioPreview audio={audio} /><button className="ww-text-button" type="button" disabled={locked} onClick={()=>setAudio(null)}>Eliminar audio y grabar otro</button></div>:null}
      <div className="ww-tools">
        <label className={`ww-tool ${locked||photos.length>=3?'ww-disabled':''}`}><span aria-hidden="true">▧</span> Fotografías<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked||photos.length>=3} aria-label="Adjuntar fotografías" onChange={event=>{void selectPhotos(event.target.files);event.target.value=''}} /></label>
        <label className={`ww-tool ww-camera ${locked||photos.length>=3?'ww-disabled':''}`}><span aria-hidden="true">◉</span> Cámara<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={locked||photos.length>=3} aria-label="Tomar fotografía" onChange={event=>{void selectPhotos(event.target.files);event.target.value=''}} /></label>
        {!audio&&!sealed?<VoiceRecorder maximum={maximum} onAudio={setAudio} onBusy={setBusy} />:null}
      </div>
      {!audio?<label className="ww-attach-audio">O adjuntá un archivo de audio<input type="file" accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm" disabled={locked} aria-label="Adjuntar archivo de audio" onChange={event=>{void selectAudio(event.target.files?.[0]);event.target.value=''}} /></label>:null}
      <p className="ww-note">Hasta 3 fotos de 10 MB cada una antes de optimizar. Un audio de hasta {maximum} s. Los archivos se guardan en forma privada.</p>
      {error||send.isError||discard.isError?<p role="alert" className="ww-error">{error||wallError(send.error??discard.error)}</p>:null}
      <div className="ww-send-row"><p className="ww-note">Tu nombre acompaña este recuerdo.<br />No compartas datos sensibles.</p><button type="submit" className="ww-send" disabled={busy||send.isPending||discard.isPending}>{busy?'Preparando archivos…':send.isPending?'Compartiendo…':sealed?'Reintentar envío':'Enviar buenos deseos'} <span aria-hidden="true">↗</span></button></div>
      {sealed&&!send.isPending?<button type="button" className="ww-text-button" disabled={discard.isPending} onClick={()=>discard.mutate()}>{discard.isPending?'Descartando…':'Descartar este intento y editar otro mensaje'}</button>:null}
    </form>
  </div>
}
