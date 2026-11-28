export type ShareResult='shared'|'copied'|'cancelled'

export async function shareWallScreen(url:string,title:string):Promise<ShareResult>{
  if(navigator.share){
    try{
      await navigator.share({title:'Buenos deseos · '+title,text:'Mirá los buenos deseos de este encuentro: '+url})
      return 'shared'
    }catch(error){
      if(error instanceof DOMException&&error.name==='AbortError')return 'cancelled'
    }
  }
  if(!navigator.clipboard)throw new Error('clipboard_unavailable')
  await navigator.clipboard.writeText(url)
  return 'copied'
}