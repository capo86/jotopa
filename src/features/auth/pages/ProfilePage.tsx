import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context'
import { fetchProfile } from '../api'
import { ProfileForm } from '../components/ProfileForm'

export function Component() {
  const { session } = useAuth()
  const userId = session?.user.id
  const profile = useQuery({
    queryKey: ['profile', userId],
    queryFn: ({ signal }) => fetchProfile(userId ?? '', signal),
    enabled: Boolean(userId),
  })
  return (
    <section className="max-w-xl">
      <p className="eyebrow">TU LUGAR EN JOTOPA</p>
      <h1 className="mt-4 font-display text-5xl tracking-tight text-forest">Mi perfil</h1>
      <p className="mt-4 text-sm leading-7 text-muted">Así te vamos a conocer en tus próximos encuentros.</p>
      <div className="mt-8 rounded-2xl border border-line bg-paper p-5 sm:p-8">
        {profile.isPending ? <p role="status">Cargando tu perfil…</p> : profile.isError ? <div><p role="alert" className="text-sm text-clay">No pudimos cargar tu perfil.</p><button type="button" className="button-primary mt-4" onClick={() => { void profile.refetch() }}>Reintentar</button></div> : <ProfileForm profile={profile.data} />}
        <dl className="mt-7 divide-y divide-line border-t border-line text-sm">
          <div className="setting-row"><dt>Correo electrónico</dt><dd className="break-all">{session?.user.email}</dd></div>
          <div className="setting-row"><dt>Rol de plataforma</dt><dd>{!profile.data ? 'Sin cargar' : profile.data.platform_role === 'super_admin' ? 'Administrador de plataforma' : 'Organizador'}</dd></div>
        </dl>
      </div>
    </section>
  )
}
