import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inviteSchema, sendInvite } from '../api'
import { canManageRole, EVENT_ROLES, ROLE_LABELS, type EventRole } from '../../../lib/permissions'
import { eventErrorMessage } from '../../../lib/event-errors'
import { InputField } from '../../../components/ui/InputField'

export function InviteForm({ eventId, actorRole }: { eventId: string; actorRole: EventRole }) {
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm({ defaultValues: { email: '', role: 'viewer' as EventRole } })
  const [copied, setCopied] = useState(false)
  const queryClient = useQueryClient()
  const invitation = useMutation({ mutationFn: (values: unknown) => sendInvite(eventId, values), onSuccess: async () => { setCopied(false); await queryClient.invalidateQueries({ queryKey: ['team', eventId] }) } })
  return <div className="rounded-2xl border border-line bg-paper p-5 sm:p-7"><h2 className="text-xl font-medium text-forest">Invitar a un colaborador</h2><p className="mt-3 mb-6 text-sm leading-7 text-muted">Recibirá un correo con acceso para su propia cuenta. La invitación vence en 7 días y se puede usar una sola vez.</p><form noValidate onSubmit={handleSubmit(values => {
    clearErrors()
    const result = inviteSchema.safeParse(values)
    if (!result.success) { for (const issue of result.error.issues) { if (issue.path[0] === 'email' || issue.path[0] === 'role') setError(issue.path[0], { message: issue.message }) }; return }
    invitation.mutate(result.data)
  })}><fieldset disabled={invitation.isPending} className="grid gap-5 disabled:opacity-60 sm:grid-cols-2"><InputField label="Correo del colaborador" type="email" field={register('email')} error={errors.email?.message} /><InputField label="Rol del colaborador" field={register('role')} error={errors.role?.message}>{EVENT_ROLES.filter(role => canManageRole(actorRole, role)).map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</InputField><button type="submit" className="button-primary justify-self-start sm:col-span-2">{invitation.isPending ? 'Preparando invitación…' : 'Enviar invitación'}</button></fieldset></form>
    {invitation.isError ? <p role="alert" className="mt-5 text-sm text-clay">{eventErrorMessage(invitation.error)}</p> : null}
    {invitation.data?.delivery === 'sent' ? <p role="status" className="mt-5 text-sm text-forest">Invitación enviada. Podés revisar su estado más abajo.</p> : null}
    {invitation.data?.delivery === 'manual' && invitation.data.link ? <div className="mt-5 rounded-xl bg-canvas p-4"><p role="status" className="text-sm leading-6 text-muted">El envío gratuito no está disponible. La invitación está creada: copiá el enlace y enviáselo únicamente a ese colaborador.</p><button type="button" className="mt-3 text-sm font-medium text-forest underline" onClick={() => { void navigator.clipboard.writeText(invitation.data?.link ?? '').then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Enlace copiado' : 'Copiar enlace de invitación'}</button><input aria-label="Enlace para envío manual" readOnly value={invitation.data.link} className="form-input mt-3 text-xs" onFocus={e => e.target.select()} /></div> : null}
  </div>
}
