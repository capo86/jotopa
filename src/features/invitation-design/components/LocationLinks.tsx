import {locationLinks} from '../links'

export function LocationLinks({location}:{location:{google_maps_url:string;waze_url:string;address:string;latitude:number|null;longitude:number|null}}){
  const links=locationLinks(location)
  if(!links.maps)return null
  return <div className="iv-map-links"><a className="iv-location-primary" href={links.maps} title="Abrir Google Maps" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Cómo llegar <span aria-hidden="true">↗</span></a></div>
}
