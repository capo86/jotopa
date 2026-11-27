import type {AssetImages,InvitationDesign} from '../models'
import {AssetPhoto} from './AssetPhoto'
import {LocationLinks} from './LocationLinks'

export function ScheduleSection({items,timezone,images,onImageError}:{items:InvitationDesign['schedule'];timezone:string;images:AssetImages;onImageError?:()=>void}){
  const visible=items.filter(item=>item.enabled)
  if(!visible.length)return null
  const date=(value:string)=>new Intl.DateTimeFormat('es-PY',{day:'numeric',month:'long',timeZone:timezone}).format(new Date(value))
  const time=(value:string)=>new Intl.DateTimeFormat('es-PY',{hour:'2-digit',minute:'2-digit',timeZone:timezone}).format(new Date(value))
  return <section className="iv-section iv-schedule"><div className="iv-section-heading"><p className="iv-kicker">LOS DETALLES DEL ENCUENTRO</p><h2>Cuándo y dónde.</h2></div><div className={`iv-schedule-grid ${visible.length===1?'iv-single-location':''}`}>{visible.map((item,index)=><article key={item.id} className={`iv-schedule-card iv-location-card iv-location-${item.kind}`}>{item.photo_asset_id?<div className="iv-card-photo"><AssetPhoto key={images[item.photo_asset_id]?.large??item.photo_asset_id} image={images[item.photo_asset_id]} {...(onImageError?{onError:onImageError}:{})} /></div>:null}<div className="iv-location-content"><span className="iv-number">0{index+1}</span><p className="iv-kicker">{item.label}</p><h3>{item.venue||item.label}</h3><div className="iv-time"><span>{date(item.starts_at)}</span><span>{time(item.starts_at)}</span></div>{item.description?<p className="iv-card-prose">{item.description}</p>:null}{item.address?<p className="iv-address">{item.address}</p>:null}<LocationLinks location={item} /></div></article>)}</div></section>
}
