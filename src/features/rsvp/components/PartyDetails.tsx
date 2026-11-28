import type {Invitation} from '../models'

export function PartyDetails({invitation}:{invitation:Invitation}){
  const {guest}=invitation
  return <aside aria-label="Datos de tu invitación" className="iv-personal border-y border-line px-6 py-7 text-center text-forest"><p className="text-sm leading-7">Invitación válida para <strong>{guest.party_size} {guest.party_size===1?'persona':'personas'}</strong>.</p>{guest.rsvp_status==='no'?null:guest.table_name?<p className="mt-3 font-display text-2xl leading-relaxed">Tu lugar en nuestra celebración: <strong>{guest.table_name}</strong>.</p>:<p className="mt-4 inline-flex items-center gap-2 rounded-full border border-current/20 px-4 py-2 text-xs"><span aria-hidden="true" className="motion-safe:animate-pulse">⌛</span>Estamos organizando las mesas. Tu número aparecerá aquí.</p>}</aside>
}
