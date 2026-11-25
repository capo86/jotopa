export async function optimizeImage(file:File):Promise<{large:Blob;small:Blob}> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024||file.size<16)throw new Error('invalid_image')
  let bitmap:ImageBitmap
  try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}catch{throw new Error('invalid_image')}
  try{
    if(bitmap.width<200||bitmap.height<200||bitmap.width*bitmap.height>24_000_000)throw new Error('invalid_image')
    const render=async(maximum:number)=>{
      const factor=Math.min(1,maximum/Math.max(bitmap.width,bitmap.height))
      const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor)
      const context=canvas.getContext('2d');if(!context)throw new Error('invalid_image')
      context.fillStyle='#f5f2e9';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
      for(const quality of [.84,.72,.6]){
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality))
        if(blob?.type==='image/webp'&&blob.size<=1_000_000)return blob
      }
      throw new Error('invalid_image')
    }
    const [large,small]=await Promise.all([render(1920),render(720)])
    return {large,small}
  }finally{bitmap.close()}
}
