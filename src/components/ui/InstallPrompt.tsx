import {useEffect,useState} from 'react'

type InstallEvent=Event & {prompt:()=>Promise<{outcome:'accepted'|'dismissed'}>}
type MobilePlatform='ios'|'android'
const storageKey='jotopa-install-dismissed-until'
const snooze=30*24*60*60*1000

function dismissedUntil(){
  try{return Number(window.localStorage.getItem(storageKey)??0)}catch{return 0}
}
function rememberDismissal(){
  try{window.localStorage.setItem(storageKey,String(Date.now()+snooze))}catch{/* Private browsing can block storage. */}
}
export function InstallPrompt(){
  const [platform]=useState<MobilePlatform|null>(()=>{
    const standalone=window.matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone===true
    if(standalone||dismissedUntil()>Date.now())return null
    const agent=navigator.userAgent
    return /iPhone|iPad|iPod/i.test(agent)?'ios':/Android/i.test(agent)?'android':null
  })
  const [installEvent,setInstallEvent]=useState<InstallEvent|null>(null)
  const [visible,setVisible]=useState(false)
  const [instructions,setInstructions]=useState(false)
  useEffect(()=>{
    if(!platform)return
    const timer=window.setTimeout(()=>setVisible(true),1200)
    const beforeInstall=(event:Event)=>{event.preventDefault();setInstallEvent(event as InstallEvent)}
    const installed=()=>{setVisible(false);setInstallEvent(null);rememberDismissal()}
    window.addEventListener('beforeinstallprompt',beforeInstall)
    window.addEventListener('appinstalled',installed)
    return()=>{window.clearTimeout(timer);window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',installed)}
  },[platform])
  const dismiss=()=>{rememberDismissal();setVisible(false)}
  const install=async()=>{
    if(!installEvent){setInstructions(true);return}
    try{
      const choice=await installEvent.prompt()
      setInstallEvent(null)
      if(choice.outcome==='accepted')setVisible(false)
      else dismiss()
    }catch{setInstallEvent(null);setInstructions(true)}
  }
  if(!visible||!platform)return null
  return <aside aria-label="Agregar Jotopa a tu pantalla de inicio" className="fixed inset-x-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-50 mx-auto max-w-sm rounded-2xl border border-forest/20 bg-paper p-5 text-forest shadow-[0_18px_55px_#142b2380]">
    <div className="flex items-start gap-3"><img src="/icons/jotopa-192.png" alt="" width="48" height="48" className="size-12 shrink-0 rounded-xl" /><div className="min-w-0 flex-1"><p className="font-display text-2xl leading-tight">Jotopa a mano.</p><p className="mt-1 text-xs leading-5 text-muted">¿Querés un acceso directo en la pantalla de tu celular?</p></div><button type="button" aria-label="Cerrar sugerencia de instalación" className="grid size-11 shrink-0 place-items-center rounded-full text-xl text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest" onClick={dismiss}>×</button></div>
    {instructions?<p className="mt-4 rounded-xl bg-canvas p-3 text-xs leading-6 text-forest">{platform==='ios'?<>Tocá <strong>Compartir</strong> en el navegador y elegí <strong>Agregar a pantalla de inicio</strong>. Después tocá <strong>Agregar</strong>.</>:<>Si estás en WhatsApp, abrí el sitio en Chrome. Luego abrí el menú <strong>⋮</strong> y elegí <strong>Instalar app</strong> o <strong>Agregar a pantalla de inicio</strong>.</>}</p>:null}
    <div className="mt-4 flex items-center gap-3"><button type="button" className="button-primary min-h-11 flex-1" onClick={()=>{if(instructions){dismiss();return}void install()}}>{instructions?'Entendido':'Agregar acceso'}</button><button type="button" className="min-h-11 px-2 text-xs text-muted underline" onClick={dismiss}>Ahora no</button></div>
  </aside>
}