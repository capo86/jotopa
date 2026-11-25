import {useQuery} from '@tanstack/react-query'
import {signGuestMedia} from '../api'
import type {WallPost} from '../models'
import {WallPostBubble} from './WallPostBubble'

export function GuestConversationPage({token,posts,timezone}:{token:string;posts:WallPost[];timezone:string}){
  const ids=posts.filter(post=>post.media.length).map(post=>post.id)
  const images=useQuery({queryKey:['guest-wall-media',...ids],queryFn:()=>signGuestMedia(token,ids),enabled:ids.length>0,retry:false,gcTime:0,refetchInterval:45_000,refetchOnWindowFocus:true})
  return <>{images.isError?<p className="ww-note" role="status">No pudimos cargar algunos archivos privados. <button className="ww-text-button" type="button" onClick={()=>{void images.refetch()}}>Volver a cargar archivos</button></p>:null}{posts.map(post=><WallPostBubble key={post.id} post={post} images={images.data??{}} timezone={timezone} />)}</>
}
