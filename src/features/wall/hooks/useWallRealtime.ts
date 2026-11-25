import {useEffect,useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import type {RealtimeChannel} from '@supabase/supabase-js'
import {requireSupabase} from '../../../lib/supabase'
import {wallAnonymous} from '../feed-api'

export function useWallRealtime(topic:string|undefined,scope:string,eventId?:string){
  const cache=useQueryClient(),[connection,setConnection]=useState<'connecting'|'live'|'retrying'>('connecting')
  useEffect(()=>{
    if(!topic)return
    const sdk=eventId?requireSupabase():wallAnonymous;if(!sdk)return
    let cancelled=false,channel:RealtimeChannel|undefined,timer:ReturnType<typeof setTimeout>|undefined,lastRefresh=0
    const refresh=()=>{if(cancelled)return;lastRefresh=Date.now();void cache.invalidateQueries({queryKey:eventId?[scope,eventId]:[scope,'feed']})}
    const schedule=()=>{if(cancelled||timer)return;const delay=Math.max(0,5000-(Date.now()-lastRefresh));timer=setTimeout(()=>{timer=undefined;refresh()},delay)}
    const visible=()=>{if(document.visibilityState==='visible')schedule()}
    document.addEventListener('visibilitychange',visible)
    window.addEventListener('online',schedule)
    // The microtask avoids opening a socket in StrictMode's discarded effect.
    // Await an old subscription's removal before a new session reuses its topic.
    void Promise.resolve().then(async()=>{
      if(cancelled)return
      const previous=sdk.getChannels().find(item=>item.topic===`realtime:${topic}`)
      if(previous)await sdk.removeChannel(previous)
      if(cancelled)return
      channel=sdk.channel(topic,{config:{private:true}}).on('broadcast',{event:'wall_changed'},()=>schedule()).subscribe(status=>{
        if(cancelled)return
        if(status==='SUBSCRIBED'){setConnection('live');schedule()}else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status))setConnection('retrying')
      })
    }).catch(()=>{if(!cancelled)setConnection('retrying')})
    return()=>{cancelled=true;if(timer)clearTimeout(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',schedule);if(channel)void sdk.removeChannel(channel)}
  },[topic,scope,eventId,cache])
  return topic?connection:'connecting'
}
