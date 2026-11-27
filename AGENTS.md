# AGENTS.md — jotopa

Guía para agentes de código (y humanos) que trabajen en este repositorio. Léela completa antes de modificar código.

## 1. Qué es jotopa

Plataforma web **multi-evento** para convocar, hacer seguimiento y gestionar invitados a eventos (casamientos, cumpleaños, aniversarios). Varios anfitriones pueden crear y administrar sus propios eventos, y cada evento puede tener un equipo con distintos niveles de privilegio.

**Principio rector: el corazón de un evento es la convocatoria.** Se prioriza, en este orden:
1. Que el anfitrión sepa **a quién invitó, a quién le llegó, quién abrió, quién respondió y quién falta**.
2. Que pueda **recordar** a los pendientes de forma automática y ordenada.
3. Que tenga un **panel** claro para decidir y actuar.

Las funciones de experiencia (muro de dedicatorias, álbum, foto con hashtag) vienen **después** y no deben retrasar lo anterior.

Referencia visual de la página de invitación (solo inspiración de estructura): https://sites.google.com/view/carolinaydiego/p%C3%A1gina-principal

Idioma de la UI y del contenido: **español (es-PY / es-419)**. Código, nombres de variables y commits en **inglés**. Zona horaria por defecto: `America/Asuncion` (guardar fechas en UTC, mostrar en la zona del evento).

## 2. Stack

| Capa | Tecnología |
|---|---|
| UI | React (última versión estable) |
| Estilos | Tailwind CSS (última versión estable) |
| Lenguaje | TypeScript en modo `strict` |
| Build | Vite |
| Backend/BBDD/Auth/Storage/Realtime | Supabase (Postgres + RLS + Edge Functions + pg_cron) |
| Deploy | Vercel |
| Router | React Router |
| Datos en cliente | TanStack Query + `@supabase/supabase-js` |
| Formularios/validación | React Hook Form + Zod |
| Excel | `xlsx` (SheetJS) o `exceljs`, validado con Zod |
| Email (opcional, solo plan gratuito) | Proveedor con plan free (p. ej. Resend), desde Edge Function |
| QR | `qrcode` |
| Gráficos del panel | Recharts (o similar liviano) |
| Imagen compartible | Canvas API (`html-to-image` como alternativa) |

Reglas de versiones:
- Antes de instalar, verificar la última estable con `npm view <paquete> version`. No usar `beta`, `rc` ni `next`.
- Fijar versiones en `package.json` (sin `^` para react, vite y tailwind).
- Gestor de paquetes: **npm** (no mezclar con yarn/pnpm).
- Ya instalados: `@supabase/supabase-js`, CLI de Supabase (`supabase`) y CLI de Vercel (`vercel`) como devDependencies. Opcional: `@vercel/analytics`.

## 3. Comandos

```bash
npm install
npm run dev
npm run build        # tsc -b && vite build
npm run preview
npm run lint
npm run typecheck    # tsc --noEmit
npx supabase start   # Supabase local (requiere Docker)
npx supabase db push
npx supabase gen types typescript --local > src/lib/database.types.ts
npx supabase functions serve
vercel               # preview
vercel --prod
```

Antes de dar una tarea por terminada: `npm run typecheck && npm run lint && npm run build` deben pasar.

## 4. Variables de entorno

`.env.local` (nunca commitear). Mantener `.env.example` actualizado.

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_APP_URL=
```

Secretos solo del lado servidor (Supabase secrets, nunca `VITE_`): clave del proveedor de email (si se usa) y `service_role`.

- Solo variables con prefijo `VITE_` llegan al cliente. **Jamás** exponer `service_role` en el frontend.
- **Regla de costo cero:** el proyecto debe funcionar solo con planes gratuitos (Supabase free, Vercel hobby, email free tier). No integrar servicios de pago (WhatsApp Business API, SMS, etc.) ni agregar dependencias que exijan tarjeta.
- Operaciones privilegiadas (envíos por email, recordatorios, import masivo, emisión de tokens) van en **Edge Functions** o funciones SQL `security definer`.

## 5. Estructura del proyecto

```
src/
  app/                 # providers, router, layouts
  components/ui/       # componentes base reutilizables
  features/
    auth/              # login, sesión, perfil
    events/            # CRUD de eventos, configuración, temas
    members/           # equipo del evento: roles, invitar colaboradores
    guests/            # alta manual, import Excel, conciliación, tokens
    invitations/       # envío, canales, plantillas, seguimiento por invitado
    reminders/         # reglas, programación, historial
    rsvp/              # confirmación de asistencia (lado invitado)
    dashboard/         # panel del anfitrión: embudo, métricas, acciones
    info/              # mesa, regalos, ubicaciones, hospedaje
    wall/              # muro de dedicatorias y modo proyección
    gallery/           # álbum compartido
    share/             # imagen con hashtag para estados
  lib/
    supabase.ts
    database.types.ts  # generado, no editar a mano
    permissions.ts     # matriz de permisos espejo de la de SQL
  pages/
