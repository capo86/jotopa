import {useState} from 'react'
import {useQuery,useMutation} from '@tanstack/react-query'
import {Link} from 'react-router'
import {useAuth} from '../context'
import {fetchProfile} from '../api'
import {requireSupabase} from '../../../lib/supabase'
import {listEvents} from '../../events'
import {EVENT_ROLES,ROLE_LABELS} from '../../../lib/permissions'

export function Component(){
  const {session}=useAuth(),userId=session?.user.id??''
  const profile=useQuery({queryKey:['profile',userId],queryFn:({signal})=>fetchProfile(userId,signal),enabled:Boolean(userId)})
  const allowed=profile.data?.platform_role==='super_admin'
  const events=useQuery({queryKey:['events'],queryFn:({signal})=>listEvents(signal),enabled:allowed})
  const [message,setMessage]=useState('')
  const creation=useMutation({retry:false,gcTime:0,mutationFn:async(body:Record<string,string>)=>{
    const {error}=await requireSupabase().functions.invoke('create-event-user',{body})
    if(error){
      const result=error.context instanceof Response?await error.context.json().catch(()=>null):null
      if(result?.error==='account_cleanup_required')throw new Error('No se completó la asignación y es necesario revisar la cuenta en Supabase antes de reintentar.')
      if(result?.error==='rate_limited')throw new Error('Se alcanzó el límite de creaciones. Esperá antes de volver a intentar.')
      throw new Error('No se pudo crear el usuario. Verificá los datos, el evento y si el correo ya existe.')
    }
  },onSuccess:()=>setMessage('Usuario creado y vinculado al evento. Compartí sus datos de acceso de forma segura.')})
  if(profile.isPending)return <p role="status">Comprobando permisos…</p>
  if(profile.isError)return <p role="alert">No pudimos comprobar tus permisos. Volvé a intentarlo.</p>
  if(!allowed)return <p role="alert">No tenés permiso para administrar usuarios.</p>
  return <section className="max-w-xl"><Link to="/perfil" className="text-sm underline">Volver a mi perfil</Link><p className="eyebrow mt-8">ADMINISTRACIÓN DE JOTOPA</p><h1 className="mt-4 font-display text-5xl text-forest">Crear miembro</h1><p className="mt-4 text-sm leading-7 text-muted">Creá su cuenta y elegí el evento y el rol que le corresponden.</p>
    <form className="mt-8 space-y-5 rounded-2xl border border-line bg-paper p-6" onSubmit={event=>{event.preventDefault();setMessage('');const form=event.currentTarget,fields=new FormData(form),body=Object.fromEntries(['fullName','email','password','eventId','role'].map(key=>[key,String(fields.get(key)??'')]));creation.mutate(body,{onSuccess:()=>form.reset(),onSettled:()=>{body.password=''}})}}>
      <label className="field-label">Nombre completo<input className="form-input" name="fullName" required minLength={2} maxLength={120} /></label>
      <label className="field-label">Correo electrónico<input className="form-input" name="email" type="email" required maxLength={254} /></label>
      <label className="field-label">Contraseña inicial<input className="form-input" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{10,72}" /></label>
      <p className="text-xs text-muted">Al menos 10 caracteres, una mayúscula, una minúscula y un número.</p>
      <label className="field-label">Evento<select className="form-input" name="eventId" required defaultValue=""><option value="" disabled>Seleccioná un evento</option>{events.data?.map(event=><option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
      {events.isError?<p role="alert">No pudimos cargar los eventos.</p>:null}{events.data?.length===0?<p>Primero creá un evento para vincular al miembro.</p>:null}
      <label className="field-label">Rol en el evento<select className="form-input" name="role" defaultValue="content">{EVENT_ROLES.map(role=><option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></label>
      <button className="button-primary" disabled={creation.isPending||!events.data?.length} type="submit">{creation.isPending?'Creando…':'Crear miembro'}</button>
      {creation.isError?<p role="alert" className="text-clay">{creation.error.message}</p>:null}{message?<p role="status">{message}</p>:null}
    </form></section>
}
