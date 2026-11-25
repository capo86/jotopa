import type {ProjectionOptions} from '../presentation-models'

export function ProjectionAppearanceFields({value,onChange,includeMode=true}:{value:ProjectionOptions;onChange:(options:ProjectionOptions)=>void;includeMode?:boolean}){
  return <div className="wp-appearance-fields">
    <label>Estilo de pantalla<select aria-label="Estilo de pantalla" value={value.look} onChange={event=>onChange({...value,look:event.target.value==='rose'?'rose':event.target.value==='night'?'night':'olive'})}><option value="olive">Oliva · Entre nosotros</option><option value="rose">Rosa · Que sea inolvidable</option><option value="night">Noche · Lo esencial</option></select></label>
    <label>Tipografía de pantalla<select aria-label="Tipografía de pantalla" value={value.font} onChange={event=>onChange({...value,font:event.target.value==='modern'?'modern':'classic'})}><option value="classic">Editorial · Cormorant y Manrope</option><option value="modern">Moderna · Manrope</option></select></label>
    <label>Tamaño del texto<select aria-label="Tamaño del texto" value={value.size} onChange={event=>onChange({...value,size:event.target.value==='large'?'large':'comfortable'})}><option value="comfortable">Cómodo · monitor</option><option value="large">Grande · televisor o proyector</option></select></label>
    {includeMode?<label className="wp-mode-choice"><input type="checkbox" checked={value.presentation} onChange={event=>onChange({...value,presentation:event.target.checked})} />Abrir en modo presentación</label>:null}
  </div>
}