supabase/
  migrations/
  functions/           # send-invitations, run-reminders, track-open, import-guests
  seed.sql
```

Cada `feature` agrupa componentes, hooks, esquemas Zod y acceso a datos. No importar entre features salvo por su `index.ts`.

## 6. Usuarios, roles y privilegios

Hay dos niveles de rol, más el invitado.

### 6.1 Nivel plataforma (tabla `profiles`)
| Rol | Alcance |
|---|---|
| `super_admin` | Administra la plataforma completa, soporte, ve todos los eventos. Muy restringido. |
| `organizer` | Puede crear eventos propios. Es el rol por defecto al registrarse. |

### 6.2 Nivel evento (tabla `event_members`)
Un mismo usuario puede tener roles distintos en eventos distintos.

| Rol | Qué puede hacer |
|---|---|
| `owner` | Todo en el evento, incluido eliminarlo, transferirlo y gestionar el equipo. Uno o más por evento. |
| `manager` | Todo salvo eliminar/transferir el evento y quitar al `owner`. Gestiona equipo (hasta su nivel). |
| `invitations` | Gestiona invitados, envía invitaciones, recordatorios y ve el seguimiento. Sin acceso a configuración del evento. |
| `content` | Edita contenido: textos, ubicaciones, regalos, hospedaje, mesas. Sin acceso a datos de contacto de invitados. |
| `moderator` | Modera muro y fotos. Sin acceso a invitados ni envíos. |
| `checkin` | Solo marca asistencia real en puerta. Ve nombre y mesa, nada más. |
| `viewer` | Solo lectura del panel y métricas. |

Reglas:
- La **matriz de permisos** vive en SQL (`has_event_permission(event_id, permission)`) y se refleja en `src/lib/permissions.ts` solo para ocultar UI. **La UI nunca es la barrera de seguridad; lo es RLS.**
- Permisos granulares sugeridos (en la matriz): `event.update`, `event.delete`, `members.manage`, `guests.read`, `guests.write`, `guests.contact_read`, `invitations.send`, `reminders.manage`, `dashboard.read`, `content.write`, `wall.moderate`, `checkin.write`.
- Invitar a un colaborador: tabla `event_member_invites` (email, rol, token, expiración). Al aceptar se crea el `event_members`.
- Un `owner` no puede quedarse sin otro `owner` (validar en SQL).
- Toda acción sensible (cambios de rol, borrados, envíos masivos) se registra en `audit_log`.

### 6.3 Invitado (sin cuenta)
Acceso por **link/QR personal** con `invite_token` único e impredecible (mínimo 128 bits). El token solo da acceso a **su** invitación en **su** evento.

## 7. Modelo de dominio (borrador)

Todas las tablas con `id uuid`, `created_at`, y RLS activada.

**Plataforma y eventos**
- `profiles`: `user_id, full_name, platform_role (super_admin|organizer)`
- `events`: `id, created_by, type, title, slug, starts_at, timezone, rsvp_deadline, hashtag, theme (jsonb), session_opens_at, session_closes_at, status (draft|active|closed)`
- `event_members`: `event_id, user_id, role` (único por evento+usuario)
- `event_member_invites`: `event_id, email, role, token, expires_at, accepted_at`
- `event_venues`, `event_lodging`, `event_gifts`, `tables`: como ficha de contenido del evento (ver Fase 4)

**Invitados y convocatoria**
- `guests`: `event_id, full_name, email, phone, document_id (opcional), group_label, table_id, invite_token, companions_allowed, companions_confirmed, rsvp_status (pending|yes|no|maybe), rsvp_at, dietary_notes, contact_consent, opted_out`
- `invitations`: `guest_id, event_id, channel (whatsapp|email|link), status (draft|queued|sent|delivered|opened|responded|bounced|failed), sent_at, sent_marked_by (usuario que tocó el botón wa.me; null si fue automático), delivered_at (solo email), first_opened_at, last_opened_at, open_count, provider_message_id (solo email), error`
- `invitation_events`: log inmutable por invitación: `type (sent|delivered|opened|clicked|rsvp|bounced|reminder_sent)`, `occurred_at`, `meta (jsonb)`
- `message_templates`: `event_id, name, channel, subject, body` con variables `{nombre}`, `{link}`, `{fecha}`, `{lugar}`, `{fecha_limite}`
- `reminder_rules`: `event_id, name, template_id, channel, trigger (relative_to: rsvp_deadline|event_start|invitation_sent), offset_days, audience (pending|maybe|opened_not_responded|all_unconfirmed), quiet_hours, max_per_guest, active`
- `reminder_jobs`: `rule_id, guest_id, channel, due_at, status (scheduled|due|sent|skipped|failed), sent_at, sent_marked_by, error` (`due` = le toca al anfitrión enviarlo manualmente por wa.me)
- `audit_log`: `event_id, actor_id, action, target, meta, created_at`

**Experiencia (fases posteriores)**
- `wall_posts`, `wall_post_media`, `photos`, `announcements` (como en versiones previas del diseño)

Buckets de Storage: privados, URLs firmadas: `wall-media`, `wall-audio`, `gallery`, `event-assets` y `invitation-audio`.

## 8. Seguimiento de invitaciones y recordatorios (núcleo)

### 8.1 Estados y embudo
Cada invitado recorre: **Invitado → Enviada → Abierta → Respondió (sí/no/quizás)**. El estado "Entregada" solo existe para email; en WhatsApp "Enviada" la marca el anfitrión al tocar el botón. El panel muestra el embudo y permite filtrar por cada etapa, p. ej. "abrieron pero no respondieron".

### 8.2 Canales (todo gratuito)
- **Link/QR personal**: siempre disponible, base del seguimiento.
- **WhatsApp — solo botones `wa.me`** (canal principal, decidido: sin API de pago):
  - Cada invitado tiene un botón que abre `https://wa.me/<telefono_E164_sin_+>?text=<mensaje_url_encoded>` con el mensaje de la plantilla y su link personal ya cargados. El anfitrión solo toca "Enviar" dentro de WhatsApp.
  - Normalizar teléfonos a formato internacional (E.164, por defecto prefijo +595 para Paraguay) y validar en la importación; marcar "teléfono inválido" en el panel.
  - Al tocar el botón, la app registra la invitación como **Enviada** (`sent_marked_by = usuario`). Ofrecer deshacer, porque abrir WhatsApp no garantiza que se envió.
  - **Modo cola** ("Enviar por WhatsApp"): lista ordenada de pendientes con botón por fila; al volver a la app, el siguiente invitado queda listo. Permitir saltar y marcar como "no se pudo".
  - Alternativa para grupos o sin número: botones "Copiar mensaje" y "Compartir" (Web Share API).
  - No existe confirmación de entrega ni lectura en WhatsApp: el seguimiento real es la **apertura del link** y el RSVP.
