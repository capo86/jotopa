import type {ProjectionOptions} from '../presentation-models'
import {ProjectionAppearanceFields} from './ProjectionAppearanceFields'

type Props={auto:boolean;speed:number;showQr:boolean;audioPlaying:boolean;options:ProjectionOptions;onOptions:(value:ProjectionOptions)=>void;onAuto:()=>void;onSpeed:(speed:number)=>void;onLatest:()=>void;onFullscreen:()=>void;onQr:()=>void;onPresent:()=>void;onAudio:()=>void;onStopAudio:()=>void}
export function ProjectionToolbar(props:Props){
  return <footer className="wp-controls" aria-label="Controles de la pantalla">
    <button type="button" aria-pressed={props.auto} onClick={props.onAuto}>{props.auto?'Pausar recorrido':'Iniciar recorrido automático'}</button>
    <label>Ritmo<select aria-label="Velocidad del recorrido" value={props.speed} onChange={event=>props.onSpeed(Number(event.target.value))}><option value={18}>Tranquilo</option><option value={28}>Suave</option><option value={45}>Ágil</option></select></label>
    <button type="button" onClick={props.onLatest}>Últimos mensajes</button>
    <button type="button" onClick={props.audioPlaying?props.onStopAudio:props.onAudio}>{props.audioPlaying?'Detener nota de voz':'Activar audio'}</button>
    <button type="button" onClick={props.onFullscreen}>Pantalla completa</button>
    <button type="button" aria-pressed={props.showQr} onClick={props.onQr}>{props.showQr?'Ocultar QR':'Mostrar QR'}</button>
    <button type="button" onClick={props.onPresent}>Modo presentación</button>
    <details className="wp-appearance"><summary>Apariencia</summary><ProjectionAppearanceFields value={props.options} onChange={props.onOptions} includeMode={false} /></details>
  </footer>
}
