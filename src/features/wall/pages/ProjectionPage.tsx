import {useLocation,useParams} from 'react-router'
import {projectionAccessFromHash} from '../feed-models'
import {projectionOptionsFromHash} from '../presentation-models'
import {ProjectionSession} from '../components/ProjectionSession'
import '../projection.css'

export function Component(){
  const {slug=''}=useParams(),location=useLocation(),credential=projectionAccessFromHash(location.hash)
  const showQr=new URLSearchParams(location.hash.replace(/^#/,'' )).get('qr')!=='0'
  if(!credential)return <main className="wp-shell"><div className="wp-error"><p className="wp-kicker">JOTOPA · BUENOS DESEOS</p><h1>Hace falta un enlace<br />de proyección válido.</h1><p>Pedile el acceso a quien organiza el encuentro.</p></div></main>
  return <ProjectionSession key={`${slug}:${credential}`} slug={slug} credential={credential} initialQr={showQr} initialOptions={projectionOptionsFromHash(location.hash)} />
}