- **Email (opcional)**: solo si el plan gratuito alcanza; envío desde Edge Function, con registro de rebotes por webhook. Si se supera el límite gratuito, degradar a "copiar/enviar manual", nunca activar un plan de pago.
- Abstraer los canales detrás de una interfaz simple (`MessageChannel`) para mantener el código ordenado; no implica agregar canales de pago.

### 8.3 Seguimiento de apertura
- Apertura = primera visita a la página con `invite_token` (registrar en `invitation_events`, incrementar `open_count`). Es la señal confiable; **no** depender de píxeles de email ni de "visto" de WhatsApp.
- Los botones "Voy / No voy / Quizás" actualizan `rsvp_status` y generan evento `rsvp`.

### 8.4 Recordatorios
Como WhatsApp no se puede enviar solo, los recordatorios funcionan como **cola de tareas para el anfitrión**:
- `pg_cron` ejecuta periódicamente la Edge Function `run-reminders`, que evalúa `reminder_rules` y genera `reminder_jobs`. Para canal WhatsApp los jobs quedan en estado `due` (les toca hoy), **no se envían solos**.
- El panel muestra un aviso destacado: **"Hoy toca recordar a N invitados"**, con el botón que abre la cola de wa.me ya filtrada por esa regla. El anfitrión los envía tocando botones.
- Opcional y gratuito: resumen diario por email al anfitrión ("hoy te toca recordar a N invitados") y, si el canal email está activo, envío automático de recordatorios por email.
- Audiencias típicas: pendientes, "quizás", "abrió y no respondió", "nunca abrió".
- Reglas de seguridad **obligatorias**: máximo de recordatorios por invitado, horas de silencio sugeridas (no mostrar como "toca hoy" fuera de horario razonable), excluir a `opted_out` y a quienes ya respondieron, y mostrar siempre la cantidad de destinatarios antes de empezar la cola.
- El mensaje incluye una forma sencilla de pedir no recibir más recordatorios (p. ej. un botón en la página de invitación que setea `opted_out`).
- Idempotencia: un job no puede duplicarse (clave única `rule_id + guest_id + due_at`) y, una vez marcado `sent`, desaparece de la cola.

