import {useParams} from 'react-router'
import {InvitationSession} from '../components/InvitationSession'
import {tokenIsValid} from '../models'

export function Component() {
  const {token=''}=useParams()
  return <main className="min-h-screen">{tokenIsValid(token)?<InvitationSession key={token} token={token} />:<div role="alert" className="mx-auto max-w-2xl px-6 py-20 text-center"><h1 className="font-display text-3xl text-forest">Este enlace no está disponible</h1><p className="mt-4 text-sm leading-7 text-muted">Revisá el enlace que recibiste o consultá con quien te invitó.</p></div>}</main>
}
