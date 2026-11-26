import type {CSSProperties,ReactNode} from 'react'
import {PALETTES} from '../models'
import type {AssetImages,InvitationDesign,PresentationEvent} from '../models'
import {InvitationHero} from './InvitationHero'
import {AssetPhoto} from './AssetPhoto'
import {Countdown} from './Countdown'
import {ScheduleSection} from './ScheduleSection'
import {GiftsSection} from './GiftsSection'
import {LodgingSection} from './LodgingSection'
import {PhotoCarousel} from './PhotoCarousel'
import '../invitation.css'

export function InvitationPresentation({design,event,guestName,images,rsvp,footer,personalDetails,wall,onImageError}:{design:InvitationDesign;event:PresentationEvent;guestName:string;images:AssetImages;rsvp:ReactNode;footer?:ReactNode;personalDetails?:ReactNode;wall?:ReactNode;onImageError?:()=>void}){
  const palette=PALETTES[design.palette]
  const styles={'--iv-paper':palette.paper,'--iv-ink':palette.ink,'--iv-accent':palette.accent,'--iv-soft':palette.soft} as CSSProperties
  const active=(id:string)=>design.sections.some(section=>section.id===id&&section.enabled)
  const renderSection=(id:InvitationDesign['sections'][number]['id'])=>{
    switch(id){
      case 'welcome':return <section className="iv-section iv-welcome"><span className="iv-ornament" aria-hidden="true">❋</span><p className="iv-kicker">EL ENCUENTRO EMPIEZA CON VOS</p>{design.show_guest_name?<p className="iv-guest-name">{guestName},</p>:null}<h2>hay un lugar para vos<br /><em>en este día.</em></h2><p className="iv-prose">{design.welcome||'Nos hace ilusión compartir este día con vos. Será un encuentro para celebrar, abrazarnos y crear nuevos recuerdos.'}</p></section>
      case 'countdown':return <section className="iv-section iv-countdown-section"><Countdown startsAt={event.starts_at} /></section>
      case 'schedule':return <ScheduleSection items={design.schedule} timezone={event.timezone} images={images} {...(onImageError?{onImageError}:{})} />
      case 'gifts':return <GiftsSection gifts={design.gifts} />
      case 'lodging':return <LodgingSection items={design.lodging} images={images} {...(onImageError?{onImageError}:{})} />
      case 'dress':return design.dress_code||design.dress_photo_asset_id?<section className="iv-section iv-dress"><span className="iv-ornament" aria-hidden="true">◇</span><p className="iv-kicker">VESTIMENTA SUGERIDA</p><h2>Un detalle más.</h2><p className="iv-prose">{design.dress_code}</p>{design.dress_photo_asset_id?<div className="iv-dress-photo"><AssetPhoto key={images[design.dress_photo_asset_id]?.large??design.dress_photo_asset_id} image={images[design.dress_photo_asset_id]} {...(onImageError?{onError:onImageError}:{})} /></div>:null}</section>:null
      case 'gallery':return design.gallery.length?<section className="iv-section iv-gallery"><div className="iv-section-heading"><p className="iv-kicker">INSTANTES QUE NOS TRAJERON HASTA ACÁ</p><h2>Un poco de nuestra historia.</h2></div><PhotoCarousel photos={design.gallery} images={images} {...(onImageError?{onImageError}:{})} /></section>:null
      case 'details':return design.details?<section className="iv-section iv-details"><p className="iv-kicker">ANTES DE ENCONTRARNOS</p><h2>Para tener en cuenta.</h2><p className="iv-prose">{design.details}</p></section>:null
      case 'rsvp':return <section className="iv-section iv-rsvp"><div className="iv-section-heading"><span className="iv-ornament" aria-hidden="true">✉</span><p className="iv-kicker">LO MÁS IMPORTANTE ES COMPARTIRLO</p><h2>¿Contamos con vos?</h2></div><div className="iv-rsvp-panel">{rsvp}</div></section>
      case 'closing':return <section className="iv-section iv-closing"><span className="iv-ornament" aria-hidden="true">✳</span><p className="iv-kicker">ESTE DÍA TAMBIÉN ES TUYO</p><h2>{design.closing||'Qué lindo será encontrarnos.'}</h2><p className="iv-closing-signature">{design.names||event.title}</p></section>
    }
  }
  return <div className={`iv iv-${design.template} iv-font-${design.font_pair}`} style={styles}><div className="iv-page"><InvitationHero design={design} event={event} image={design.cover_asset_id?images[design.cover_asset_id]:undefined} {...(onImageError?{onImageError}:{})} /><nav aria-label="Secciones de la invitación" className="iv-nav"><span>JOTOPA <i>· encuentro</i></span><div>{active('schedule')&&design.schedule.some(item=>item.enabled)?<a href="#iv-schedule">El encuentro</a>:null}{active('rsvp')?<a href="#iv-rsvp">Confirmar asistencia <span aria-hidden="true">↗</span></a>:null}{wall?<a href="#buenos-deseos">Buenos deseos</a>:null}</div></nav>{personalDetails}{design.sections.filter(section=>section.enabled).map(section=><div key={section.id} id={`iv-${section.id}`}>{section.id==='closing'?wall:null}{renderSection(section.id)}</div>)}{!active('closing')?wall:null}<footer className="iv-footer">{footer}<a href="/" className="iv-brand">jotopa<span>.</span></a><p>Encuentros que se convierten en recuerdos.</p></footer></div></div>
}
