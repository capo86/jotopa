import type {AssetImages,InvitationDesign} from '../models'
import {AssetPhoto} from './AssetPhoto'
import {LocationLinks} from './LocationLinks'

export function LodgingSection({items,images,onImageError}:{items:InvitationDesign['lodging'];images:AssetImages;onImageError?:()=>void}){
  const visible=items.filter(item=>item.enabled)
  if(!visible.length)return null
  return <section className="iv-section iv-lodging"><div className="iv-section-heading"><p className="iv-kicker">PARA QUE SOLO PIENSES EN DISFRUTAR</p><h2>¿Venís de lejos?</h2><p>Algunas sugerencias para quedarte cerca del encuentro. Consultá directamente con cada hospedaje.</p></div><div className={`iv-lodging-grid ${visible.length===1?'iv-single-location':''}`}>{visible.map(item=><article key={item.id} className="iv-lodging-card">{item.photo_asset_id?<div className="iv-card-photo"><AssetPhoto key={item.photo_asset_id} image={images[item.photo_asset_id]} {...(onImageError?{onError:onImageError}:{})} /></div>:null}<div className="iv-lodging-content"><h3>{item.name}</h3>{item.description?<p className="iv-card-prose">{item.description}</p>:null}{item.address?<p className="iv-address">{item.address}</p>:null}<LocationLinks location={item} /><div className="iv-contact-links">{item.phone?<a href={`tel:${item.phone}`}>Llamar <span>{item.phone}</span></a>:null}{item.whatsapp?<a href={`https://wa.me/${item.whatsapp.slice(1)}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">WhatsApp del hospedaje ↗</a>:null}{item.booking_url?<a href={item.booking_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Consultar reservas ↗</a>:null}</div></div></article>)}</div></section>
}
