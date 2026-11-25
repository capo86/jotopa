import {RsvpForm} from './RsvpForm'
import {RSVP_LABELS} from '../models'
import type {Invitation} from '../models'

export function RsvpPanel({token,invitation}:{token:string;invitation:Invitation}){
  const {event,guest}=invitation
  const date=(value:string)=>new Intl.DateTimeFormat('es-PY',{dateStyle:'long',timeStyle:'short',timeZone:event.timezone}).format(new Date(value))
  return <><div role="status" className="border-b border-line pb-6"><p className="eyebrow">TU RESPUESTA</p><p className="mt-2 font-display text-2xl text-forest">{RSVP_LABELS[guest.rsvp_status]}{guest.rsvp_status==='yes'&&guest.attending_count?` · ${guest.attending_count} ${guest.attending_count===1?'persona confirmada':'personas confirmadas'}`:''}</p>{guest.rsvp_at?<p className="mt-2 text-xs leading-5 text-muted">Guardada el {date(guest.rsvp_at)}. Podés cambiarla mientras el plazo esté abierto.</p>:<p className="mt-2 text-sm text-muted">Nos va a encantar saber si venís.</p>}</div>{event.rsvp_deadline?<p className="mt-5 text-center text-sm leading-7 text-forest">Fecha límite para confirmar: {date(event.rsvp_deadline)} · {event.timezone}.</p>:null}{invitation.can_respond?<><RsvpForm key={guest.version} token={token} invitation={invitation} /></>:<p role="status" className="mt-7 rounded-lg bg-canvas p-5 text-sm leading-7 text-muted">El plazo para responder terminó. Tu respuesta guardada sigue visible. Si necesitás cambiarla, consultá con quien te invitó.</p>}</>
}
