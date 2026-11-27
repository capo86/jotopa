import {useState} from 'react'
import type {InvitationDesign} from '../models'

export function BankDetails({banking,number}:{banking:InvitationDesign['gifts']['banking'];number:number}){
  const [notice,setNotice]=useState('')
  if(!banking.enabled)return null
  const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setNotice(`${label} copiado.`)}catch{setNotice('No pudimos copiar. Podés seleccionar el dato y copiarlo manualmente.')}}
  return <details className="iv-bank-details"><summary>Datos para transferencia {number} <span aria-hidden="true">＋</span></summary><p className="iv-bank-intro">Una alternativa para acompañarnos con un regalo. La transferencia se realiza por tus propios medios.</p><dl>{banking.bank_name?<div><dt>Banco o entidad</dt><dd>{banking.bank_name}</dd></div>:null}<div><dt>Titular</dt><dd>{banking.holder}</dd></div>{banking.account?<div><dt>Cuenta</dt><dd>{banking.account}</dd></div>:null}{banking.alias?<div><dt>Alias</dt><dd>{banking.alias}</dd></div>:null}</dl>{banking.notes?<p className="iv-card-prose">{banking.notes}</p>:null}<div className="iv-map-links">{banking.alias?<button type="button" onClick={()=>{void copy(banking.alias,'Alias')}}>Copiar alias</button>:null}{banking.account?<button type="button" onClick={()=>{void copy(banking.account,'Número de cuenta')}}>Copiar cuenta</button>:null}</div>{notice?<p role="status" className="iv-copy-notice">{notice}</p>:null}</details>
}
