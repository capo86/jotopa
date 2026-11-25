import {useState} from 'react'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import {ProjectionScreen} from './ProjectionScreen'
import type {ProjectionOptions} from '../presentation-models'

export function ProjectionSession({slug,credential,initialQr,initialOptions}:{slug:string;credential:string;initialQr:boolean;initialOptions:ProjectionOptions}){
  const [cache]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false,gcTime:0}}}))
  return <QueryClientProvider client={cache}><ProjectionScreen slug={slug} credential={credential} initialQr={initialQr} initialOptions={initialOptions} /></QueryClientProvider>
}
