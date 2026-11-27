import type {CSSProperties} from 'react'
import './rsvp-confetti.css'

const colors=['#945e67','#d8a68b','#e1c57d','#34473a','#dce3d6']
const pieces=Array.from({length:28},(_,index)=>({
  left:(index*37+13)%100,
  drift:(index*23)%101-50,
  delay:(index%8)*65,
  duration:2100+(index%5)*210,
  color:colors[index%colors.length],
}))

export function RsvpConfetti(){
  return <div className="rsvp-confetti" aria-hidden="true">{pieces.map((piece,index)=><span key={index} className="rsvp-confetti-piece" style={{
    left:piece.left+'%',
    backgroundColor:piece.color,
    animationDelay:piece.delay+'ms',
    animationDuration:piece.duration+'ms',
    '--rsvp-drift':piece.drift+'px',
  } as CSSProperties} />)}</div>
}