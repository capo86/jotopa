import {useMutation,useQueryClient} from '@tanstack/react-query'
import {uploadAsset} from './api'

export function useAssetUpload<T extends {file:File}>(eventId:string,alt:string,onUploaded:(id:string,variables:T)=>void,onBusy:(busy:boolean)=>void){
  const cache=useQueryClient()
  return useMutation({mutationFn:(variables:T)=>uploadAsset(eventId,alt.trim(),variables.file),onSuccess:async(id,variables)=>{await cache.invalidateQueries({queryKey:['design-assets',eventId]});onUploaded(id,variables)},onSettled:()=>onBusy(false),retry:false,gcTime:0})
}
