import {useState} from 'react'
import {useNavigate} from 'react-router'
import {appUrl} from '../../../lib/env'
import {Brand} from '../../../components/ui/Brand'
import {personalEntryPath} from '../feed-models'
import '../projection.css'

export function Component(){
  const [value,setValue]=useState(''),[invalid,setInvalid]=useState(false),navigate=useNavigate()
  return <main className="we-entry"><div className="we-entry-card"><Brand /><p className="we-kicker">EL ENCUENTRO TAMBIÉN LO HACEMOS CON PALABRAS</p><h1>Tu voz,<br /><em>un lindo recuerdo.</em></h1><p>Para compartir tus buenos deseos, abrí la invitación personal que recibiste por WhatsApp o pegá su enlace acá.</p><form onSubmit={event=>{event.preventDefault();const path=personalEntryPath(value,[new URL(appUrl).origin,window.location.origin]);if(path){setValue('');navigate(path)}else setInvalid(true)}}><label htmlFor="wall-personal-link">Tu enlace personal</label><input id="wall-personal-link" type="url" autoComplete="off" spellCheck={false} value={value} onChange={event=>{setValue(event.target.value);setInvalid(false)}} placeholder="Pegá el enlace de tu invitación" required /><button type="submit">Ir a mis buenos deseos <span aria-hidden="true">↗</span></button>{invalid?<p role="alert">Ese enlace no parece una invitación de Jotopa. Revisá el que te compartió el anfitrión.</p>:null}</form><p className="we-entry-note">Tu invitación nos permite identificar de quién es cada recuerdo. No necesitás registrarte ni confirmar asistencia.</p></div></main>
}