### 8.5 Panel del anfitrión (`features/dashboard`)
- Tarjetas: total invitados, enviadas, abiertas, confirmados (y acompañantes), declinados, pendientes, días para la fecha límite de RSVP.
- Embudo y gráfico de respuestas en el tiempo.
- Tabla de invitados con filtros, búsqueda, edición masiva y **línea de tiempo por invitado** (cuándo se envió, abrió, recordó, respondió).
- Acciones masivas: enviar invitación, enviar recordatorio a un segmento, reenviar a rebotados, exportar a Excel.
- Alertas: "N invitados sin abrir", "quedan X días y faltan Y respuestas", "teléfonos inválidos".
- Contenido visible según permisos del rol (p. ej. `content` no ve teléfonos/emails).

## 9. Fases

Priorizar la convocatoria. No construir fases futuras antes de cerrar la actual.

**Fase 1 — Base multi-evento y permisos**
Auth, perfiles, crear evento, `event_members`, roles y matriz de permisos con RLS, invitar colaboradores, `audit_log`. Pruebas de RLS entre eventos y roles.

**Fase 2 — Invitados e invitación**
Alta manual, **importación Excel** (plantilla, vista previa con errores por fila, conciliación por email/teléfono/documento con reporte de creados/actualizados/rechazados, RPC transaccional), link/QR personal, página de invitación con RSVP y acompañantes.

**Fase 3 — Envío, seguimiento, recordatorios y panel**
Plantillas, canales (link/QR, WhatsApp con botones `wa.me` en modo cola, email opcional con plan gratuito), estados y `invitation_events`, reglas de recordatorio con `pg_cron` que generan la cola "Hoy toca recordar a N", panel con embudo y línea de tiempo, exportación. Es el **hito más importante del producto**.

**Fase 4 — Información bidireccional**
Mesa por invitado (asignador y por Excel), lista de regalos con "yo lo regalo", direcciones de ceremonia y fiesta con Maps/Waze, hospedaje sugerido (solo si el lugar está marcado como alejado), anuncios del anfitrión, check-in en puerta (rol `checkin`).

**Fase 5 — Muro de dedicatorias**
Texto, audio y fotos; interfaz tipo chat/red social; Realtime; moderación; **modo proyección** (`/e/:slug/pantalla`, 16:9, rotación automática, QR visible); exportación como recuerdo.

**Fase 6 — Álbum y momentos compartibles**
Álbum de fotos, **foto con marco y #hashtag** para estados (Web Share API con fallback a descarga), extras opcionales: trivia, playlist colaborativa, buzón del tiempo.

