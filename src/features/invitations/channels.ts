import {normalizePhone,personalInvitationUrl} from '../guests/index.ts'
import type {MessagePayload} from './models.ts'

export type PersonalizedMessage={text:string;link:string;phone:string|null}
export interface MessageChannel {id:'whatsapp'|'link';createUrl:(message:PersonalizedMessage)=>string}
export function renderMessage(payload:MessagePayload,appUrl:string):PersonalizedMessage{
  const link=personalInvitationUrl(appUrl,payload.token)
  const date=(value:string)=>new Intl.DateTimeFormat('es-PY',{dateStyle:'long',timeStyle:'short',timeZone:payload.timezone}).format(new Date(value))
  const variables:Record<string,string>={nombre:payload.full_name,link,fecha:date(payload.starts_at),lugar:payload.location_label || 'Lugar a confirmar',fecha_limite:date(payload.rsvp_deadline)}
  const text=payload.body.replace(/\{(nombre|link|fecha|lugar|fecha_limite)\}/g,(_match,key:string)=>variables[key] ?? '')
  if(text.length>8000) throw new Error('message_too_long')
  return {text,link,phone:payload.phone}
}
export const whatsappChannel:MessageChannel={id:'whatsapp',createUrl(message){
  if(!message.phone || !/^\+[1-9][0-9]{7,14}$/.test(message.phone))throw new Error('invitation_invalid_phone')
  try{if(normalizePhone(message.phone)!==message.phone)throw new Error('invalid')}catch{throw new Error('invitation_invalid_phone')}
  return `https://wa.me/${message.phone.slice(1)}?text=${encodeURIComponent(message.text)}`
}}
export const linkChannel:MessageChannel={id:'link',createUrl:message=>message.link}
