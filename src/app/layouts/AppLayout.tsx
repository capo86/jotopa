import { NavLink, Outlet, useLocation, useNavigation } from 'react-router'
import { Brand } from '../../components/ui/Brand'
import { Icon } from '../../components/ui/Icon'
import { AccountMenu } from '../../features/auth'
import { InstallPrompt } from '../../components/ui/InstallPrompt'

const navigation = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/eventos', label: 'Mis eventos', icon: 'calendar' },
  { to: '/configuracion', label: 'Configuración', icon: 'settings' },
] as const

export function AppLayout() {
  const { state } = useNavigation()
  const { pathname } = useLocation()

  if (pathname === '/iniciar-sesion') return <><InstallPrompt /><main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12"><Outlet /></main></>

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <InstallPrompt />
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <aside className="border-b border-line bg-paper px-5 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0 lg:px-7 lg:py-9">
        <Brand />
        <p className="mt-1 hidden text-xs text-muted lg:block">Nos encontramos.</p>
        <nav aria-label="Navegación principal" className="mt-5 flex gap-1 lg:mt-14 lg:flex-col lg:gap-2">
          {navigation.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}>
              <Icon name={icon} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-line pt-6 lg:block">
          <p className="text-sm font-medium text-forest">Hecho para reunir.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Un espacio para cada encuentro.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-[11px] uppercase tracking-[.15em] text-muted"><span className="h-1.5 w-1.5 rounded-full bg-clay" />Jotopa · Primeros pasos</span>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5 sm:px-10 xl:px-14">
          <p className="text-sm text-muted">Tu espacio de encuentros</p>
          <AccountMenu />
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1400px] px-6 py-9 outline-none sm:px-10 lg:py-12 xl:px-14">
          {state !== 'idle' ? <p role="status" className="mb-4 text-sm text-muted">Cargando página…</p> : null}
          <Outlet />
        </main>
        <footer className="mx-6 mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line py-6 text-xs text-muted sm:mx-10 xl:mx-14">
          <span>Menos vueltas. Más encuentros.</span><span>Desde Paraguay, para compartir.</span>
        </footer>
      </div>
    </div>
  )
}

