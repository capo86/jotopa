import {useEffect,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {syncWallFeed} from '../feed-api'
import type {WallAccess,WallFeed} from '../feed-models'
import {useWallRealtime} from './useWallRealtime'

export function useWallFeed(access:WallAccess,scope:string){
  const cache=useQueryClient(),[expiredFor,setExpiredFor]=useState<string|null>(null)
  const query=useQuery({queryKey:[scope,'feed'],queryFn:({signal})=>syncWallFeed(access,cache.getQueryData<WallFeed>([scope,'feed']),signal),retry:false,gcTime:0,staleTime:15000,refetchOnWindowFocus:true,refetchOnReconnect:true,refetchInterval:state=>{
    const data=state.state.data,error=state.state.error
    if((error instanceof Error&&['projection_unavailable','invitation_unavailable'].includes(error.message))||(data&&expiredFor===data.access_expires_at))return false
    if(data?.retry_at)return Math.max(1000,data.retry_at-Date.now());return data?.syncing?5000:30000
  }})
  const data=query.data,refetch=query.refetch
  const unavailable=query.isError&&query.error instanceof Error&&['projection_unavailable','invitation_unavailable'].includes(query.error.message)
  const expired=Boolean(data&&expiredFor===data.access_expires_at)
  const connection=useWallRealtime(!unavailable&&!expired?data?.stream_topic:undefined,scope)
  useEffect(()=>{
    if(!data)return
    const now=Date.parse(data.server_time),expires=Date.parse(data.access_expires_at)
    const next=[expires,Date.parse(data.opens_at),Date.parse(data.closes_at)].filter(time=>time>now).sort((a,b)=>a-b)[0]
    if(next===undefined){if(expires<=now){const timer=setTimeout(()=>setExpiredFor(data.access_expires_at),0);return()=>clearTimeout(timer)}return}
    const timer=setTimeout(()=>{if(next===expires)setExpiredFor(data.access_expires_at);void refetch()},Math.min(2_000_000_000,Math.max(100,next-now+100)))
    return()=>clearTimeout(timer)
  },[data,refetch])
  return {...query,connection,unavailable:unavailable||expired}
}