## 10. Seguridad y privacidad

- RLS obligatoria en todas las tablas y buckets. Las políticas usan `has_event_permission(...)`; nunca confiar en filtros del cliente.
- Un invitado solo lee/edita **su** invitación y RSVP y **sus** publicaciones; nunca ve datos de otros invitados salvo lo que el anfitrión publique (p. ej. muro aprobado).
- El acceso de invitados es válido solo entre `session_opens_at` y `session_closes_at`, aplicado en BBDD/funciones.
- Teléfonos, emails y documentos: visibles solo con `guests.contact_read`; nunca en logs ni en el muro.
- Consentimiento y baja: registrar `contact_consent` y respetar `opted_out` en todos los canales (incluida la cola de wa.me: no listar a quienes pidieron no ser contactados).
- Sanitizar texto de usuario (nunca `dangerouslySetInnerHTML`). Validar tamaño/tipo de archivos; comprimir imágenes antes de subir.
- Rate limiting en RSVP, envíos y subidas.
- Al cerrar el evento: opción de exportar y borrar datos personales.

## 11. Convenciones de código

- TypeScript `strict`; prohibido `any` (usar `unknown` + Zod).
- Componentes funcionales, un componente por archivo, `PascalCase.tsx`.
- Datos remotos solo vía TanStack Query.
- Tipos de BBDD siempre desde `database.types.ts` (regenerar tras cada migración).
- Esquemas Zod por feature, reutilizados en formularios e importación Excel.
- Tailwind: utilidades, componentes antes que `@apply`; tokens de tema en la configuración.
- **Mobile-first**: la mayoría de invitados entra desde WhatsApp en el celular. Probar a 360 px. El panel del anfitrión debe ser usable en móvil y óptimo en escritorio.
- Accesibilidad básica: contraste, `alt`, foco visible.
- Rendimiento: lazy loading, code-splitting por ruta, tablas virtualizadas desde ~100 filas.
- Commits en Conventional Commits.

## 12. Base de datos y migraciones

- Todo cambio de esquema va en una migración nueva en `supabase/migrations/`; no editar migraciones ya aplicadas.
- Cada tabla nueva incluye en la misma migración: RLS, políticas, índices en claves foráneas y columnas de filtro (`event_id`, `status`).
- Operaciones atómicas por RPC (import de invitados, asignación de mesas, cambios de rol).
- Realtime solo donde haga falta (`wall_posts`, `announcements`, y opcionalmente `invitations` para el panel en vivo).
- Tests de RLS (pgTAP o scripts) por cada rol del 6.2.

## 13. Deploy en Vercel

- Preset Vite, build `npm run build`, salida `dist`.
- `vercel.json` con rewrite SPA (`/(.*)` → `/index.html`).
- Preview por PR; proyecto de Supabase separado para staging si es posible.
- Ruta pública por evento: `/e/:slug`; invitación personal: `/i/:token`.

## 14. Qué NO hacer

- No exponer `service_role` ni claves de proveedores en el cliente.
- No desactivar RLS "para probar".
- No decidir permisos solo en la UI.
- No integrar WhatsApp Business API, SMS ni ningún servicio de pago.
- No intentar automatizar el envío de WhatsApp (bots, WhatsApp Web, librerías no oficiales): viola sus términos y arriesga el número del anfitrión. Solo `wa.me`.
- No enviar recordatorios sin respetar límites, horas de silencio y bajas.
- No contar como "leído" nada que no sea la visita real al link del invitado (WhatsApp no informa lectura).
- No scrapear sitios de hospedaje ni tiendas.
- No agregar librerías grandes sin justificar.
- No implementar fases futuras antes de cerrar la actual.

## 15. Definición de terminado

- Pasa typecheck, lint y build.
- Probado en móvil (360 px) y escritorio.
- RLS verificada: un usuario no accede a eventos ajenos y cada rol solo hace lo que su matriz permite.
- Cola de wa.me probada (teléfonos E.164, mensaje bien codificado, marcado/deshacer, idempotencia y límites).
- Estados de carga, vacío y error contemplados; textos en español.
- `.env.example` y este archivo actualizados si cambió algo relevante.
