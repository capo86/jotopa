import {useQuery} from '@tanstack/react-query'

export function ParticipationQr({url}:{url:string}){
  const qr=useQuery({queryKey:['wall-entry-qr',url],queryFn:async()=>{const module=await import('qrcode');return module.toDataURL(url,{width:384,margin:4,errorCorrectionLevel:'M',color:{dark:'#183d30',light:'#ffffff'}})},staleTime:Infinity,retry:false})
  return <div className="wp-qr-block">{qr.data?<img src={qr.data} alt="QR para compartir buenos deseos con tu enlace personal" width="384" height="384" />:<div className="wp-qr-loading" role="status">{qr.isError?'No pudimos preparar el QR.':'Preparando QR…'}</div>}<h2>Escaneá y dejá<br />tus buenos deseos.</h2><p>Escaneá y usá tu enlace personal<br />para compartir tus buenos deseos.</p></div>
}
