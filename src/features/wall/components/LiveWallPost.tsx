import {memo,useEffect,useRef,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {WallMediaError} from '../models'
import type {WallPost} from '../models'
import type {WallAccess} from '../feed-models'
import {signWallFeedMedia} from '../feed-api'
import {WallPostBubble} from './WallPostBubble'

export const LiveWallPost=memo(function LiveWallPost({post,access,scope,timezone,releaseOffscreen=false}:{post:WallPost;access:WallAccess;scope:string;timezone:string;releaseOffscreen?:boolean}){
  const wrapper=useRef<HTMLDivElement>(null),[visible,setVisible]=useState(false),[playing,setPlaying]=useState(false)
  useEffect(()=>{const element=wrapper.current;if(!element)return;const observer=new IntersectionObserver(entries=>{setVisible(entries.some(entry=>entry.isIntersecting))},{rootMargin:'600px'});observer.observe(element);return()=>observer.disconnect()},[])
  // Audio may keep playing after the guest scrolls away. Keep its next signed
  // URL fresh so the current recording finishes uninterrupted and can replay.
  const active=visible||playing
  const updatePlayback=()=>setPlaying([...wrapper.current?.querySelectorAll('audio')??[]].some(audio=>!audio.paused&&!audio.ended))
  const images=useQuery({queryKey:[scope,'media',post.id],queryFn:()=>signWallFeedMedia(access,[post.id]),enabled:active&&post.media.length>0,retry:false,gcTime:0,refetchInterval:state=>active?(state.state.error instanceof WallMediaError&&state.state.error.retryAfter?state.state.error.retryAfter*1000+250:45000):false,refetchIntervalInBackground:playing,refetchOnWindowFocus:true})
  const waiting=Boolean(images.error instanceof WallMediaError&&images.error.retryAfter)
  const retryMedia=()=>{if(!waiting)void images.refetch()}
  return <div ref={wrapper} className="ww-live-post" data-wall-post-id={post.id} onPlayCapture={()=>setPlaying(true)} onPauseCapture={updatePlayback} onEndedCapture={updatePlayback}><WallPostBubble post={post} images={!releaseOffscreen||active?images.data??{}:{}} timezone={timezone} onMediaRetry={retryMedia} showDuration={releaseOffscreen} />{visible&&images.isError?<p className="ww-note" role="status">{waiting?'Estamos esperando para renovar estos archivos. Se actualizarán automáticamente.':'No pudimos cargar estos archivos.'} <button className="ww-text-button" type="button" disabled={images.isFetching||waiting} onClick={retryMedia}>Volver a cargar archivos</button></p>:null}</div>
})
