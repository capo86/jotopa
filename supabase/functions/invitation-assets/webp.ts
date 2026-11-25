export function inspectWebp(bytes:Uint8Array,maxSide:number):{width:number;height:number} {
  const fail=()=>{throw new Error('invalid_image')}
  if(bytes.length<30 || bytes.length>1_600_000) return fail()
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
  const text=(offset:number)=>String.fromCharCode(...bytes.subarray(offset,offset+4))
  if(text(0)!=='RIFF'||text(8)!=='WEBP'||view.getUint32(4,true)+8!==bytes.length)return fail()
  let width=0,height=0,frame=false
  for(let offset=12;offset<bytes.length;){
    if(offset+8>bytes.length)return fail()
    const tag=text(offset),length=view.getUint32(offset+4,true),start=offset+8,end=start+length
    if(end>bytes.length || !['VP8X','ICCP','ALPH','VP8 ','VP8L'].includes(tag) || (tag==='ICCP'&&length>4096))return fail()
    if(tag==='VP8X'){
      // Canvas may emit its standard color profile. EXIF, XMP and animation
      // remain forbidden; the bounded ICC profile does not carry GPS metadata.
      if(length!==10 || (bytes[start]! & ~0x30)!==0)return fail()
      width=1+(bytes[start+4]!|bytes[start+5]!<<8|bytes[start+6]!<<16)
      height=1+(bytes[start+7]!|bytes[start+8]!<<8|bytes[start+9]!<<16)
    }
    if(tag==='VP8 '||tag==='VP8L'){
      if(frame)return fail()
      frame=true
      let frameWidth:number,frameHeight:number
      if(tag==='VP8 '){
        if(length<10 || bytes[start+3]!==0x9d || bytes[start+4]!==1 || bytes[start+5]!==0x2a || (bytes[start]! & 1)!==0)return fail()
        frameWidth=view.getUint16(start+6,true)&0x3fff;frameHeight=view.getUint16(start+8,true)&0x3fff
      }else{
        if(length<5 || bytes[start]!==0x2f)return fail()
        frameWidth=1+((bytes[start+1]!|bytes[start+2]!<<8)&0x3fff)
        frameHeight=1+(((bytes[start+2]!>>6)|bytes[start+3]!<<2|bytes[start+4]!<<10)&0x3fff)
      }
      if(width && (width!==frameWidth||height!==frameHeight))return fail()
      width=frameWidth;height=frameHeight
    }
    offset=end+(length%2)
  }
  if(!frame||width<16||height<16||width>maxSide||height>maxSide)return fail()
  return {width,height}
}
