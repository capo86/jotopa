import type {InvitationDesign} from '../models'
import {BankDetails} from './BankDetails'

export function GiftsSection({gifts}:{gifts:InvitationDesign['gifts']}){
  const items=gifts.items.filter(item=>item.enabled)
  if(!items.length&&!gifts.message&&!gifts.banking.enabled)return null
  return <section className="iv-section iv-gifts"><div className="iv-section-heading"><span className="iv-ornament" aria-hidden="true">✧</span><p className="iv-kicker">LOS GESTOS QUE SE VUELVEN RECUERDOS</p><h2>Tu presencia, el mejor regalo.</h2>{gifts.message?<p className="iv-prose">{gifts.message}</p>:null}</div>{items.length?<ul className="iv-gift-grid">{items.map((item,index)=><li key={item.id} className="iv-gift-card"><span className="iv-number">{String(index+1).padStart(2,'0')}</span><h3>{item.name}</h3>{item.description?<p className="iv-card-prose">{item.description}</p>:null}{item.url?<a href={item.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Ver regalo <span aria-hidden="true">↗</span></a>:null}</li>)}</ul>:null}<BankDetails banking={gifts.banking} /></section>
}
