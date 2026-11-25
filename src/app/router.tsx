import { createBrowserRouter } from 'react-router'
import { AppLayout } from './layouts/AppLayout'
import { RouteErrorPage } from '../pages/RouteErrorPage'
import { RouteLoadingPage } from '../pages/RouteLoadingPage'
import { RequireAuth, RecoveryRedirect } from '../features/auth'

export const router = createBrowserRouter([
  { path: 'i/:token', lazy: () => import('../features/rsvp/pages/InvitationPage'), HydrateFallback: RouteLoadingPage, ErrorBoundary: RouteErrorPage },
  { path: 'e/:slug/pantalla', lazy: () => import('../features/wall/pages/ProjectionPage'), HydrateFallback: RouteLoadingPage, ErrorBoundary: RouteErrorPage },
  { path: 'e/:slug/participar', lazy: () => import('../features/wall/pages/ParticipationPage'), HydrateFallback: RouteLoadingPage, ErrorBoundary: RouteErrorPage },
  {
    Component: AppLayout,
    ErrorBoundary: RouteErrorPage,
    HydrateFallback: RouteLoadingPage,
    children: [
      { Component: RecoveryRedirect, children: [
        { index: true, lazy: () => import('../pages/HomePage') },
        { path: 'configuracion', lazy: () => import('../pages/SettingsPage') },
        { path: 'iniciar-sesion', lazy: () => import('../features/auth/pages/LoginPage') },
        { path: 'registro', lazy: () => import('../features/auth/pages/RegisterPage') },
        { path: 'recuperar-contrasena', lazy: () => import('../features/auth/pages/RecoverPasswordPage') },
        { path: 'restablecer-contrasena', lazy: () => import('../features/auth/pages/ResetPasswordPage') },
        { path: 'equipo/aceptar', lazy: () => import('../features/members/pages/AcceptInvitePage') },
        { Component: RequireAuth, children: [
          { path: 'perfil', lazy: () => import('../features/auth/pages/ProfilePage') },
          { path: 'eventos', lazy: () => import('../features/events/pages/EventsPage') },
          { path: 'eventos/nuevo', lazy: () => import('../features/events/pages/CreateEventPage') },
          { path: 'eventos/:eventId', lazy: () => import('../features/events/pages/EventDetailsPage') },
          { path: 'eventos/:eventId/editar', lazy: () => import('../features/events/pages/EditEventPage') },
          { path: 'eventos/:eventId/invitacion', lazy: () => import('../features/invitation-design/pages/DesignPage') },
          { path: 'eventos/:eventId/mesas', lazy: () => import('../features/info/pages/TablesPage') },
          { path: 'eventos/:eventId/buenos-deseos', lazy: () => import('../features/wall/pages/WallPage') },
          { path: 'eventos/:eventId/equipo', lazy: () => import('../features/members/pages/TeamPage') },
          { path: 'eventos/:eventId/invitados', lazy: () => import('../features/guests/pages/GuestsPage') },
          { path: 'eventos/:eventId/invitados/importar', lazy: () => import('../features/guests/pages/ImportGuestsPage') },
          { path: 'eventos/:eventId/invitaciones', lazy: () => import('../features/invitations/pages/QueuePage') },
          { path: 'eventos/:eventId/invitaciones/plantillas', lazy: () => import('../features/invitations/pages/TemplatesPage') },
        ] },
        { path: '*', lazy: () => import('../pages/NotFoundPage') },
      ] },
    ],
  },
])

