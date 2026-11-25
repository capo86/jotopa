import {useState} from 'react'
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query'
import {appUrl} from '../../../lib/env'
import {projectionStatus,issueProjection,revokeProjection,approvedWallCount} from '../feed-api'
import {wallError} from '../models'
import {DEFAULT_PROJECTION_OPTIONS,projectionFragment} from '../presentation-models'
import {ProjectionAppearanceFields} from './ProjectionAppearanceFields'

export function ProjectionControls({eventId,timezone}:{eventId:string;timezone:string}){
  const cache=useQueryClient(),[hours,setHours]=useState(4),[showQr,setShowQr]=useState(true),[prepared,setPrepared]=useState<{slug:string;access:string}|null>(null),[options,setOptions]=useState(DEFAULT_PROJECTION_OPTIONS),[copied,setCopied]=useState(false),[copyError,setCopyError]=useState(false)
  const status=useQuery({queryKey:['wall-projection-status',eventId],queryFn:()=>projectionStatus(eventId),retry:false})
  const approved=useQuery({queryKey:['wall-moderation',eventId,'approved-count'],queryFn:()=>approvedWallCount(eventId),retry:false})
  const issue=useMutation({retry:false,gcTime:0,mutationFn:()=>issueProjection(eventId,hours),onSuccess:async result=>{setPrepared({slug:result.slug,access:result.access});setCopied(false);await cache.invalidateQueries({queryKey:['wall-projection-status',eventId]})}})
  const revoke=useMutation({retry:false,mutationFn:()=>revokeProjection(eventId),onSuccess:async()=>{setPrepared(null);await cache.invalidateQueries({queryKey:['wall-projection-status',eventId]})}})
  let link:string|null=null
  if(prepared){const target=new URL('/e/'+prepared.slug+'/pantalla',appUrl);target.hash=projectionFragment(prepared.access,showQr,options);link=target.href}
  return <details className="ww-projection-controls"><summary><span aria-hidden="true">▣</span> Pantalla de buenos deseos</summary>
    <div className="ww-projection-controls-body"><div><h2>Muchas voces.<br />Una pantalla para compartirlas.</h2><p>Prepará un acceso de solo lectura para el televisor o proyector. Se conserva todo el historial aprobado.</p>
      {approved.isSuccess?<p className="wp-approved-count" role="status">{approved.data===0?'Todavía no hay mensajes aprobados. La pantalla mostrará una bienvenida.':approved.data+' publicaciones aprobadas listas para proyectar.'}</p>:<p role="status">{approved.isError?'No pudimos consultar la cantidad de aprobados. Podés actualizar la moderación.':'Consultando publicaciones aprobadas…'}</p>}
      {status.data?.active&&status.data.expires_at?<p role="status">Hay un enlace habilitado hasta el {new Intl.DateTimeFormat('es-PY',{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(status.data.expires_at))}.</p>:<p>No hay un enlace de proyección habilitado.</p>}
      <details className="wp-instructions"><summary>Instrucciones para el operador</summary><ol><li>Elegí una apariencia coherente con la invitación y texto Grande para leer desde lejos. Las opciones viajan en el enlace, sin modificar el diseño del evento.</li><li>Prepará el enlace y abrilo en el navegador de la pantalla externa. Un enlace nuevo reemplaza al anterior.</li><li>Usá Pantalla completa y Modo presentación. La tecla M muestra u oculta controles; Escape permite volver a ellos.</li><li>Activar audio reproduce una nota visible mediante tu interacción. También podés usar sus controles. El navegador puede pedir otra interacción; no hay reproducción automática garantizada.</li><li>Un audio pausa el recorrido y nunca se superponen voces. Desplazarte manualmente también lo pausa; reanudalo cuando quieras.</li><li>Al llegar al final hay una pausa y un regreso suave al comienzo. Todo el historial permanece accesible. Si se pierde la red, se reconciliarán los cambios al volver.</li><li>El QR solicita el enlace personal del invitado. No habilita publicación pública ni revela destinatarios. Revocá el acceso de pantalla al terminar.</li></ol></details>
    </div><div className="ww-projection-control-fields">
      <label className="field-label">Vigencia del enlace<select className="form-input" value={hours} onChange={event=>setHours(Number(event.target.value))}><option value={1}>1 hora</option><option value={4}>4 horas</option><option value={12}>12 horas</option></select></label>
      <ProjectionAppearanceFields value={options} onChange={value=>{setOptions(value);setCopied(false)}} />
      <label className="flex items-center gap-3 text-xs"><input type="checkbox" checked={showQr} onChange={event=>{setShowQr(event.target.checked);setCopied(false)}} />Mostrar QR para participar</label>
      <p className="text-xs leading-6 text-muted">El QR pide el enlace personal para escribir. La proyección respeta el período de acceso del evento.</p>
      <div className="flex flex-wrap gap-2"><button className="button-primary" type="button" disabled={issue.isPending||revoke.isPending} onClick={()=>{setPrepared(null);issue.mutate()}}>{issue.isPending?'Preparando…':'Preparar nuevo enlace'}</button>{status.data?.active?<button className="button-secondary" type="button" disabled={issue.isPending||revoke.isPending} onClick={()=>revoke.mutate()}>Revocar acceso a la pantalla</button>:null}</div>
      {link?<div className="ww-projection-ready" role="status"><p>Enlace preparado. No permite administrar el evento.</p><div className="flex flex-wrap gap-3"><button type="button" className="button-primary" onClick={()=>{window.open(link,'_blank','noopener,noreferrer')}}>Abrir pantalla</button><button className="button-secondary" type="button" onClick={()=>{void (async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);setCopyError(false)}catch{setCopyError(true)}})()}}>{copied?'Enlace de pantalla copiado':'Copiar enlace de pantalla'}</button></div><p>{copyError?'El navegador no permitió copiar. Abrí la pantalla y copiá el enlace desde su barra de direcciones.':'Si no se abrió una pestaña, copiá el enlace y abrilo en la pantalla externa.'}</p></div>:null}
      {issue.isError||revoke.isError||status.isError?<p role="alert" className="text-sm text-clay">{issue.error instanceof Error&&issue.error.message==='projection_link_limit'?wallError(issue.error):'No pudimos preparar el acceso. Verificá que el evento esté activo y dentro de su período de acceso.'}</p>:null}
    </div></div>
  </details>
}
