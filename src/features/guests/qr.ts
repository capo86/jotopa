export function personalInvitationUrl(appUrl:string,token:string):string {
  if(!/^[a-f0-9]{64}$/.test(token)) throw new Error('invalid_invitation')
  const origin=new URL(appUrl)
  if(!['http:','https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('invalid_invitation')
  return new URL(`/i/${token}`,origin.origin).href
}
export async function invitationQr(url:string):Promise<string> {
  const {default:QRCode}=await import('qrcode')
  return QRCode.toDataURL(url,{width:768,margin:4,errorCorrectionLevel:'M',color:{dark:'#244c40ff',light:'#ffffffff'}})
}
