import type {Tracking} from '../models'
import {DELIVERY_LABELS} from '../models'
export function DeliveryStatus({tracking,unavailable=false}:{tracking:Tracking|undefined;unavailable?:boolean}){
  return <div className="mt-2 text-xs leading-5"><p className="font-medium text-forest">{unavailable?'Seguimiento no disponible':tracking?DELIVERY_LABELS[tracking.status]:'Seguimiento: cargando…'}</p>{tracking && tracking.open_count>0?<p className="text-muted">{tracking.open_count} {tracking.open_count===1?'apertura registrada':'aperturas registradas'}</p>:null}</div>
}
