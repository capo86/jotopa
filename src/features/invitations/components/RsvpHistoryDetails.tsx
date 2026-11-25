import type {z} from 'zod'
import type {historySchema} from '../models'

export function RsvpHistoryDetails({meta}:{meta:z.infer<typeof historySchema>['rows'][number]['meta']}){
  if(meta.response==='maybe')return <p className="mt-2 text-sm text-muted">Quizás · respuesta histórica conservada; esta opción ya no está disponible.</p>
  const count=meta.response==='yes'?(meta.companions??0)+1:0
  return <p className="mt-2 text-sm text-muted">{meta.response==='yes'?'Sí, asistiré':'No asistiré'} · {count} {count===1?'persona':'personas'}{meta.historical?' · respuesta anterior incorporada':''}</p>
}
