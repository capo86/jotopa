import {useEffect,useState} from 'react'

export function Countdown({startsAt}:{startsAt:string}){
  const [now,setNow]=useState(()=>Date.now())
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[])
  const seconds=Math.max(0,Math.floor((Date.parse(startsAt)-now)/1000))
  const parts=[Math.floor(seconds/86400),Math.floor(seconds/3600)%24,Math.floor(seconds/60)%60,seconds%60]
  return <div className="iv-countdown" aria-label={seconds?'Cuenta regresiva hasta el evento':'El día del encuentro ya llegó'}><p className="iv-kicker">{seconds?'CADA VEZ FALTA MENOS':'EL DÍA DEL ENCUENTRO YA LLEGÓ'}</p><h2>{seconds?'Contando los momentos.':'Es tiempo de encontrarnos.'}</h2><dl>{parts.map((part,index)=><div key={index}><dt>{['Días','Horas','Minutos','Segundos'][index]}</dt><dd>{String(part).padStart(2,'0')}</dd></div>)}</dl></div>
}
