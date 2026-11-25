import {useSyncExternalStore} from 'react'

function subscribe(change:()=>void){
  window.addEventListener('online',change);window.addEventListener('offline',change)
  return()=>{window.removeEventListener('online',change);window.removeEventListener('offline',change)}
}
const snapshot=()=>navigator.onLine
export function useOnlineStatus(){return useSyncExternalStore(subscribe,snapshot,()=>true)}
