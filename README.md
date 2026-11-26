# Jotopa

## Enlace general de la invitación

El editor ofrece la paleta **Salvia, rosa y blanco** y una opción de música de fondo por enlace HTTPS directo a un archivo MP3, M4A, AAC, OGG, Opus, WAV o WebM accesible públicamente. Los enlaces a páginas de YouTube o Spotify no son archivos de audio. El audio se intenta reproducir al abrir; si el navegador lo bloquea, el invitado puede activarlo con el botón visible. Al reproducir otra nota de voz la música se pausa. El enlace de audio se comparte con quienes puedan abrir la invitación y el servidor externo recibe la solicitud del archivo; no se envía el Referer de la página.

Desde el editor, **Guardar y publicar** habilita el enlace general y actualiza la versión visible; **Copiar enlace general**, junto a la vista previa, permite compartirla. El evento puede seguir en borrador mientras se comparte esta presentación. Los cambios guardados como borrador no aparecen hasta volver a publicar. Retirar la publicación deshabilita el enlace general.

La página general `/e/:slug` no contiene invitados, confirmaciones, mesas ni acceso para escribir buenos deseos. Incluye una sección visible que dirige a la invitación personal, donde el invitado puede escribir y agregar fotos o audio. Para esas acciones se mantienen los enlaces personales. Las secciones ocultas, sus fotos y los datos bancarios deshabilitados no se incluyen en la respuesta pública. Las fotos se sirven desde el almacenamiento privado mediante enlaces temporales. Publicar habilita el acceso general para cualquier persona con el enlace; los diseños publicados anteriormente requieren volver a publicarse para habilitarlo.

El envío por WhatsApp sigue siendo manual y utiliza la cola de invitados con consentimiento. La pantalla permite recorrer todos los pendientes o elegir una persona de la lista; en ambos casos hay que confirmar cada envío en WhatsApp. La pantalla de ingreso conduce a Mis eventos. Desde **Diseñar invitación → Portada y galería** se pueden cargar hasta ocho fotografías; agregar una activa la sección. Hay que guardar y publicar para actualizar la invitación. La galería permite recorrer las fotos con controles o mediante desplazamiento.

Jotopa significa **encuentro** en guaraní: un servicio de invitaciones digitales, convocatoria y encuentros. Interfaz en español de Paraguay, zona horaria predeterminada `America/Asuncion` y fechas de base de datos en UTC. Las Fases 1A, 1B, 2A, 2B, 3A y las Etapas A y B se conservan. La **Etapa C** incorpora buenos deseos multimedia y moderación. La **Etapa D** agrega conversación en tiempo real y proyección horizontal con historial completo. El desarrollo se detiene después de D para revisión; administración privada (E) y panel/recordatorios (F) siguen pendientes.

La creación de usuarios en la nube está reservada al administrador de plataforma y el registro público está deshabilitado. El acceso para crear miembros está en **Mi perfil → Administrar usuarios** (`/paneladmin/usuarios`). La restricción de creación de eventos a administradores y el resto de la administración privada siguen pendientes. El RSVP actual solo acepta Sí/No; las respuestas Quizás anteriores se conservan en historial y archivo privado y pasan a pendientes, sin convertirse en confirmaciones.

**Revisión actual — 25 de noviembre de 2026:** ampliación y verificación de la Etapa D desde el código existente, conservando el cierre de privacidad de C. Se completa el modo presentación, apariencia, lectura desde distancia, movimiento continuo y controles del operador; se verifican privacidad, permisos y regresiones. No se inicia E.

## Desarrollo local

Requisitos: Node.js 24.18 o superior de la rama 24, npm 11+, Docker para Supabase y Google Chrome para las pruebas de navegador.

```sh
npm install
# Solo si todavía no existe .env.local:
cp .env.example .env.local
npm run dev
```

En PowerShell: `Copy-Item .env.example .env.local`. Si se bloquea `npm.ps1`, usar `npm.cmd` y `npx.cmd`, sin cambiar la política de ejecución.

Jotopa usa **http://localhost:5174** con `strictPort`. El puerto 5173 pertenece a SIGA. No modificar ni detener sus contenedores.

Supabase Local de `jotopa`:

- API: http://127.0.0.1:54321
- Studio: http://127.0.0.1:54323
- Mailpit, correos locales: http://127.0.0.1:54324
- Postgres local: puerto 54322

`.env.local` contiene `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_APP_URL=http://localhost:5174`. Está excluido de Git. La variable histórica `VITE_SUPABASE_ANON_KEY` admite la clave publicable `sb_publishable_...` o un JWT legacy con rol `anon`.

La clave publicable se obtuvo del campo `PUBLISHABLE_KEY` de la salida JSON de la CLI, capturada sin imprimir. No compartir la salida completa de `supabase status`: también incluye secretos. Nunca usar claves `service_role`, `sb_secret_...`, `JWT_SECRET` ni claves de proveedores en React. El validador de configuración rechaza claves privilegiadas; ningún mensaje de UI imprime credenciales ni respuestas de error sin filtrar.

## Autenticación y perfiles

### Creación privada de miembros

El administrador de plataforma puede crear una cuenta y asociarla a un evento existente con uno de los siete roles. La cuenta se crea en Supabase Auth, el trigger existente crea su perfil `organizer` y la RPC `admin_add_event_member` vincula ese perfil al evento y registra la acción en auditoría. La contraseña inicial se establece en el formulario y no se guarda en tablas de Jotopa ni se envía por correo automáticamente; debe compartirse de manera segura. Si el correo ya existe se rechaza la creación; la incorporación de cuentas existentes sigue usando las invitaciones de equipo.

La Edge Function `create-event-user` verifica la sesión real, el rol `super_admin`, el evento, los datos y un límite de 20 intentos por administrador por hora. Solo la función usa credenciales privilegiadas, que nunca llegan a React. Si falla la vinculación después de crear una cuenta, intenta retirarla; si la limpieza falla informa que debe revisarse la cuenta en Supabase. Las migraciones `20261125230000_admin_add_event_member.sql` y `20261125231000_admin_user_creation_limit.sql` conservan RLS y privilegios explícitos.

En Supabase Cloud el registro público está deshabilitado en Auth, no solamente oculto en la interfaz. El entorno local conserva el registro habilitado para las suites históricas de fixtures; no representa la configuración de producción. La función usa `APP_URL` para autorizar el origen de producción. Las pruebas de la función y de la UI usan únicamente Supabase Local y datos temporales; requieren la API local, la función servida y un servidor Vite local en el puerto 5176. El script `scripts/admin-users.integration.test.mjs` rechaza destinos que no sean Supabase Local mediante el auxiliar compartido.

Rutas públicas: `/`, `/configuracion`, `/iniciar-sesion`, `/recuperar-contrasena`, `/restablecer-contrasena`, `/equipo/aceptar` y `/i/:token`. Esta última permite acceder a una invitación personal sin cuenta. Las rutas de perfil, listado/creación/detalle/edición de eventos y equipo requieren sesión. El equipo requiere además permisos de gestión; la edición requiere `event.update`.

El administrador crea cuentas con correo y contraseña. El formulario exige al menos 10 caracteres, una mayúscula, una minúscula y un número; la misma validación se aplica en la función de servidor. La configuración local mantiene registro habilitado para fixtures. En producción el registro público está deshabilitado y las cuentas creadas por el administrador quedan confirmadas.

El cliente persistente de Supabase restaura la sesión al recargar, renueva tokens y notifica cambios al proveedor de Auth. Las consultas y mutaciones remotas pasan por TanStack Query. Al cambiar de usuario o cerrar sesión se limpia la caché. Cerrar sesión afecta el navegador actual. Las rutas protegidas esperan la restauración antes de redirigir al acceso; RLS sigue siendo la barrera de seguridad real.

La recuperación envía un correo a Mailpit mediante Supabase, con PKCE y retorno a `/restablecer-contrasena`. Abrir el enlace en **el mismo navegador y origen donde se pidió**, por ejemplo `localhost:5174`. `localhost` y `127.0.0.1` tienen almacenamiento distinto; se recomienda usar siempre `localhost`. El formulario de nueva contraseña requiere una sesión de recuperación válida. Los enlaces inválidos, vencidos o abiertos sin el verificador muestran una explicación y permiten solicitar otro. Se conserva el estado de recuperación al recargar la pantalla y se elimina al completar el cambio o cerrar sesión. Los tokens no se muestran en la UI, documentación ni reportes de pruebas.

`supabase/config.toml` tiene `site_url=http://localhost:5174` y redirecciones explícitas para recuperación en localhost y 127.0.0.1. Se aplicó esta configuración reiniciando exclusivamente Supabase de `jotopa`, conservando sus datos. SIGA no se reinició ni se modificó. El correo local queda capturado en Mailpit; no se envía a proveedores externos.

## Base de datos y seguridad

La migración nueva `supabase/migrations/20261122200000_create_profiles.sql` crea:

- `profiles`: UUID propio, `user_id` único vinculado a `auth.users`, nombre, rol de plataforma y fechas.
- RLS para leer y actualizar únicamente la fila del usuario autenticado.
- Permisos de columna: el cliente solo puede actualizar `full_name`. No puede insertar, borrar o hacer upsert, cambiar rol, identidad ni fechas.
- Trigger de registro `security definer` con `search_path` vacío que crea el perfil como **organizer**, ignorando roles de metadatos. También completa perfiles de usuarios anteriores.
- Trigger de actualización de fecha y funciones de trigger sin permiso de ejecución pública.

`super_admin` queda reservado a administración de base de datos de confianza. No hay formulario, RPC pública ni permiso de cliente para asignarlo. Los metadatos editables del usuario no son una fuente de autorización. Esa cuenta mantiene las políticas de perfil propio de la Fase 1A y recibe acceso administrativo efectivo a los eventos en la matriz de la Fase 1B. Los demás usuarios solo acceden a eventos donde son miembros.

La migración ya se aplicó a la base local mediante `npx supabase migration up`. No se sobrescribieron migraciones ni se desactivó RLS. `src/lib/database.types.ts` fue **generado por la CLI desde la base local** y se usa para tipar el cliente y los perfiles. No editarlo a mano.

```sh
# La CLI instalada usa destino local por defecto; no pasar --remote.
npx supabase migration up
npx supabase gen types typescript --schema public > src/lib/database.types.ts
```

En Windows PowerShell, para mantener UTF-8 al regenerar: `npx.cmd supabase gen types typescript --schema public | Set-Content src/lib/database.types.ts -Encoding utf8`.

## Eventos, equipos y permisos

Pantallas privadas:

- `/eventos`: eventos propios y compartidos, con estados de carga, vacío y error.
- `/eventos/nuevo`: crear un evento; SQL asigna al creador como owner de forma atómica.
- `/eventos/:eventId`: detalles, horario en la zona del evento y acciones según permisos.
- `/eventos/:eventId/editar`: nombre, identificador único, tipo, fecha, zona horaria, fecha límite obligatoria y estado.
- `/eventos/:eventId/equipo`: colaboradores, roles, invitaciones, revocación y últimas acciones de auditoría.

Las migraciones nuevas `20261122210000_events_teams_permissions.sql`, `20261122211000_update_event_optional_deadline.sql` y `20261122212000_serialize_invitation_rate_limit.sql` crean `events`, `event_members`, `event_member_invites` y `audit_log`, sus índices, RLS y RPC. La migración de perfiles no se modificó. La segunda migración permite omitir/limpiar la fecha límite sin alterar los tipos generados manualmente. La tercera serializa el límite de invitaciones entre distintos eventos y garantiza un único enlace pendiente por correo y evento.

La matriz autoritativa vive en SQL: `event_role_permissions(role)` y `has_event_permission(event_id, permission)`. El espejo `src/lib/permissions.ts` solo oculta controles. Una prueba compara ambos para los siete roles.

| Rol | Alcance |
| --- | --- |
| owner / Propietario | Editar, eliminar y gestionar equipo, incluidos otros owners. |
| manager / Administrador | Editar y gestionar hasta su nivel; no eliminar, asignar owner ni cambiar/quitar owners. |
| invitations / Invitaciones | Gestión de invitados, importación/exportación, plantillas, cola manual de envío y seguimiento. |
| content / Contenido | Prepara el diseño visual, textos, fotos y horarios de la invitación. No publica ni accede a contactos o configuración general. |
| moderator / Moderación | Modera buenos deseos y sus archivos, con identidad de la invitación, sin contactos de invitados ni equipo. |
| checkin / Recepción | Nombres y mesa de invitados, sin contactos, grupos, documentos ni gestión. Marcar asistencia queda reservado. |
| viewer / Solo lectura | Datos del evento; lectura de métricas reservada para el panel posterior. |

La gestión de invitados respeta la matriz existente. El diseño usa `content.write`; publicar/retirar la versión visual usa `event.update`. Buenos deseos usa `wall.moderate`; su configuración requiere `event.update`. La proyección externa y el marcado de asistencia quedan reservados. Los siete roles se prueban tanto con permisos permitidos como prohibidos.

Los clientes solo tienen lectura autorizada en las tablas nuevas. Crear/editar/eliminar eventos, emitir/aceptar/revocar invitaciones y cambiar/quitar miembros se hace mediante RPC `security definer`, con `search_path` vacío, controles de sesión y permisos. No se acepta un creador, actor de auditoría ni rol propio enviados por el cliente. Cambiar el rol propio está prohibido. Solo un owner puede designar a otro owner; el creador original es un dato histórico, no la única fuente de propiedad.

Las operaciones de equipo bloquean la fila del evento. Un trigger protege al último owner incluso frente a DML administrativo y operaciones simultáneas. Puede salir un propietario si queda otro; la prueba concurrente asegura que dos propietarios no puedan dejar el evento sin ninguno.

La eliminación es **lógica**: oculta el evento, cierra su acceso y revoca invitaciones pendientes. Conserva filas e historial; no es un borrado físico. Owners/administradores autorizados conservan lectura de auditoría del evento eliminado. No hay restauración ni purga física en la UI.

Los triggers registran creación/edición/eliminación de eventos, altas/bajas/cambios de rol y emisión/aceptación/revocación de invitaciones. El actor se obtiene de la sesión SQL. El historial no permite escritura directa del cliente, ni incluye correos, teléfonos, mensajes o tokens. Los nombres del equipo se consultan por una RPC restringida, sin ampliar el acceso de perfiles ajenos.

## Invitaciones por correo, sin costos adicionales

En otra terminal, preparar el entorno **servidor** solo si todavía no existe y servir la función local:

```powershell
if (-not (Test-Path supabase/functions/.env.local)) {
  Copy-Item supabase/functions/.env.example supabase/functions/.env.local
}
npm.cmd run functions:serve
```

El ejemplo usa `TEAM_MAIL_TRANSPORT=mailpit`, `TEAM_MAILPIT_URL=http://supabase_inbucket_jotopa:8025` y `APP_URL=http://localhost:5174`. El correo queda en Mailpit, sin envío externo. `.env.local` del servidor está ignorado por Git y no se copia a React.

`invite-member` verifica el JWT del remitente con `auth.getUser()` y llama la RPC con los permisos de ese mismo usuario, sin `service_role`. El chequeo legado `verify_jwt` del gateway está desactivado únicamente para esta función porque no soporta las claves de firma actuales; **el handler sí exige y verifica la sesión**. Se probaron respuestas 401 sin JWT o con JWT inválido y 403 para una cuenta sin permiso de equipo. Referencia: [autenticación de Edge Functions](https://supabase.com/docs/guides/functions/auth).

La RPC genera 32 bytes criptográficos, entrega el token una sola vez y guarda únicamente su hash SHA-256. El correo se normaliza, el enlace vence a los 7 días y queda vinculado al correo verificado en Auth. La aceptación recibe solo el token: el rol y el evento se leen de la fila guardada. No reemplaza membresías existentes. Rechaza tokens inválidos, vencidos, revocados, reutilizados, de otro correo o emitidos por alguien que perdió permisos. Cambiar/quitar un miembro revoca las invitaciones pendientes que había emitido. Reenviar al mismo correo revoca el enlace anterior.

El enlace usa `/equipo/aceptar#token=...`; el fragmento no viaja al servidor web. La página lo retira de la URL y lo conserva temporalmente en sessionStorage mientras la persona entra o se registra. Muestra el evento y el rol antes de aceptar y elimina el token local tras el éxito. Un token no sustituye una cuenta con el correo correspondiente.

El límite de emisión es **20 invitaciones por usuario por hora**, contando también las revocadas, y está serializado entre eventos. No hay reintentos automáticos de envío. Si el transporte falla o está deshabilitado, la UI ofrece copiar el enlace y enviarlo manualmente al destinatario.

Hay un adaptador opcional de Resend mediante HTTP, sin una dependencia adicional. Para usarlo se necesita un plan gratuito, `RESEND_API_KEY` y `TEAM_MAIL_FROM` propio/verificado, exclusivamente en el servidor. No se configuró una cuenta ni se enviaron correos externos. Si faltan credenciales, hay un error o se alcanza la cuota, se mantiene el envío manual; el código nunca cambia planes ni activa facturación. Referencia: [API de envío de Resend](https://resend.com/docs/api-reference/emails/send-email).

## Invitados — Fase 2A

Desde **Mis eventos → evento → Invitados** se puede agregar, consultar, editar y eliminar personas. La lista permite buscar por nombre, correo, teléfono, documento o grupo; filtrar por grupo o disponibilidad de contacto; y navegar páginas de 25 personas. Se exporta la lista filtrada completa, hasta 10.000 invitados, no solo la página visible. En esta etapa la baja del invitado es física y deja una entrada de auditoría sin datos personales. Al eliminarlo se invalida su enlace personal. La Fase 2B agrega QR y RSVP; la Fase 3A agrega envío manual, estado de convocatoria y línea de tiempo.

Rutas privadas: `/eventos/:eventId/invitados` y `/eventos/:eventId/invitados/importar`. Propietario, Administrador e Invitaciones pueden administrar, importar y exportar. Recepción solo consulta nombres y mesa: no recibe teléfonos, correos, documentos, grupos, acompañantes ni consentimiento. Contenido, Moderación, Solo lectura y personas ajenas no acceden a esta lista de contactos. La Etapa B habilita para Contenido una proyección separada de nombres/cantidades para asignar mesas, sin contactos. El marcado de asistencia en puerta sigue pendiente.

Se aplicaron dos migraciones **nuevas**, sin editar las anteriores:

- `20261122220000_guest_phone_validation.sql`: validación internacional en SQL, generada desde los metadatos públicos MIT de `libphonenumber-js` 1.13.17.
- `20261122221000_guests_and_transactional_import.sql`: tabla `guests`, restricciones, índices por evento/contacto/grupo/estado, RLS, proyección restringida, CRUD, importación, exportación y auditoría. Reservó los campos de invitación y RSVP, habilitados por las migraciones nuevas de la Fase 2B. Mesa y preferencias siguen reservadas; ningún cliente tiene DML directo.

La tabla exige `guests.read` y `guests.contact_read` para leer los campos de gestión; el cliente no tiene INSERT/UPDATE/DELETE directo. Las RPC verifican los permisos SQL existentes, toman el actor de la sesión y bloquean el evento durante las escrituras. No aceptan un rol, un actor ni campos adicionales del invitado. Los índices únicos impiden repetir correo, teléfono o documento dentro del mismo evento; el mismo identificador puede existir en eventos distintos.

`guest_roster` es una vista deliberadamente restringida a `id,event_id,full_name,table_id`, con `security_barrier` y comprobación explícita de `has_event_permission` para cada evento. Usa permisos del propietario para permitir la proyección a Recepción sin concederle acceso a la tabla con contactos; **la vista no hereda automáticamente RLS**. Esta excepción debe conservar tanto su lista fija de columnas como su predicado de permisos. Se probaron accesos HTTP y SQL de todos los roles y del anónimo. Referencias: [RLS y vistas](https://supabase.com/docs/guides/database/postgres/row-level-security), [permisos por columna](https://supabase.com/docs/guides/database/postgres/column-level-security).

Los teléfonos se guardan como E.164 (`+595981123456`); se aceptan formatos con espacios, guiones, paréntesis y prefijo `00`. Sin prefijo se interpreta Paraguay. Se valida el plan de numeración, no la existencia o titularidad de la línea. Correos en minúsculas; documentos en mayúsculas sin espacios, puntos ni guiones. No se solicitan documentos obligatorios. El consentimiento comienza en No y debe marcarse únicamente con autorización. El cupo total es un entero entre 1 y 21 e incluye al destinatario; internamente conserva los acompañantes permitidos entre 0 y 20.

### Excel y conciliación

1. Descargar la plantilla desde Invitados o Importar. Incluye hojas **Invitados** e **Instrucciones**, encabezado fijo, filtros, formatos de texto para contactos/documentos y validación de acompañantes/consentimiento.
2. Completar una invitación por fila: Destinatario, Teléfono, Correo, Documento, Grupo o familia, Cupo total, Consentimiento. Solo Destinatario es obligatorio. Se aceptan también los encabezados anteriores Nombre y Acompañantes permitidos. No usar fórmulas ni vínculos. Conservar teléfonos y documentos como texto para evitar redondeos de Excel y pérdida de ceros.
3. Seleccionar el `.xlsx`: se muestra una vista previa con errores Zod por fila y conciliación real de Supabase **sin guardar cambios**. Revisar las cantidades antes de confirmar.
4. Confirmar **Importar N filas válidas**. El reporte distingue creados, actualizados y rechazados. Para corregir rechazos, cargar un archivo nuevo con esas filas; no repetir filas sin identificadores de un lote ya importado.

La conciliación busca coincidencias por **correo, teléfono o documento**, dentro del evento. Una coincidencia actualiza; ninguna crea; identificadores que apuntan a personas diferentes rechazan la fila sin fusionar registros. Se rechazan todas las filas que repiten identificadores en el archivo o intentan actualizar a una misma persona más de una vez. Nunca se concilia por nombre.

En actualizaciones importadas, las celdas vacías conservan contactos, documento, grupo, acompañantes y consentimiento existentes. Un cero o No explícitos sí actualizan el valor. En altas, acompañantes vacíos significa cero y consentimiento vacío significa No. Para borrar datos opcionales existentes, usar el formulario de edición. Sin identificadores, cada lote nuevo crea una persona; los nombres iguales son válidos.

`import_guests` es una RPC transaccional con validación del lado servidor independiente de Zod. Las filas rechazadas se informan sin modificar; las aceptadas se guardan juntas. Una falla inesperada revierte todo el lote y su auditoría. La vista previa ejecuta la misma lógica dentro de una subtransacción que se revierte. Cada archivo seleccionado recibe un UUID de lote: repetir esa solicitud devuelve el reporte previo sin volver a escribir; cambiar su contenido con el mismo UUID se rechaza. Esto también se probó con solicitudes concurrentes. La confirmación vuelve a validar porque la lista puede cambiar después de la vista previa.

Se registra `guest.created`, `guest.updated`, `guest.deleted` y `guests.imported`. Los registros guardan actor, UUID, cantidades y motivos seguros; no nombres, contactos, documentos ni archivos. Los usuarios no pueden alterar el historial ni falsificar el actor.

Límites: `.xlsx` de hasta **2 MB y 1.000 filas** por importación; máximo 20 columnas, 20 MB descomprimidos y 10 MB por entrada ZIP. Se rechazan macros, objetos incrustados, enlaces externos, fórmulas, fechas y contenedores inválidos. El parser vive en un worker descartable con límite de 15 segundos; no se sube ni guarda el archivo original. ExcelJS 4.4.0 se incorporó por la función de Excel exigida y se carga solo al usarla, fuera del hilo de la UI. El bundle del worker pesa aproximadamente 1,23 MB sin comprimir. `libphonenumber-js/max` se carga con las rutas de invitados. Ambos son gratuitos y sus versiones están fijadas. El override de `uuid` 11.1.1 corrige la dependencia transitiva de ExcelJS; lectura y escritura fueron verificadas tras el cambio.

La exportación puede superar 1.000 registros; para reimportarla hay que dividirla en lotes de hasta 1.000 personas. No se admiten `.xls`, `.xlsm` ni CSV. Los metadatos telefónicos deben actualizarse junto al paquete: `node scripts/generate-guest-phone-rules.mjs supabase/migrations/<marca_nueva>_guest_phone_validation.sql` crea un archivo nuevo y se niega a sobrescribir. Revisarlo, aplicarlo localmente y volver a generar los tipos. No editar la migración aplicada.

## Invitación personal, QR y RSVP — Fase 2B

Para usar el flujo local:

1. Editar el evento y seleccionar **Activo**. Revisar y configurar su fecha y hora límite RSVP.
2. En Detalles, abrir **Acceso a las invitaciones personales** y definir apertura/cierre en la zona horaria del evento. Solo Propietario y Administrador pueden hacerlo. Editar otros datos del evento conserva este período; al cambiar su fecha, revisar el período expresamente.
3. En Invitados, usar **Enlace y QR** de una persona. Propietario, Administrador e Invitaciones pueden copiar el enlace y descargar el PNG. Se conserva el mismo enlace al volver a consultarlo. **Regenerar enlace personal** invalida el enlace y QR anteriores, conservando la respuesta.
4. El destinatario abre `/i/:token`, sin registrarse ni iniciar sesión, y elige **Sí, asistiré** o **No asistiré**. Si acepta, confirma entre una persona y el cupo total autorizado, incluyéndose. Si rechaza, se registran cero asistentes. Puede cambiar su respuesta dentro del plazo. Ya no se acepta Quizás; ver la migración histórica en Etapa B.
5. **Actualizar lista** muestra al anfitrión el RSVP, total de personas confirmadas, mesa, hora de respuesta en la zona del evento y solicitud de baja de recordatorios. No se agregó Realtime. Los indicadores de la Etapa B están en Detalles del evento; la exportación conserva contactos y cupo total.

### Acceso y privacidad

Las migraciones nuevas son `20261122230000_personal_invitations_and_rsvp.sql`, `20261122231000_keep_rate_limiter_lock_order.sql` y `20261122232000_deny_direct_invitation_limit_access.sql`. Generan tokens para los invitados existentes, establecen el valor predeterminado para los nuevos (incluida importación), agregan versión de respuesta, RPC, campos de lectura RSVP para los roles autorizados y un limitador privado con RLS. La segunda conserva el orden de bloqueos al eliminar la limpieza cruzada de contadores durante una solicitud pública. La tercera declara explícitamente la política de denegación para clientes del limitador, además de revocar sus permisos de esquema/tabla. No se editaron migraciones anteriores y los tipos se generaron desde Supabase Local.

Cada token contiene **32 bytes criptográficos (256 bits)** generados por `pgcrypto.gen_random_bytes`, codificados como 64 caracteres hexadecimales, con índice único. Se guarda en la columna protegida `guests.invite_token`, **como credencial recuperable, no como hash**, para poder copiar repetidamente el mismo enlace. Ningún rol del cliente puede seleccionar esa columna directamente; `get_guest_invitation_token` la entrega después de comprobar `guests.write`, `guests.contact_read` y la pertenencia del invitado al evento. Las RPC de preparación/envío de la Fase 3A también la entregan al anfitrión autorizado, con las comprobaciones adicionales de consentimiento, baja, ventana y permisos de envío. La administración SQL de confianza puede leerla. El token nunca aparece en listados, exportaciones ni auditoría. Referencia: [datos aleatorios de pgcrypto](https://www.postgresql.org/docs/17/pgcrypto.html).

El enlace es una **credencial de portador**: quien lo posee puede actuar sobre esa invitación. No verifica la identidad física del visitante. Si se comparte por error, regenerarlo. El frontend no guarda tokens en localStorage/sessionStorage, claves de caché ni mensajes de error; el diálogo los mantiene temporalmente en memoria. No hay analítica ni registros de consola de estos valores. Las pruebas comprueban que no aparecen en consola ni en `Referer`.

La página usa un cliente Supabase sin sesión persistente y una caché propia en memoria, aislada por invitación, con clave fija y descarte al salir. `guest_invitation` acepta únicamente el token y un objeto de acción por **POST**: `read`, `respond` u `opt_out`. No acepta un ID de invitado o evento ni campos arbitrarios. La respuesta contiene solo nombre, cupos, RSVP, fecha, preferencia de baja y versión del invitado correspondiente, y título, tipo, fecha/zona, plazo y cierre de su evento. No devuelve contactos, documentos, grupos, IDs de otras personas, creador, equipo ni tokens. El anónimo no tiene acceso directo a las tablas; las políticas existentes de otros roles se mantienen, incluida la proyección mínima de Recepción.

La función exige evento Activo, sin borrado lógico y `session_opens_at <= reloj_servidor < session_closes_at`. Fuera de esa ventana, con borrado, estado Borrador/Cerrado o token inválido/regenerado devuelve el mismo error genérico, sin información del evento. Las respuestas además requieren `reloj_servidor < rsvp_deadline`, obligatorio desde B. Tras el plazo, dentro de la ventana, siguen disponibles lectura, mesa y baja de recordatorios. Al cerrarse la ventana se bloquean las acciones públicas actuales. No se confía en la fecha del navegador.

`rsvp_at` se genera en Postgres como `timestamptz`, guardado en UTC y presentado en la zona del evento. Una versión impide que dos respuestas simultáneas distintas se sobrescriban: una se guarda y la otra pide actualizar la invitación. Los reintentos con la misma respuesta y acompañantes son idempotentes y conservan fecha y versión. Cada escritura revalida cupos, plazo y token después de bloquear evento e invitado. Bajar el cupo por debajo de acompañantes ya confirmados es rechazado por la restricción de la tabla; primero debe corregirse la confirmación.

`opt_out` solo puede activar `opted_out=true`; no permite deshacerlo públicamente ni cambia el RSVP. Editar/importar contactos no limpia esa preferencia. La cola y las operaciones de envío de la Fase 3A ya excluyen estas personas; los canales futuros deben conservar esa regla. Se auditan `guest.rsvp_updated`, `guest.opted_out`, `guest.link_accessed` y `guest.link_rotated`, con UUID y valores de respuesta/cantidad, sin nombres, contactos ni tokens. Desde la Fase 3A, leer con un identificador de visita válido puede registrar una apertura; nunca modifica el RSVP.

### Límites y QR

El límite SQL es compartido entre pestañas y solicitudes concurrentes: **30 lecturas por minuto por invitado**, **6 acciones de escritura por minuto por invitado** (incluye intentos inválidos) y **120 solicitudes por minuto en cada una de 64 cubetas globales**, incluso para tokens desconocidos. Las ventanas duran 60 segundos. Los errores públicos devuelven JSON `{ok:false, code, retry_after?}` con HTTP 200, manteniendo la transacción para que los intentos rechazados también consuman cuota. La UI muestra el plazo de reintento. No hay reintentos automáticos de RSVP.

El estado del limitador vive en `private.invitation_rate_limits`, fuera de los esquemas expuestos, sin permisos para anónimo/autenticado y con RLS. No contiene tokens ni direcciones IP: solo cubeta, UUID, contador y última ventana. Se reinicia al vencer la ventana y se elimina en cascada con el invitado; está acotado a cuatro filas por invitado (dos originales y dos de C) más 64 globales. No se expone como seguimiento de aperturas ni se agrega cron. El límite global puede afectar a visitantes distintos que coincidan en una cubeta; protege la operación y no sustituye una protección de red frente a DDoS.

Los QR se generan en el navegador con **qrcode 1.5.4**, cargado dinámicamente solo al abrir el diálogo (aproximadamente 23,5 KB sin comprimir / 8,9 KB gzip). PNG de 768 px, margen de cuatro módulos, corrección M y contraste verde oscuro/blanco. No se envía el enlace a un proveedor de QR. `@zxing/library` y `pngjs` son dependencias de desarrollo para leer y comprobar realmente los PNG; no llegan al frontend. Referencia: [node-qrcode](https://github.com/soldair/node-qrcode).

Copiar requiere permiso de portapapeles y un contexto seguro (localhost o HTTPS); si el navegador lo impide, se informa y se mantiene la descarga de QR. Un QR con `localhost:5174` solo apunta al equipo donde se abre: no es una URL pública accesible desde otros teléfonos. No se probó un lector físico ni se publicó la aplicación.

Se configuraron `Referrer-Policy: no-referrer`, exclusión de indexación y `Cache-Control: no-store` en desarrollo/preview y para `/i/*` en `vercel.json`, además de meta referrer previa a los scripts. La RPC también responde no-store. **La URL solicitada contiene el token**: antes de publicar hay que configurar/redactar los registros de acceso de hosting, proxy y observabilidad; estos no se probaron porque no hubo despliegue. La aplicación y su auditoría no registran tokens. No habilitar trazas de navegador ni capturar pantallas del QR como registros de diagnóstico.

## Envío y seguimiento — Fase 3A

Rutas privadas: `/eventos/:eventId/invitaciones` y `/eventos/:eventId/invitaciones/plantillas`. Se accede desde **Detalles → Invitaciones** o **Invitados → Enviar invitaciones**. Propietario, Administrador e Invitaciones pueden preparar y registrar envíos; los demás roles no reciben contactos, plantillas ni historial individual. El servidor exige los permisos SQL, independientemente de los controles visibles.

### Uso local

1. Activar el evento y revisar su ventana de acceso y fecha límite RSVP. Registrar autorización de contacto en los invitados que corresponda. La cola incluye únicamente personas pendientes, sin apertura ni envío marcado, con `contact_consent=true` y `opted_out=false`, dentro de la ventana y antes del plazo.
2. En **Plantillas**, personalizar un mensaje de texto con `{nombre}`, `{link}`, `{fecha}`, `{lugar}` y `{fecha_limite}`. `{link}` es obligatorio. Se admiten hasta 25 plantillas activas por evento, 2.000 caracteres y 20 apariciones de variables. Las variables desconocidas y cadenas con formato de token personal se rechazan en SQL y Zod. Se puede editar o archivar una plantilla.
3. El lugar se configura en la plantilla, sin anticipar las ubicaciones de la Fase 4. Si está vacío, aparece «Lugar a confirmar». Las fechas se muestran en la zona del evento; sin plazo RSVP se usa el cierre de acceso como referencia. La sustitución se hace una sola vez: un nombre que contenga llaves permanece literal. No se interpreta HTML.
4. En **Cola de envío**, revisar el mensaje. La vista previa oculta el token; al copiar o abrir WhatsApp se completa el enlace real. **Abrir WhatsApp y marcar enviada** abre `https://wa.me/<E164_sin_+>?text=<texto_codificado>`; todavía hay que tocar Enviar dentro de WhatsApp. Se valida el formato/numeración, no la existencia de la cuenta ni la titularidad. Referencia: [clic para chatear de WhatsApp](https://faq.whatsapp.com/5913398998672934).
5. La siguiente persona queda lista automáticamente. **Saltar por ahora** y **No se pudo enviar** mantienen colas separadas; **Retomar** devuelve a Pendientes. La paginación es de 25 personas. Sin teléfono válido se puede copiar el mensaje o el enlace, pero el botón de WhatsApp está bloqueado.
6. Copiar solo registra una solicitud de copia y **no marca enviada**. Después de compartir por otro medio, usar **Ya compartí el enlace**. La marca manual puede deshacerse durante 10 minutos, o registrarse como fallida, conservando aperturas, respuestas e historial. Una pestaña bloqueada registra un intento fallido sin marcar envío.
7. En **Invitados**, consultar Pendiente, Enviada, Abierta o Respondida y abrir **Historial**. La línea de tiempo muestra acciones manuales, deshacer, aperturas aceptadas y respuestas RSVP, con paginación de 25 acciones. Las actualizaciones tienen botón de refresco; no se agregó Realtime.

### Modelo, seguridad y límites

Se aplicaron cuatro migraciones nuevas, sin modificar las anteriores:

- `20261123000000_invitation_delivery_and_tracking.sql`: tablas `message_templates`, `invitations`, `invitation_events`, índices, RLS, permisos de columna, RPC, triggers de RSVP y plantilla predeterminada para eventos actuales/nuevos.
- `20261123001000_track_personal_link_visits.sql`: amplía la RPC pública conservando las validaciones, cuotas y funcionamiento RSVP de la Fase 2B.
- `20261123002000_bind_delivery_retries_and_guard_templates.sql`: vincula reintentos a sus parámetros originales y evita incrustar tokens personales en campos reutilizables de plantillas.
- `20261123003000_share_queue_state_across_manual_channels.sql`: mantiene un estado único de cola por invitado, también al fallar un enlace compartido por otro medio.

Los tipos TypeScript se regeneraron desde Supabase Local. No se instalaron dependencias nuevas. `features/invitations` agrupa API, esquemas, adaptadores sencillos `MessageChannel`, plantillas, cola, estados y línea de tiempo; las rutas se cargan por separado. Esta estructura permite sumar los recordatorios y el panel sin automatizar WhatsApp.

Hay una invitación canónica de canal **link** por invitado para agrupar el seguimiento, más una fila **whatsapp** cuando se usan acciones de ese canal. El estado mostrado prioriza respuesta, apertura y marca manual de envío, en ese orden. Abrir WhatsApp **no confirma entrega ni lectura de WhatsApp**: `delivered_at` y las señales de entrega quedan reservados a email. Las aperturas pertenecen al enlace personal, sin atribuirlas a un canal específico.

La página pública genera un UUID de visita solo en memoria y lo envía junto al token por POST. El servidor verifica token, estado, ventana y cuota antes de registrar primera/última apertura y contador, con reloj UTC de Postgres. Reutilizar un UUID no suma; visitas nuevas dentro de 60 segundos de la última apertura aceptada se agrupan. Solo las aperturas aceptadas actualizan las fechas y el historial. Las lecturas antiguas sin UUID, RSVP y baja no incrementan el contador. Se conservan los límites públicos de 30 lecturas/6 escrituras por invitado por minuto y el límite global de la Fase 2B.

Estos contadores representan visitas aceptadas al enlace, **no lectores humanos únicos**: un anfitrión que abra la URL o un bot que ejecute la página con un enlace válido también puede contar. No se usan píxeles, direcciones IP ni identificación persistente del dispositivo. No se inventaron aperturas/envíos anteriores; de respuestas previas solo se incorporó la respuesta actual con su fecha real y marca histórica. Cada cambio nuevo de RSVP se registra mediante trigger, con versión única; repetir una respuesta idéntica no duplica acciones ni altera su fecha.

Las operaciones manuales bloquean filas y vuelven a validar permisos, consentimiento, baja y ventana antes de actuar. Un UUID de solicitud identifica actor, invitado, acción, plantilla y referencia; reintentos no crean marcas duplicadas. Los envíos concurrentes del mismo invitado solo aceptan una marca. Límites: **5 marcas de envío por invitado por hora**, contando las deshechas, y **200 acciones manuales por usuario por hora** entre todos sus eventos. Una respuesta de red perdida conserva la referencia para intentar deshacer; la app no reintenta una acción externa automáticamente.

Las tres tablas tienen RLS y no permiten DML directo del cliente. Las funciones privilegiadas usan `security definer` y `search_path` vacío; los helpers privados no son ejecutables por el cliente. La lectura individual requiere `guests.read` y `guests.contact_read`; preparar/enviar requiere además `invitations.send`. Los UUID de visita y solicitud no están concedidos como columnas de lectura directa de `invitation_events`. El historial y la auditoría guardan tipos, actor, UUID y metadatos permitidos, sin mensajes renderizados, nombres, correos, teléfonos ni tokens. El anónimo solo opera sobre su invitación mediante la RPC pública.

El token permanece temporalmente en memoria al preparar/copiar el mensaje y viaja intencionalmente dentro del enlace compartido con el destinatario. No se agrega a claves de caché, almacenamiento persistente, registros ni errores. Las plantillas guardan `{link}`, no un token personal. Se mantiene la advertencia de redactar registros de infraestructura antes de un despliegue. La baja física de un invitado elimina en cascada sus invitaciones e historial; queda la auditoría mínima `guest.deleted`. La inmutabilidad frente al cliente no implica conservación después de esa baja.

## Invitación digital visual — prioridad actual

Entrar en **Mis eventos → evento → Diseñar invitación** (`/eventos/:eventId/invitacion`). Los mensajes de envío de la Fase 3A siguen en **Invitaciones → Plantillas**; son independientes de estas plantillas visuales.

### Tres estilos propios

- **Entre nosotros**: romántica, portada fotográfica envolvente, marco curvo, tipografía delicada y secciones de inspiración editorial.
- **Que sea inolvidable**: festiva, composición asimétrica, retrato enmarcado, sello y franja gráfica; tipografía moderna por defecto.
- **Lo esencial**: minimalista, nombres y fecha separados de una fotografía amplia, líneas finas, espacios generosos y composición editorial.

Las diferencias incluyen estructura de portada, fotografías, disposición de las secciones y RSVP; no son cambios de color de una misma página. Hay tres paletas coherentes, tres combinaciones tipográficas y tres posiciones verticales de encuadre. Cormorant Garamond y Manrope se sirven localmente, con sus licencias OFL en `public/fonts/`; suman aproximadamente 62 KB. No hay fuentes remotas, música automática ni nuevas dependencias npm.

### Crear y publicar

1. Crear o seleccionar un evento. Definir su fecha, zona, plazo RSVP y acceso mediante los controles existentes. Para publicar la versión visual, el evento debe estar **Activo**; la ventana de acceso sigue controlando cuándo puede abrirse el enlace.
2. Elegir estilo, paleta y combinación tipográfica. Completar nombres, frase de portada, bienvenida y cierre. El saludo por nombre puede activarse o desactivarse; solo usa el nombre del invitado del token.
3. Escribir una descripción accesible y cargar la portada o fotos de galería. Se puede reutilizar una foto de la biblioteca del evento, cambiar el encuadre, ordenar hasta ocho fotos, escribir pies y quitar selecciones.
4. Agregar hasta cuatro momentos de ceremonia, recepción u otro tipo, cada uno con fotografía, descripción, lugar, dirección y fecha/hora. El editor interpreta los horarios en la zona del evento y guarda UTC. Coordenadas opcionales permiten precisar Maps/Waze; sin ellas se busca la dirección. También se aceptan enlaces HTTPS de esos servicios, validados en cliente y servidor. El botón principal dice **Cómo llegar**.
5. Configurar regalos, publicación expresa de transferencias, hospedajes y vestimenta según se explica en Etapa A. Activar/desactivar y ordenar las diez secciones con controles accesibles. Las secciones opcionales vacías no aparecen. Los textos e imágenes de secciones desactivadas también se excluyen de la respuesta pública y del manifiesto de imágenes.
6. Abrir **Vista previa**, en celular o escritorio. Valida y normaliza una copia de los cambios actuales, sin exigir guardarlos primero. Usa el mismo renderer, pero una confirmación de muestra deshabilitada: no tiene token, no escribe RSVP ni registra aperturas. Si hay datos inválidos, corregirlos antes de previsualizar, guardar o publicar.
7. **Guardar borrador** conserva la edición sin cambiar lo que ven los invitados. **Guardar y publicar** guarda primero y publica una versión consistente. La publicación actualiza Supabase Local; no hace un despliegue. Los guardados usan revisión para impedir sobrescrituras entre editores. No hay autoguardado: guardar antes de salir.
8. Abrir el enlace o QR personal existente. Se muestra la versión publicada y los controles Sí, asistiré / No asistiré, personas autorizadas, plazo y baja. La mesa personal aparece cuando está asignada y publicada por el anfitrión. La publicación no rota tokens ni reinicia respuestas o aperturas. Retirar la versión visual conserva el borrador y vuelve a la invitación básica existente.

Propietario, Administrador y Contenido pueden preparar borradores y gestionar fotos. Solo Propietario y Administrador publican o retiran. Invitaciones puede seguir convocando con sus permisos anteriores; no recibe acceso al editor. La fecha principal y zona siguen siendo datos del evento: modificarlas actualiza ese calendario común, incluso cuando el diseño ya estaba publicado. Los momentos adicionales pertenecen a la versión visual.

### Persistencia e imágenes privadas

Cuatro migraciones **nuevas**, aplicadas localmente, sin cambiar las trece anteriores:

- `20261123010000_visual_invitation_designs.sql`: `event_invitation_designs`, `event_invitation_assets`, índices, RLS, bucket privado `event-assets`, RPC de edición/publicación y manifiesto limitado al token.
- `20261123011000_harden_design_asset_binding.sql`: comprueba cada UUID de foto contra su evento y controla la finalización de una carga.
- `20261123012000_align_published_design_validation.sql`: alinea límites Unicode/emoji y fechas UTC del servidor con el esquema del cliente.
- `20261123013000_project_only_visible_invitation_content.sql`: entrega únicamente el contenido de secciones visibles, incluidas las fotos firmables.

`features/invitation-design` separa esquema versionado, acceso remoto, editor, optimización y presentación. RSVP conserva su cliente anónimo aislado, su caché sin tokens en claves y las operaciones anteriores. `private.invitation_snapshot` añade la proyección publicada a la respuesta ya autorizada; no crea otro sistema de RSVP o de seguimiento. El contador se actualiza en un componente propio y respeta la fecha UTC. Animaciones CSS y transiciones discretas respetan `prefers-reduced-motion`.

Las tablas no permiten DML directo del cliente. Todas las escrituras pasan por RPC autorizadas, con permisos SQL y `search_path` vacío. El borrador nunca se entrega al anónimo. Las fotos pertenecen a un evento y solo pueden seleccionarse si están listas y pertenecen a ese mismo evento. Guardar/publicar/retirar y completar una foto dejan auditoría mínima, sin textos, contactos, archivos ni tokens.

La Edge Function **`invitation-assets`** valida el JWT real para subir/eliminar. El navegador acepta JPG/PNG/WebP de hasta 10 MB y 24 megapíxeles, decodifica y vuelve a dibujar las imágenes; produce WebP de hasta 1 MB por variante, lados máximos de 1920 y 720 px. El servidor comprueba MIME, estructura WebP, dimensiones, proporción, tamaño total, ausencia de animación/EXIF/XMP y permisos. Puede conservar el perfil de color estándar creado por Canvas. No se guarda el original, su nombre de archivo ni sus metadatos personales.

Solo la función del servidor sube archivos y confirma que están listos. Usa la clave privilegiada que Supabase inyecta automáticamente en su runtime, **exclusivamente del lado servidor**; no se copió a React ni a variables `VITE_`. El frontend no tiene INSERT/UPDATE/DELETE de Storage. La lectura del editor usa RLS y URLs firmadas. Para el invitado, la función verifica el token con la RPC existente y firma únicamente recursos publicados y visibles de ese evento, por hasta **60 segundos**, sin extenderlos más allá del cierre conocido al emitirlos. Se comprueba la expiración real de Storage antes de entregar la URL. No acepta IDs/rutas de fotos indicados por el visitante. Referencias: [control de acceso de Storage](https://supabase.com/docs/guides/storage/security/access-control), [URLs firmadas](https://supabase.com/docs/reference/javascript/storage-from-createsignedurls), [secretos del runtime](https://supabase.com/docs/guides/functions/secrets).

Máximos: 20 fotos guardadas por evento y 30 reservas de carga por usuario por hora, incluidas las eliminadas/fallidas. No hay reintentos automáticos de carga. Una carga interrumpida puede eliminarse desde la biblioteca. Storage y Postgres no comparten una transacción: se hace compensación al fallar una subida; una interrupción abrupta puede requerir limpiar archivos huérfanos administrativamente. No se agregó un cron de limpieza. Una URL firmada ya emitida puede seguir vigente hasta su expiración si el evento se cierra o el token se rota después de emitirla; una imagen ya descargada tampoco puede retirarse del dispositivo.

La portada tiene prioridad alta, `srcset` selecciona una variante según el ancho, y las fotos de galería usan carga diferida con dimensiones reservadas. La caché de URLs públicas es efímera; se renuevan antes de vencer mientras la página está activa. No hay transformaciones de imágenes de pago ni servicios externos durante la visita del invitado. Las cuotas del plan gratuito siguen siendo límites reales; no se activa facturación.

Servir todas las funciones locales con el comando existente:

```sh
npm run functions:serve
```

No requiere nuevas variables del frontend. `verify_jwt=false` del gateway se declara para esta función porque el visitante no tiene cuenta; subir/eliminar sí verifican Auth, y firmar exige el token personal válido y sus límites SQL. El runtime de funciones de Jotopa se inició localmente; SIGA no se modificó.

### Referencias y revisión visual

Se inspeccionaron en Chrome, sin copiar código ni fotografías:

- [Google Sites](https://sites.google.com/view/carolinaydiego/p%C3%A1gina-principal): portada fotográfica, lectura vertical, bloques de horarios/ubicaciones, galería y cierre con confirmación.
- [Canva](https://weddingbelenydiego.my.canva.site/invitacion): composición de papel, fotografías y ornamentos; se vio la portada y se desplazó su contenedor interno hasta horarios y recepción. No se certificó cada transición de toda la página.
- [TechNow](https://invitaciones.technow.com.py/evelio-y-ruth): se vieron la pantalla de entrada y los bloques de contador, lugares, vestimenta y confirmación. No se pudo completar de forma fiable la apertura de su pantalla inicial en una segunda visita; la transición y la portada interior no se dan por verificadas.

Las capturas propias están en [artifacts/invitaciones](artifacts/invitaciones/). Los nombres, fechas y lugares que aparecen son **fixtures temporales de revisión**, retirados de Auth, Postgres y Storage al terminar. Las fotos de esas capturas provienen de Unsplash con su [licencia gratuita](https://unsplash.com/license), independientes de las tres referencias: identificadores `photo-1511285560929-80b456fea0bc`, `photo-1511795409834-ef04bbd61622` y `photo-1523438885200-e635ba2c371e`. No se incluyen como fotos predeterminadas ni se guardan eventos ficticios en la aplicación. Las pruebas también funcionan sin esas fotos locales, con una imagen de prueba generada en Canvas.

## Etapa A — Información completa de la invitación

Se amplía el editor existente, sin crear un segundo módulo de contenido ni duplicar lugares, regalos o alojamientos en tablas paralelas. El contenido pertenece al documento versionado de cada evento en `event_invitation_designs`; sus fotografías reutilizan `event_invitation_assets`, el bucket privado y la misma Edge Function. Se mantienen las tres composiciones originales, sus colores, fuentes, vista previa y publicación.

- **Ceremonia y recepción:** apartados independientes, fotografía propia, descripción, fecha/hora y dirección. Se pueden crear, ocultar, reordenar y quitar hasta cuatro momentos. Si hay un único lugar, su tarjeta ocupa una composición individual, sin secciones vacías. Maps y Waze aceptan enlaces propios del servicio o generan la búsqueda con dirección/coordenadas codificadas. No requieren claves ni servicios pagos: [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started), [Waze Deep Links](https://developers.google.com/waze/deeplinks).
- **Cuenta regresiva:** conserva el contador hasta `events.starts_at`, un instante UTC, independiente del plazo RSVP. Los horarios se muestran en la zona del evento; cambiar la zona de presentación no modifica el instante del encuentro.
- **Regalos:** mensaje y hasta doce opciones con nombre, descripción, enlace HTTPS, orden y visibilidad. No hay compras, pagos ni reserva de regalos. Los enlaces externos se abren con protección de referencia y de ventana.
- **Transferencias:** banco, titular, cuenta, alias e indicaciones. Para publicarlos hay que marcar expresamente **Publicar expresamente los datos de transferencia**, activar Regalos y publicar el diseño. El servidor elimina esos valores de la proyección pública cuando falta alguna condición; no basta con ocultarlos en React. La vista publicada permite copiar cuenta o alias.
- **¿Venís de lejos?:** hasta seis hospedajes con foto, descripción, dirección, Maps/Waze, teléfono, WhatsApp y enlace de reservas opcional. Se pueden crear, editar, ordenar, ocultar y eliminar. Los números se normalizan con el validador de invitados existente y prefijo predeterminado +595; el servidor valida el formato internacional y el plan telefónico. Se enlaza al hospedaje, sin gestionar reservas ni enviar mensajes automáticamente.
- **Vestimenta e información adicional:** texto opcional y foto de vestimenta reutilizable desde la biblioteca. Sus controles y los de las demás secciones siguen en El recorrido. No se agregan textos, cuentas, hoteles ni fotos ficticias predeterminadas.

### Migración, compatibilidad y permisos

Nueva migración aplicada localmente: **`supabase/migrations/20261123020000_invitation_information_sections.sql`**. Conserva las diecisiete migraciones anteriores. Extiende la validación SQL del diseño, la selección de imágenes y su proyección pública; no agrega tablas ni cambia el contrato de RSVP. Los tipos públicos se regeneraron desde Supabase Local con la CLI, sin edición manual.

Los documentos v1 guardados/publicados siguen siendo válidos. React los adapta al editor v2 manteniendo textos, horarios, orden y fotografías; regalos y hospedajes comienzan desactivados. No se reescriben filas ni se republican eventos automáticamente. El próximo guardado usa v2. Un borrador nuevo no cambia la publicación anterior. Los límites de revisión concurrente siguen activos.

El servidor valida el esquema completo, límites de texto, fechas UTC, coordenadas, teléfonos y URLs HTTPS sin credenciales. Maps/Waze tienen una lista explícita de dominios/rutas; los demás enlaces requieren dominio público con HTTPS, sin puertos adicionales. No se descargan enlaces del anfitrión desde el servidor. Límite del documento v2: 64 KB; se conservan los límites anteriores de imágenes y subidas. Los identificadores de fotos de momentos, hospedajes y vestimenta se comprueban contra su evento tanto al guardar como al publicar. Tampoco se pueden borrar fotos usadas por el borrador o la publicación.

RLS y permisos permanecen: **owner/manager/content** editan contenido; solo **owner/manager** publican. Los otros cuatro roles y un usuario ajeno no pueden leer borradores ni acceder a sus imágenes. Los contactos de un hospedaje son contenido que el anfitrión publica expresamente; no proceden de la tabla de invitados. El anónimo recibe únicamente el diseño publicado de su evento, sus propios datos de invitación y URLs firmadas de imágenes visibles. No recibe momentos, regalos u hospedajes ocultos, datos bancarios deshabilitados ni fotos de otro evento.

### Código y pruebas añadidas

Dentro de `src/features/invitation-design/`: `information-models.ts` y `links.ts` centralizan validación y enlaces; `hooks.ts` comparte la subida existente. Los componentes nuevos `LocationsEditor`, `InformationEditor`, `ContentPhotoField` y `LocationFields` amplían el editor. `ScheduleSection`, `LodgingSection`, `GiftsSection`, `BankDetails` y `LocationLinks` presentan la información. Se actualizan `models.ts`, `DesignEditor`, `InvitationPresentation`, `PhotoUpload`, `PhotoLibrary` y `invitation.css` para integrar el esquema, las fotos y la publicación existente.

Pruebas nuevas: `information.test.ts`, `scripts/information-test-helpers.mjs`, `scripts/information.integration.test.mjs`, `supabase/tests/information_rls.sql` y `tests/browser/information.spec.mjs`. `package.json` y `scripts/test-rls.mjs` las incorporan. La prueba visual anterior solo actualiza el nombre accesible del botón de Maps a Cómo llegar.

Las capturas de esta etapa se guardan separadas de las anteriores en [la galería de revisión](artifacts/etapa-a/revision.html). Incluye las tres invitaciones completas a 360 y 1440 px y detalles de lugares, regalos y hospedaje. [Comparación de portadas](artifacts/etapa-a/comparacion-portadas.png) y [comparación de ceremonia/recepción](artifacts/etapa-a/comparacion-lugares.png) reúnen capturas reales, sin reconstruir la interfaz. Usan eventos, nombres, cuentas y hospedajes temporales; se eliminan de Auth, Postgres y Storage al finalizar. Las fotografías de revisión conservan la procedencia/licencia explicada arriba y no se incluyen como contenido predeterminado. Los números de muestra no se contactan.

En la nueva visita a las referencias durante A se pudo ver la portada de Canva. Google Sites no terminó de cargar en la captura puntual y TechNow mostró su pantalla de entrada; no se dan por verificadas nuevas transiciones ni detalles interiores de esas visitas. Las observaciones anteriores se conservan en Referencias y revisión visual, distinguidas de esta comprobación parcial.

## Etapa B — Confirmación, cupos y mesas

### Uso actual

1. En **Editar evento**, definir la fecha y hora límite RSVP en la zona del evento. El formulario la exige; PostgreSQL impide fechas no finitas, posteriores al evento o eliminadas. Los eventos existentes sin plazo recibieron su fecha de inicio como límite, con auditoría; las llamadas antiguas de creación que omiten el argumento usan ese mismo valor. Revisar y ajustar expresamente este plazo antes de convocar.
2. En **Invitados**, agregar o editar un **Destinatario** y su **Cupo total**, entre 1 y 21 personas. El nombre puede ser Juan Pérez, Carlos y María o Familia González, sin clasificaciones obligatorias. El cupo incluye al destinatario principal y es independiente del nombre. No puede reducirse por debajo de la asistencia ya confirmada.
3. Descargar la plantilla Excel actual: **Destinatario, Teléfono, Correo, Documento, Grupo o familia, Cupo total, Consentimiento**. Solo Destinatario es obligatorio. Un cupo vacío conserva el existente al conciliar; en un alta significa una persona. Las planillas anteriores con Nombre y Acompañantes permitidos siguen funcionando: el cupo equivalente es acompañantes + 1. Si se completan ambos campos deben coincidir. Se conserva conciliación por contactos/documento, vista previa, errores, límites, transacción e idempotencia. La exportación usa el cupo total.
4. En **Evento → Mesas y cupos** (`/eventos/:eventId/mesas`), crear mesas con nombre o número, editar sus nombres y asignar invitaciones completas. Una mesa con cualquier invitación asignada no puede eliminarse; primero hay que cambiar o quitar sus asignaciones. Los filtros permiten consultar una mesa o invitaciones sin mesa, con búsqueda y páginas de 25.
5. Para asignar por Excel, usar **Descargar plantilla de asignaciones**. Incluye los destinatarios filtrados, sus IDs y su mesa actual, hasta 1.000 por archivo, sin exportar contactos. Conservar el ID y completar Mesa con un nombre existente. **Mesa vacía quita la asignación**. Sin ID se puede conciliar por teléfono, correo o documento únicamente con permiso de contactos. No se concilia por nombre. Una identidad ambigua, duplicada o de otro evento se rechaza. La vista previa no guarda; las filas aceptadas se aplican juntas y una falla inesperada revierte todo el lote. No crea mesas automáticamente.
6. Propietario o Administrador habilita **Mostrar mesas en invitaciones**. Cada enlace personal muestra únicamente el nombre de su mesa; no entrega IDs ni asignaciones ajenas. Si no tiene mesa o está deshabilitada la publicación, no aparece ese apartado. El cupo y la mesa se muestran independientemente de que la sección visual RSVP esté activada.
7. La invitación muestra **Invitación válida para X personas**. Solo ofrece Sí, asistiré / No asistiré. Si el cupo supera uno y responde Sí, permite indicar el total entre 1 y su cupo. No guarda cero en una respuesta afirmativa ni personas en una negativa. Al vencer el plazo ya no permite crear, cambiar o reiterar una respuesta; siguen visibles la invitación, las fotos, la respuesta y la mesa dentro de la ventana de acceso del evento.
8. **Detalles del evento** presenta ocho indicadores: invitaciones generadas, personas autorizadas, invitaciones confirmadas, asistentes confirmados, rechazadas, pendientes, mesas disponibles y asistentes asignados. Mesas disponibles significa mesas sin asignaciones, mostrando también el total creado. La ocupación por mesa separa invitaciones, personas autorizadas y confirmadas. Los cambios RSVP se consultan con Actualizar indicadores / Actualizar mesas y asignaciones; no se añadió Realtime.

### Modelo, migraciones e historial

Se aplicaron dos migraciones nuevas, sin modificar las dieciocho anteriores:

- `20261123030000_attendance_capacity_and_tables.sql`: RSVP binario, archivo histórico privado, plazo obligatorio, cupos totales calculados, `event_tables`, RLS, FK compuesta, permisos, asignación/importación atómica, visibilidad personal y resumen de asistencia.
- `20261123031000_preserve_table_audit_on_event_cleanup.sql`: conserva la auditoría normal de mesas y evita recrearla durante el borrado físico administrativo de su evento. Se detectó y corrigió mediante las pruebas reales de limpieza de fixtures; no cambia el borrado lógico de la interfaz.

No se reconstruye `guests`, sus tokens, importación o seguimiento. `party_size` es una columna **generada** de `companions_allowed + 1`; `attending_count` también se genera: cero salvo una respuesta afirmativa, cuando vale `companions_confirmed + 1`. No hay dos fuentes editables del cupo o del total confirmado. Se mantiene el límite previo de veinte acompañantes, ahora expresado como veintiuna personas en total. Los clientes no pueden escribir esas columnas ni alterar RSVP al editar o importar invitados.

Las respuestas históricas Sí/No conservan sus fechas y cantidades. Antes de convertir los Quizás actuales a pendientes, `private.legacy_maybe_responses` guarda invitado/evento, fecha, versión y acompañantes originales, con RLS y sin acceso de cliente. La conversión incrementa la versión, limpia la respuesta actual y concilia el estado de seguimiento; no borra `invitation_events`. La línea de tiempo identifica Quizás como histórico. El enum conserva su etiqueta para compatibilidad histórica, pero un CHECK impide almacenarla en filas actuales y la RPC la rechaza. Se probó realmente el cambio con un registro creado antes de aplicar la migración.

Las mesas tienen UUID, evento, nombre único sin distinguir mayúsculas y fechas; máximo 500 por evento. Se reutiliza `guests.table_id` como asignación de toda la invitación y una FK `(table_id,event_id)` impide cruces entre eventos incluso fuera de React. Esta relación permite agregar posteriormente asignaciones individuales referenciando mesa/invitación, sin duplicar ahora una tabla de personas ni repartir acompañantes.

Las escrituras bloquean el evento antes de operar sobre sus invitados/mesas, mantienen auditoría con actor de sesión y guardan solo IDs/acciones/cantidades, sin contactos ni tokens. Las importaciones se identifican por UUID y hash de parámetros; repetir el lote devuelve el reporte anterior sin repetir escrituras. Una solicitud con el mismo UUID y otros datos se rechaza. PostgreSQL valida los cupos y el reloj después de esperar bloqueos; los límites públicos de solicitudes y el control de versión RSVP se mantienen. Los clientes antiguos pueden responder Sí/No usando acompañantes; React envía ahora `attending_count`, validado contra el cupo en el servidor.

### Permisos y privacidad

La matriz SQL y su espejo TypeScript incorporan `tables.read`, `tables.write`, `tables.assign` y `tables.publish`:

| Rol | Mesas y asignaciones | Publicación | Indicadores |
| --- | --- | --- | --- |
| owner / manager | Crear, editar, eliminar vacías y asignar/importar. | Sí. | Sí. |
| invitations | Consultar y asignar/importar; no crear o editar mesas. | No. | Sí. |
| content | Crear/editar mesas y asignar/importar por ID, con nombres y cantidades, sin teléfonos/correos/documentos. | No. | No. |
| checkin | Conserva la proyección restringida de nombres y mesa; no gestiona asignaciones. | No. | No. |
| viewer | Sin lista individual ni mesas. | No. | Solo agregados. |
| moderator / ajeno / anónimo | Sin acceso administrativo. | No. | No. |

La tabla nueva no permite DML directo del cliente. Las RPC usan `security definer`, `search_path` vacío y permisos reales; los helpers y el archivo histórico son privados. Un token público recibe solo su propio `table_name`, nunca el listado de invitados ni la ocupación. No se usa ninguna clave privada en React ni se agregan dependencias. Los tipos TypeScript se regeneraron con Supabase Local.

La participación en buenos deseos queda para C y requerirá su propio período: no debe basarse en `can_respond` ni en `rsvp_deadline`. Esta etapa conserva la lectura posterior al plazo y no añade endpoints, tablas o interfaz del muro.

### Archivos y límites de esta etapa

Se ampliaron `features/guests` (formulario, validación, Excel/worker, listado), `features/rsvp` (esquema, formulario binario y datos personales), el renderer/vista previa visual, el formulario y detalle del evento, router y matriz de permisos. `features/info` agrega modelos/API, página y componentes de mesas, importación, resumen y workbook. La línea de tiempo reutiliza `invitation_events` y presenta totales de personas. Las API públicas de workbook/worker mantienen Excel fuera de la ruta del invitado y del hilo principal.

Pruebas nuevas: `src/features/info/attendance.test.ts`, `scripts/seating.integration.test.mjs`, `supabase/tests/seating_rls.sql` y `tests/browser/seating.spec.mjs`. Se adaptaron las pruebas anteriores a los textos, cupos, proyecciones y plazo obligatorios nuevos, conservando las verificaciones de aislamiento, QR, fotografías, seguimiento y seguridad.

Las capturas reales de revisión están en [la galería de Etapa B](artifacts/etapa-b/revision.html), con invitación, RSVP, mesas e indicadores en celular y escritorio. Los datos son temporales y se retiran de Auth, Postgres y Storage al terminar. Los límites existentes de `.xlsx` (2 MB / 1.000 filas, validación y worker) se conservan. La plantilla de asignaciones exige filtrar si hay más de 1.000 destinatarios. No hay plano de salón, capacidad física máxima por mesa, reparto individual de acompañantes ni actualizaciones Realtime. No se implementan muro, recordatorios o cambios del acceso administrativo.

## Verificaciones

```sh
npm run typecheck
npm run lint
npm test
npm run test:auth
npm run test:rls
npm run test:events
npm run test:guests
npm run test:rsvp
npm run test:invitations
npm run test:design
npm run test:information
npm run test:seating
npm run test:e2e
npm run build
```

`test:auth`, `test:events`, `test:guests`, `test:rsvp`, `test:invitations`, `test:design`, `test:information`, `test:seating` y `test:rls` requieren Supabase Local de **jotopa**. Diseño, información, eventos y los recorridos de navegador requieren `npm run functions:serve`; equipos/Auth también usan Mailpit. Las herramientas rechazan otra URL y solo ejecutan SQL administrativo dentro de `supabase_db_jotopa`. Los scripts no necesitan claves secretas: el SDK usa la clave publicable y JWT de usuarios sintéticos. La administración de fixtures usa `docker exec` en ese contenedor específico. La función de imágenes sí usa la credencial automática del servidor para operar Storage, después de autorizar la solicitud.

`typecheck` incluye TypeScript del frontend y las dos Edge Functions mediante Deno 2.9.6 fijado con npm exec. El primer uso descarga esa herramienta y sus tipos; no agrega una dependencia al frontend. Ambas funciones se ejecutaron realmente con el Edge Runtime local de Supabase.

`test:e2e` usa Chrome, el frontend en localhost:5174 y Mailpit local. Si Vite ya está iniciado, lo reutiliza; si no, lo inicia para la prueba. Los correos y cuentas de prueba tienen identificadores aleatorios y se retiran al terminar. Las pruebas SQL corren en una transacción que se revierte. No se habilitan trazas ni grabaciones que puedan guardar tokens de recuperación.

Resultado de las fases anteriores comprobado el **22 de noviembre de 2026** (conservado como historial; la verificación de A se agrega más abajo):

- TypeScript estricto, ESLint y build pasaron.
- 32 pruebas unitarias: configuración, claves, diagnóstico, formularios, contraseñas, fechas/zonas horarias, matriz UI, retornos de navegación, handler de correo, teléfonos, Excel, RSVP/URL y decodificación del QR, plantillas y enlaces wa.me. Las nuevas cubren esquema visual, límites, credenciales en contenido, errores seguros y WebP real generado con Canvas: perfil de color válido, límites, truncamiento, metadatos prohibidos y animación.
- Integración real de Auth: registro, rechazo de contraseña débil por el servidor, organizer predeterminado, metadatos sin escalamiento, acceso correcto/incorrecto, cierre, renovación de sesión y edición de nombre.
- RLS verificada por HTTP y SQL: anonimato bloqueado, otro perfil invisible y no editable, inserción/upsert/borrado denegados, rol/identidad/fechas inmutables para el cliente y administrador sin acceso cruzado a perfiles.
- Chrome: registro real, perfil y edición, sesión tras recargar, cierre y acceso, rutas privadas bloqueadas sin sesión, enlace de recuperación real recibido en Mailpit, recarga del formulario de recuperación, cambio de contraseña, contraseña anterior rechazada y nueva aceptada.
- 10 escenarios de integración de eventos: creación atómica, validación sin filas huérfanas, coincidencia de las siete matrices, aislamiento entre eventos, límites de gestión, tokens hasheados, aceptación concurrente única, caducidad/revocación/reemplazo, pérdida de permisos del emisor, correo real en Mailpit, límite concurrente entre eventos, auditoría y protección del último owner. El agrupamiento de estos casos se muestra en el reporte TAP.
- Seis scripts SQL transaccionales de perfiles, eventos, invitados, RSVP, invitaciones y diseño: siete roles, acceso cruzado, datos restringidos, último owner, aceptación por correo correcto, caducidad/reutilización y auditoría atribuida/inmutable. En invitados, una falla inesperada inyectada revierte filas y auditoría; la vista previa no escribe. Diseño agrega aislamiento de borradores/fotos, bucket privado, publicación restringida y bloqueo de DML directo/finalización de imágenes por el cliente.
- Nueve escenarios de integración real de invitados (10 entradas TAP contando el contenedor): teléfonos SQL, CRUD, siete roles y anónimo, aislamiento, campos reservados, duplicados por los tres identificadores, conciliación ambigua, preservación de celdas vacías/cero/No, idempotencia concurrente, filtros/paginación/exportación y auditoría sin datos personales. Una vista previa de 1.000 filas válidas se ejecutó por la API local y no persistió registros.
- Dieciséis pruebas de navegador. Se conservan los diez recorridos de Auth, equipos, invitados/Excel, QR/RSVP y envío manual a **360 px y 1440 px**. Pasaron registro, recuperación real en Mailpit, sesiones, permisos, altas/ediciones/bajas, carga/descarga de Excel, respuestas, cuotas, enlaces y línea de tiempo. Se agregaron seis recorridos de diseño: cada plantilla a ambos anchos, con fotos reales subidas a Storage, textos, horarios, secciones, vista previa, publicación, persistencia y RSVP. Sin desbordamiento horizontal ni excepciones JavaScript inesperadas; se inspeccionaron capturas reales.
- Once escenarios de integración RSVP (12 entradas TAP contando el contenedor): unicidad/256 bits, permisos de los siete roles, proyección pública mínima sin cuenta, token inválido/manipulado, aislamiento entre invitados/eventos, estados/ventanas, cambios de respuesta e idempotencia, validación de acompañantes, UTC, plazo, baja de recordatorios, concurrencia de respuestas, límites concurrentes incluso ante errores, recuperación de cuota, invalidación del enlace anterior y auditoría sin tokens. Un plazo que vence mientras la solicitud espera un bloqueo también impide responder. Las ediciones generales conservan la ventana de acceso.
- Los dos recorridos de invitados se repitieron contra el **build compilado**, servido únicamente en localhost:5176 para esa prueba y detenido al terminar. El desarrollo de Jotopa continúa en localhost:5174. El worker de Excel funciona también en ese build.
- Los dos recorridos de invitación personal/RSVP también pasaron contra el **build compilado** en un preview local temporal en localhost:5176. La prueba conserva la URL configurada en el QR y abre su ruta equivalente en el preview para verificar allí la página compilada, sin cambiar `.env.local`. Se comprobó generación/lectura del PNG y el flujo completo a ambos anchos. El preview se detuvo al terminar.

- Diez escenarios de integración de la Fase 3A (11 entradas TAP con el contenedor): roles y RLS, aislamiento, validación de plantillas, consentimiento/baja, teléfono ausente, envío/deshacer/idempotencia, conflictos de reintentos, copia frente a envío, saltos/fallos y cola compartida, aperturas concurrentes/deduplicadas, RSVP e historial, concurrencia de anfitriones, cambio tardío de baja, cuotas, paginación y ausencia de tokens/contactos/mensajes renderizados en auditoría e historial.
- Dos recorridos de envío en Chrome, a 360 y 1440 px, incluidos en las diez pruebas: edición de plantilla, texto real en portapapeles, exclusión de baja/sin consentimiento, popup bloqueado sin marca de envío y pestaña cerrada antes de navegar con corrección de la marca, URL wa.me y texto codificado, enviar/deshacer, apertura pública real y recarga deduplicada, RSVP y línea de tiempo, saltar/retomar/fallar y copiar enlace sin teléfono. Contenido no puede abrir las rutas. WhatsApp se intercepta localmente: **no se contactó el servicio ni se envió un mensaje real**. Se inspeccionaron capturas de cola, plantillas e historial. Los mismos dos recorridos también pasaron contra el build compilado en un preview temporal en localhost:5176, detenido al finalizar.

- Ocho escenarios nuevos de integración de diseño (nueve entradas TAP con el contenedor): los siete roles y un ajeno, RLS y Storage privado, subida real por Edge, archivos inválidos, campos Unicode/emoji y fechas, referencias cruzadas a imágenes, separación borrador/publicación, URLs firmadas y caducidad, RSVP/cupos/aperturas/historial, exclusión del contenido desactivado, concurrencia, baja de imágenes en uso y cuotas.
- Los seis recorridos visuales también se ejecutaron sobre el **build compilado** en preview temporal local en localhost:5176, sin cambiar el puerto habitual 5174 ni `.env.local`. Comprueban variante pequeña en móvil, prioridad de portada y que la galería no se descarga en la primera pantalla; los tamaños reales se registran sin URLs/tokens en `artifacts/invitaciones/performance-*.json`. No se realizó un benchmark Lighthouse, una medición en red móvil real ni una prueba de cámara/teléfono físico.

Las pruebas retiran cuentas, eventos, correos y archivos de Storage sintéticos; las SQL hacen rollback. Los archivos Excel se probaron mediante lectura/escritura y Chrome, **no en Microsoft Excel o LibreOffice**. El QR se leyó con un decodificador independiente, no con cámara física. No se probó un envío real de WhatsApp, correo externo ni un despliegue remoto. Los límites de referencias visuales se detallan arriba.

`/configuracion` conserva el diagnóstico manual de solo lectura de REST y `storage.listBuckets()`. La raíz REST es pública localmente; no se usa sola para validar la clave. El SDK comprueba además Storage. Esto no valida permisos de futuros eventos ni subidas de archivos.

### Resultado de la Etapa A — 23 de noviembre de 2026

| Comprobación ejecutada | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto: frontend estricto y las dos Edge Functions. |
| `npm run lint` | Correcto, sin advertencias. |
| `npm run build` | Correcto; no se desplegó. |
| `npm test` | 36 pruebas correctas, incluidas cuatro nuevas de información. |
| `npm run test:rls` | Siete scripts SQL correctos, con rollback de fixtures. |
| Integración Auth, eventos, invitados, RSVP, invitaciones, diseño e información | 62 escenarios correctos por la API local; 69 entradas TAP incluyendo sus siete contenedores. |
| `npm run test:e2e` | 22 recorridos correctos en Chrome, incluidos seis nuevos de A: tres plantillas por dos anchos. |
| Recorridos de A contra el build compilado | Los seis correctos en preview local temporal 5176, detenido al terminar. Jotopa conserva 5174. |

Los siete escenarios nuevos de `test:information` verifican compatibilidad v1/v2 y separación borrador/publicación; validación SQL independiente de enlaces, datos bancarios, teléfonos y límites; permisos de los siete roles y un usuario ajeno; exclusión de datos ocultos y fotos de otros eventos; publicación bancaria expresa; orden/visibilidad y protección de imágenes en uso; token, ventana, RSVP, aperturas y auditoría. Se subieron fotografías reales por la Edge Function y se leyeron archivos privados mediante URLs firmadas.

En navegador se crearon y eliminaron momentos, regalos y hospedajes; se reordenaron elementos; se editaron textos y fotos; se guardó y recargó desde Supabase; se probó la vista previa sin token; se publicaron cambios y se abrió el enlace personal; se comprobó el ocultamiento bancario antes de habilitarlo y el portapapeles real después; se respondió Voy con un acompañante y se conservó la respuesta tras volver a publicar. Ningún recorrido presentó desbordamiento horizontal ni excepciones JavaScript; las capturas fueron inspeccionadas.

Las seis mediciones `artifacts/etapa-a/performance-*.json` registran tamaños de archivo y variantes, sin URLs ni tokens. En móvil se eligió `small.webp` para las cinco posiciones de imagen, con un máximo de **93.704 bytes por archivo** de estos fixtures; en escritorio, **344.778 bytes**. Se verificaron prioridad alta/carga inmediata de portada, carga diferida del resto y decodificación real. Varias posiciones reutilizan la misma foto: estos datos no deben sumarse como tráfico único de una visita. No son un benchmark de velocidad, Lighthouse ni una medición en red móvil real.

Se comprobó al terminar: cero cuentas/eventos/diseños/archivos de prueba de A, migración nueva aplicada, hashes idénticos de `AGENTS.md`, `package-lock.json` y las diecisiete migraciones anteriores, y los tres contenedores de SIGA con la misma fecha de inicio y cero reinicios. No se instalaron dependencias nuevas ni se modificaron sus servicios.

Pendientes de comprobación externa: teléfono físico, navegación real en las apps Maps/Waze, llamadas, reservas y transferencias. Los enlaces se verificaron por sus destinos/codificación, sin contactar hoteles ni entidades. Se recomienda revisar las fotos propias y los encuadres en un celular antes de B; esta etapa no incorpora recorte libre ni ajustes de foco por cada fotografía.

### Resultado de la Etapa B — 23 de noviembre de 2026

| Comprobación ejecutada | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto: TypeScript estricto y ambas Edge Functions. |
| `npm run lint` | Correcto, sin advertencias. |
| `npm run build` | Correcto; no se desplegó. |
| `npm test` | 40 pruebas correctas; cuatro nuevas de cupos, RSVP binario y Excel actual/anterior/asignaciones. |
| `npm run test:rls` | Ocho scripts SQL correctos, incluidos los siete roles de evento y las políticas nuevas. |
| Integración real de Auth, eventos, invitados, RSVP, invitaciones, diseño, información y mesas | 70 escenarios correctos; 78 entradas TAP contando los ocho contenedores. |
| `npm run test:e2e` | 24 recorridos correctos en Chrome, a 360 y 1440 px. |
| Los dos recorridos nuevos de B contra el build compilado | Correctos en preview temporal local 5176, detenido al terminar; Jotopa permanece en 5174. |

Antes de aplicar la migración se creó una respuesta Quizás con fecha real de prueba, versión 3 y cupo de cinco. Después se comprobó su archivo íntegro, el paso a pendiente con versión 4, cero confirmados, fecha actual limpia, historial original conservado y seguimiento conciliado. El evento sin plazo recibió su inicio como límite. Luego se retiró ese fixture.

Los ocho escenarios nuevos de integración verifican nombres independientes y cupos 1/2/5/21; rechazo de cero, 22, negativos y fracciones; confirmaciones individuales, de parejas, familiares, máximas y parciales; negativa con cero y cambios dentro del plazo; reintentos/versiones/concurrencia; baja de cupo inferior a lo ya confirmado; plazo vencido sin perder lectura; creación/edición/baja de mesas y protección de mesas asignadas; siete roles y un ajeno; FK entre eventos; proyección pública de la mesa propia; publicación expresa; importación por ID y contactos autorizados, vista previa sin escrituras, duplicados, reintentos y rollback completo ante una falla inyectada; indicadores separados de personas/invitaciones y auditoría sin tokens/contactos. Agregar una segunda fila de canal WhatsApp no duplica las invitaciones del resumen.

En navegador se probó alta manual con nombre familiar y cupo cinco; importación real de Excel con cupo total y conciliación; creación, renombrado y eliminación de mesas vacías; asignaciones manuales y su cambio por Excel descargado; vista previa que no escribe; rechazo de fila ajena; publicación de mesas; invitaciones sin cuenta; ocultamiento de nombres/mesas ajenas; selección parcial y respuesta negativa; RSVP vencido aplicado también por API; indicadores con cuatro invitaciones, doce autorizados y cuatro asistentes; Contenido sin contactos ni botón de publicación, y ajeno sin acceso. Las tres plantillas, fotografías privadas, QR, recuperación, importación anterior, aperturas y envíos manuales conservaron sus regresiones. No hubo desbordamientos horizontales ni excepciones JavaScript inesperadas.

Se inspeccionaron las capturas reales a ambos anchos. Las pruebas se ejecutaron con Chrome y ExcelJS, no con teléfono físico, cámara ni Microsoft Excel/LibreOffice. No se enviaron mensajes reales de WhatsApp ni hubo despliegue. Los límites de rendimiento de imágenes documentados en A siguen aplicando; B no incorpora un nuevo benchmark Lighthouse.

Comprobación final: las dos migraciones nuevas están aplicadas; cero cuentas/eventos/archivos de prueba de B; ninguna respuesta actual Quizás ni evento sin plazo; hashes idénticos de `AGENTS.md`, `package-lock.json` y las dieciocho migraciones anteriores. Los tres contenedores de SIGA mantienen sus fechas de inicio y cero reinicios. La etapa queda lista para revisión antes de C, sin comenzar buenos deseos.

## Etapa C — Buenos deseos multimedia

### Uso y experiencia

En `/i/:token` aparece **Dejá tus buenos deseos**, antes del cierre de la invitación, o al final si esa sección está desactivada. Se integra con Entre nosotros, Que sea inolvidable y Lo esencial, con sus paletas y composiciones. También funciona en la invitación básica sin diseño publicado. El visitante no necesita cuenta ni una confirmación RSVP: puede participar sin responder, después de responder No y después de vencer el plazo RSVP, mientras estén abiertas la invitación y la participación.

Puede escribir hasta 2.000 caracteres, adjuntar hasta tres fotografías y una nota de voz, o combinar los contenidos. Hay selección de archivos, opción de cámara en móvil, vistas previas y eliminación antes del envío. La grabadora solicita permiso al tocar Grabar, permite detener, escuchar, eliminar y volver a grabar. Si el navegador o el permiso impiden grabar, sigue disponible adjuntar audio. El servidor mantiene el contenido **pendiente** hasta su revisión; se muestra el agradecimiento solicitado y no se agrega inmediatamente a la conversación.

La identidad del titular se toma exclusivamente de la invitación en SQL y se conserva como instantánea. En cupos de más de una persona se permite un nombre opcional del acompañante, presentado como **Nombre declarado · invitación de …**. Nunca sustituye al titular ni permite seleccionar otra invitación. Como en el resto del sistema, poseer el enlace identifica la invitación, no verifica la identidad física de quien usa el dispositivo. Los moderadores ven además el UUID de la invitación, sin recibir teléfonos, documentos o correos.

La conversación muestra solo los mensajes aprobados del mismo evento, con autor, texto literal, fotos, controles de audio y fecha/hora en la zona del evento. La entrega inicial de C paginaba de 25 en 25 con **Ver más mensajes**. D reemplaza ese botón por sincronización automática del historial completo y cambios Realtime; conserva **Actualizar conversación** como alternativa manual. La proyección de D desplaza la conversación completa y no selecciona mensajes aislados.

### Administración y período independiente

Desde **Detalles del evento → Buenos deseos**, ruta `/eventos/:eventId/buenos-deseos`, Propietario, Administrador y Moderación pueden revisar textos, fotos y audios, aprobar, rechazar, ocultar y eliminar. Los filtros incluyen Pendientes, Aprobados, Rechazados, Ocultos, En preparación y Eliminados, con paginación. Los otros cuatro roles y usuarios ajenos no acceden a esas publicaciones privadas. La seguridad se aplica en PostgreSQL y Storage, además de ocultar controles.

Solo Propietario y Administrador configuran **Período de participación y límites**: habilitación/suspensión, apertura, cierre y máximo de audio entre 15 y 120 segundos, inicialmente 60. Fechas vacías heredan la ventana de acceso del evento; la ventana efectiva siempre está contenida en `session_opens_at`/`session_closes_at`. El plazo RSVP no interviene. Suspender o cerrar las dedicatorias bloquea nuevas publicaciones y su finalización, pero mantiene la conversación aprobada mientras la invitación siga accesible. El servidor vuelve a comprobar el límite de audio al finalizar, incluso si se cambió después de subirlo.

### Archivos, límites y seguridad

- Las fotos reutilizan la optimización existente: JPG/PNG/WebP de hasta 10 MB y 24 MP, mínimo 200 × 200 px, convertidos en variantes WebP de hasta 1920 y 720 px y 1 MB cada una. Se descartan los metadatos del original. Edge inspecciona contenedor, dimensiones y límites de las variantes; rechaza animación y metadatos EXIF/XMP. La conversación carga las fotos de forma diferida y reserva su espacio.
- Los audios grabados y los archivos compatibles de hasta 10 MB se decodifican en el navegador y normalizan a **WAV PCM16 mono a 16 kHz**, sin metadatos. Edge comprueba la cabecera completa, longitud exacta y duración derivada de las muestras: hasta 3.840.044 bytes y 120 segundos como máximo absoluto, además del límite del evento. No confía en duración, extensión o MIME declarados por el cliente. No guarda WebM/MP3/M4A originales; su lectura depende de los códecs del navegador. Referencias: [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder), [decodeAudioData](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData) y [permiso/contexto seguro de getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
- Buckets privados **wall-media** y **wall-audio**, sin subidas públicas ni enlaces permanentes. La Edge Function `wall-media` valida el token y su publicación antes de inspeccionar/subir, o verifica un JWT real y `wall.moderate` para eliminar. La clave privilegiada es la que inyecta Supabase exclusivamente en el runtime servidor; no se añade ninguna variable `VITE_` ni credencial al repositorio.
- Los invitados reciben URLs firmadas solo de archivos aprobados de su evento, por hasta **60 segundos**, acotadas también por el cierre de la invitación y con comprobación de la expiración real emitida por Storage. Los moderadores autorizados pueden firmar archivos pendientes para revisarlos. Otros roles, otros eventos y visitantes anónimos no pueden leer/subir directamente. Rechazar u ocultar revoca firmas futuras; una URL ya emitida puede seguir vigente hasta 60 segundos. Una descarga ya realizada no puede retirarse del dispositivo.
- Se reutilizan las cuotas globales y de lectura existentes. Se agregan dos contadores privados por invitación: **8 acciones de escritura por minuto** y **12 comprobaciones/reservas de carga por minuto**. Cada carga válida consume comprobación y reserva; los bytes malformados también consumen comprobación. Se admiten **3 intentos de publicación por 10 minutos y 20 por 24 horas**, contando borradores y eliminados. Presupuesto de reservas no eliminadas: **200 MB por evento**. El cuerpo HTTP se lee con un máximo de 3.850.000 bytes. Estos límites no sustituyen protección de red ante DDoS.
- Un UUID por intento y un hash del contenido impiden duplicar envíos al reintentar o cambiar el contenido de una solicitud ya iniciada. Las reservas vinculan slot, publicación y huella de bytes; los reintentos concurrentes no crean archivos lógicos nuevos. Solo el servidor puede certificar que una carga está lista. Finalizar comprueba que todos los medios esperados estén listos y deja la publicación pendiente de aprobación.
- La auditoría registra `wall.submitted`, `wall.moderated`, `wall.deleted`, `wall.draft_cancelled` y `wall.settings_updated`, con actor, UUID, estados o cantidades; sin texto, contactos, nombres declarados, tokens ni archivos. No se fabrican aperturas de invitación al leer/subir buenos deseos: la validación reutiliza `guest_invitation` sin identificador de visita.

### Eliminación y límites operativos

Eliminar retira el texto y la identidad visible, invalida futuros manifiestos y solicita la eliminación física de los archivos. Se conserva una referencia mínima a la invitación y auditoría. **Storage y Postgres no comparten una transacción**: una interrupción o carga que ya estaba en vuelo puede dejar archivos privados pendientes de limpieza. La moderación permite eliminar borradores abandonados y **reintentar la limpieza** desde Eliminados. Una falla de carga conserva la reserva privada para reintentar; no borra los bytes de otro reintento concurrente que haya finalizado bien. No se incorporó un cron ni una política automática de retención.

Rechazar u ocultar conserva los archivos privados para revisión; la eliminación expresa los retira. Eliminar un invitado invalida su token y desvincula el UUID de sus publicaciones; los recuerdos y su autor histórico siguen en moderación/los aprobados hasta su eliminación expresa. La baja lógica del evento bloquea el acceso público, sin purgar el historial ni sus archivos. Antes de un entorno comercial corresponde acordar la conservación y limpieza de esos recuerdos. Los límites y los buckets no activan facturación.

### Archivos y migraciones de C

Migraciones nuevas, aplicadas en orden localmente; las veinte anteriores se conservan:

1. `20261123040000_multimedia_good_wishes.sql`: `event_wall_settings`, `wall_posts`, `wall_post_media`, índices, RLS, buckets privados y RPC de participación/moderación/limpieza.
2. `20261123041000_guard_wall_upload_attempts.sql`: comprobación y cuota antes de inspeccionar los bytes de una carga.
3. `20261123042000_fix_wall_manifest_containment.sql`: agrupación explícita de operadores JSON en el manifiesto aprobado.
4. `20261123043000_harden_wall_submission_and_cleanup.sql`: revalidación del máximo de audio al enviar y limpieza repetible de cargas en vuelo.
5. `20261123044000_validate_wall_reservations_and_cancellation.sql`: rechazo con cuota persistente de reservas demasiado pequeñas y auditoría idempotente de cancelación del borrador propio.

No se editaron migraciones ya aplicadas para corregir comportamientos. `src/lib/database.types.ts` se regeneró con Supabase CLI desde la base local.

Código nuevo en `src/features/wall/`: `models.ts`, `api.ts`, `audio.ts`, `wav.ts`, `wall.css`, `guest/index.ts`, `pages/WallPage.tsx` y los componentes **GuestWall, GuestWallComposer, VoiceRecorder, AudioPreview, GuestConversationPage, WallPostBubble, WallAudioPlayer, ModerationWorkspace, ModerationCard y WallSettingsForm**. `invitation-design/media/index.ts` expone la optimización existente, sin duplicarla. Se agrega `supabase/functions/wall-media/index.ts`, su entrada en `config.toml` y su chequeo Deno.

`public/fonts/invitation-fonts.css` centraliza las dos fuentes locales existentes y se enlaza desde `index.html` con `referrerpolicy=no-referrer`. Se retiran sus declaraciones de los estilos insertados por Vite: Chrome enviaba el Referer de la invitación al cargar fuentes desde ese CSS de desarrollo. La hoja externa recibe `Referrer-Policy: no-referrer` en local/preview y se prepara el mismo encabezado para `/fonts/*` en `vercel.json`, sin desplegar. Las pruebas de RSVP y de C comprueban que ninguna solicitud lleve `/i/` en Referer.

Se integran la ruta privada y el botón del evento; `InvitationContent`, `PublishedInvitation` e `InvitationPresentation` reciben el espacio visual de buenos deseos, independiente del RSVP. La ruta de invitación carga este módulo por separado; moderación y grabadora no incorporan Excel ni dependencias de pago. Se conserva el retorno seguro tras iniciar sesión para la nueva ruta.

Pruebas nuevas: `wall.test.ts`, `supabase/tests/wall_rls.sql`, `scripts/wall-test-helpers.mjs`, `scripts/wall.integration.test.mjs` y `tests/browser/wall.spec.mjs`. Se incorporan en los comandos existentes y en `npm run test:wall`. No se necesitan variables de entorno adicionales. `npm run functions:serve` sirve las tres Edge Functions locales.

### Verificación de C — 23 de noviembre de 2026

| Comprobación ejecutada | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto: TypeScript estricto y las tres Edge Functions con Deno. |
| `npm run lint` | Correcto, sin advertencias. |
| `npm run build` | Correcto; no se desplegó. |
| `npm test` | 46 pruebas correctas, incluidas seis nuevas de WAV, límites, contenido e identidades. |
| `npm run test:rls` | Nueve scripts SQL correctos; fixtures revertidos, siete roles e invitado anónimo. |
| Integración real: Auth, eventos, invitados, RSVP, invitaciones, diseño, información, mesas y buenos deseos | 82 escenarios correctos; 91 entradas TAP contando los nueve contenedores. C aporta 12 escenarios. |
| `npm run test:e2e` | Corrida estable de 30 recorridos correctos en Chrome a 360 y 1440 px, incluidas las regresiones previas. |
| Seis recorridos de C contra el build compilado | Verificados en preview local temporal 5176. El caso extendido de audio se repitió después de corregir el final de reproducción y pasó. El preview se detiene al terminar; Jotopa sigue en 5174. |

La integración comprueba texto, fotos y voz combinados, cargas concurrentes/repetidas sin duplicados, medios pendientes privados, permisos de los siete roles y usuarios ajenos, validación del titular y nombre declarado, participación pendiente/negativa y tras el plazo RSVP, suspensión/apertura/cierre independientes, token inválido/manipulado/rotado, límites de formato/tamaño/duración/frecuencia, cambio del máximo después de subir audio, borradores no aprobables, cancelación propia, historial paginado, aislamiento entre eventos, firma solo de aprobados, rechazo/ocultamiento, purga real de archivos y auditoría inmutable sin tokens/contactos. Las lecturas de buenos deseos no aumentan aperturas.

En navegador se probaron envío sin responder, envío después de responder No y vencer RSVP, fotografía inválida, exceso de fotos, optimización/vista previa/eliminación, archivo de audio como alternativa, denegación simulada del micrófono, grabación real con MediaRecorder y micrófono virtual, reproducción y nueva grabación, publicación combinada, revisión privada de texto/foto/audio, aprobación/rechazo/ocultamiento, filtro y permisos de moderación/configuración, invitación individual/grupal, conversación aprobada y ausencia de desbordamiento horizontal. También se reprodujo un WAV de 60 segundos en Chrome: la renovación de firmas a los 45 segundos no lo interrumpe; se comprobó el evento de finalización y su reproducción desde cero. No hubo tokens en consola ni rutas `/i/` en Referer, incluidas las fuentes.

La galería de [capturas reales en celular y escritorio](artifacts/etapa-c/revision.html) contiene las tres plantillas y la moderación a ambos anchos. [Comparación de conversaciones](artifacts/etapa-c/comparacion-conversaciones.png) reúne detalles de las capturas móviles, presentados a escala. Los datos son fixtures temporales retirados al finalizar, no contenido predeterminado. Las fotografías mantienen la procedencia y licencia documentadas en Invitación digital visual.

La grabación automatizada usa **MediaRecorder real en Chrome con micrófono virtual**; la denegación del permiso se simula expresamente. No equivale a probar un micrófono/cámara física, Android o Safari/iOS. La cámara ofrece el atributo `capture` cuando el dispositivo lo permite, con selección de archivos como alternativa. No se realizaron pruebas de carga masiva, un nuevo benchmark Lighthouse ni despliegues. No se contactó a invitados ni se enviaron mensajes de WhatsApp reales.

Comprobación final: cero cuentas/eventos/publicaciones/configuraciones/archivos de prueba de C; hashes idénticos de `AGENTS.md`, `package-lock.json` y las veinte migraciones anteriores. Las cinco migraciones de C están aplicadas solo a Supabase Local. Los tres contenedores de SIGA mantienen sus fechas de inicio y cero reinicios. El preview 5176 está detenido y Jotopa permanece en 5174.

El modelo mantiene todos los mensajes aprobados, orden cronológico e índices de paginación; `WallPostBubble` y los medios privados se pueden reutilizar para D. **En el cierre histórico de C**, Realtime y proyección estaban pendientes. La sección siguiente documenta su implementación en D; reemplaza la carga manual de más mensajes por sincronización incremental del historial completo.

### Cierre de privacidad de la Etapa C — 24 de noviembre de 2026

La incidencia a verificar era la inclusión de `/i/:token` en el encabezado HTTP `Referer` al cargar fuentes declaradas en estilos insertados por Vite. La solución ya estaba implementada en este repositorio: Cormorant Garamond y Manrope locales, declaraciones `@font-face` en `public/fonts/invitation-fonts.css`, enlace con `referrerpolicy="no-referrer"`, meta referrer anterior a los scripts y encabezados `Referrer-Policy: no-referrer` en desarrollo/preview. `vercel.json` conserva la política prevista para `/i/*` y `/fonts/*`; no se desplegó ni se verificó hosting remoto.

No se cambió la presentación, las fuentes, la lógica de negocio ni el esquema. Se agregó `tests/browser/privacy.spec.mjs` para impedir una regresión. Las seis combinaciones de tres plantillas y dos anchos verifican encabezados HTTP y carga/decodificación reales de ambas fuentes y de la portada privada. Se inspeccionan con `request.allHeaders()` las solicitudes de Chrome: fuentes, CSS, scripts, imágenes y API. La visita normal no carga proveedores externos. No hay Google Fonts, CSS remoto, scripts de terceros ni imágenes externas automáticas; las fotos proceden de Storage privado y los vínculos externos existentes mantienen `noreferrer`/`no-referrer`.

Un segundo servidor HTTP en otro origen loopback recibe solicitudes reales de imagen, script, hoja CSS, fuente CSS, `fetch` y navegación, sin interceptarlas ni contactar proveedores externos. Comprueba que no llega el token por URL, encabezados ni cuerpo y que las solicitudes desde el documento no llevan Referer. Un control negativo con una ruta **sintética sin credenciales** confirma que el detector sí observa un Referer cuando está permitido. No se registra ningún encabezado completo, token, URL personal ni cuerpo de solicitud en los informes: solo cantidades, resultados booleanos y rutas genéricas del colector.

| Verificación ejecutada en esta revisión | Resultado |
| --- | --- |
| Typecheck, lint y build | Correctos; TypeScript estricto y las tres Edge Functions. |
| Pruebas unitarias | 52 correctas del estado actual del repositorio. |
| `npm run test:rls` | Diez scripts SQL correctos, sin desactivar RLS ni modificar migraciones. Incluye las políticas preexistentes del repositorio. |
| Nueve suites de integración real de C y antecedentes | 82 escenarios correctos; 91 entradas TAP contando sus contenedores. |
| Chrome en 5174, limitado a C y antecedentes | 36 recorridos correctos: los 30 anteriores más las seis pruebas nuevas de privacidad. No se ejecutan los recorridos de proyección. |
| Build compilado en preview temporal 5176 | Doce recorridos correctos: seis de privacidad y los seis multimedia de C. Preview detenido al finalizar. |

Las integraciones y regresiones de C vuelven a comprobar publicación pendiente/aprobación/rechazo/ocultamiento, aislamiento entre eventos, siete roles, acceso anónimo denegado a buckets privados, firma solo de medios autorizados y caducidad. Se conservan la grabación MediaRecorder con micrófono virtual, la reproducción real, la renovación de URLs y el audio de 60 segundos, además de RSVP, cupos, mesas, Excel, fotos de las tres plantillas y seguimiento. No se añadieron nuevas funciones de D.

La primera corrida completa terminó con 35/36 recorridos: el error restante ocurrió durante la limpieza de un fixture, después de las comprobaciones de privacidad. El intento de quitar su cuenta enmascaraba el retiro incompleto de su evento con `last_owner`. Se corrigieron los auxiliares de prueba, sin tocar esa protección: `scripts/design-test-helpers.mjs` comprueba errores al leer assets y reintenta de forma acotada solo fallos de transporte/servidor en la eliminación repetible de archivos. La prueba nueva no elimina el owner si su evento sigue presente. Se retiró únicamente el fixture sintético afectado mediante operaciones autorizadas y se repitió la corrida completa. No se usaron claves privadas ni se cambiaron roles de plataforma.

Los doce informes `artifacts/etapa-c/privacidad-{desarrollo|compilado}-{plantilla}-{ancho}.json` contienen evidencia de red sin credenciales. Las [capturas finales de C y moderación](artifacts/etapa-c/revision.html) se actualizaron con las pruebas reales. La [comparación final de las tres conversaciones](artifacts/etapa-c/revision-final-2026-11-24.png) es una captura de esa galería con las imágenes reales. Sus eventos, cuentas y archivos son fixtures temporales retirados al finalizar; no se agrega contenido ficticio permanente.

**Resultado:** Etapa C verificada en Supabase Local y Chrome a 360 y 1440 px, incluida la corrección de privacidad pendiente. Pendientes externos: Android/Safari/iOS y cámara/micrófono físicos. Los registros de hosting, proxy y observabilidad no se probaron al no existir despliegue: la propia URL personal contiene la credencial y deberá redactarse en esa infraestructura antes de publicar. Una URL firmada ya emitida puede seguir vigente hasta 60 segundos y los bytes descargados no pueden retirarse del dispositivo.

Comprobación final: cero cuentas/eventos, publicaciones y archivos de fixtures; buckets privados y RLS activos. Se verificaron 40 hashes sin cambios, incluidos `AGENTS.md`, las 30 migraciones, tipos generados, configuración de Supabase, lockfile, fuentes y configuración de privacidad. SIGA conserva las fechas de inicio de sus tres contenedores y cero reinicios. El preview 5176 está detenido y Jotopa permanece en 5174. Esta revisión se detiene en el cierre de C, sin comenzar otras etapas ni desplegar.

## Etapa D — Conversación en vivo y proyección

La invitación y la moderación conservan el modelo multimedia de C. Ahora reciben actualizaciones de Supabase Realtime: un mensaje pendiente llega al moderador; solo después de aprobarse aparece en las invitaciones y en la pantalla externa. Ocultar o rechazar retira el mensaje del muro y detiene su audio. No se agregaron recordatorios, registro privado, nuevas identidades de invitados ni servicios pagos.

### Uso de la pantalla

1. Entrar al evento y abrir **Buenos deseos** con rol owner, manager o moderator.
2. Desplegar **Pantalla de buenos deseos**, elegir vigencia de 1, 4 o 12 horas y preparar un enlace. La ventana del evento puede acortar esa vigencia.
3. Abrir la pantalla o copiar el enlace al navegador del televisor/proyector. La ruta es `/e/:slug/pantalla#access=…&qr=1`: no requiere una sesión administrativa ni permite publicar, moderar o consultar invitados.
4. Elegir apariencia, tipografía y tamaño de lectura; usar pantalla completa o modo presentación. La tecla M muestra los controles. El recorrido conserva todo el historial: al final espera ocho segundos, vuelve gradualmente y espera cuatro segundos al comienzo. La interacción manual lo pausa; el operador decide cuándo reanudar. Con movimiento reducido, empieza pausado.
5. **Activar audio** reproduce una nota del mensaje visible mediante interacción explícita. También se pueden usar sus controles nativos. Escuchar una nota pausa el recorrido; una segunda voz detiene la anterior. El navegador puede requerir otra interacción: no se garantiza reproducción automática.
6. **Revocar acceso a la pantalla** invalida el enlace. Preparar otro también reemplaza el anterior. El acceso queda revocado permanentemente si quien lo emitió pierde permiso de moderación, incluso si recupera después su rol.

El QR es opcional y abre `/e/:slug/participar`. Esa entrada pide el enlace personal recibido por WhatsApp: no lista destinatarios ni permite elegir o suplantar un nombre. El QR no contiene el acceso de proyección ni el token de una invitación. Un acceso compartido de escritura para personas sin enlace personal **no se implementó**, porque necesita una decisión de identidad y seguridad diferente.

### Seguridad y sincronización

- El enlace de proyección usa 256 bits aleatorios; PostgreSQL conserva únicamente su hash. El fragmento no se envía en solicitudes de navegación HTTP. Se utiliza en cuerpos POST, sin logs de aplicación, texto visible, claves de caché ni almacenamiento persistente. El navegador puede conservar el enlace en su historial/portapapeles: debe tratarse como un acceso temporal de solo lectura y revocarse al terminar.
- La emisión exige permisos reales, evento activo y ventana válida; máximo 12 horas y 20 emisiones por usuario/hora. Revocaciones y emisiones quedan auditadas sin credenciales. La pantalla revalida vigencia, evento y permisos del emisor en cada operación.
- Los canales Realtime privados transportan únicamente invalidaciones vacías (Supabase incorpora un identificador del aviso). No contienen publicaciones, contactos, tokens personales ni credenciales de proyección. El tema usa una clave aleatoria del evento. Hay canales separados para moderación; no se permite publicar desde el cliente. La política limita cada fila al tema autorizado.
- Cada lectura RPC vuelve a validar su acceso. Una revisión creciente por evento evita perder cambios concurrentes y permite retirar mensajes ocultos. El historial se sincroniza en lotes de 50, sin límite artificial de mensajes; lotes grandes continúan automáticamente y esperan si se alcanza la cuota. Los avisos se agrupan a intervalos mínimos de cinco segundos, con recuperación al reconectar y comprobación cada 30 segundos como respaldo.
- Se mantienen las cuotas de invitados. La proyección agrega 30 lecturas por minuto/evento y el límite global existente. Los mensajes pendientes y los datos de contacto nunca forman parte de la proyección ni de la respuesta pública.
- Fotografías y audio siguen en buckets privados. Solo los medios aprobados del evento pueden firmarse, por un máximo de 60 segundos y acotados por el vencimiento del acceso. Se firman cerca del área visible y se renuevan durante su uso, incluido un audio que sigue reproduciéndose fuera de pantalla; conservar todo el historial no implica descargar todos sus archivos al abrir.
- Una firma emitida anteriormente puede seguir funcionando hasta vencer; ningún sistema puede retirar bytes que ya se descargaron. Sin red, una pantalla puede conservar temporalmente mensajes aprobados ya cargados hasta revalidar; al conocer la revocación o llegar a su expiración se oculta la conversación. Realtime no sustituye las comprobaciones del servidor.

No se cambian RSVP Sí/No, cupos, mesas, fotografías de la invitación, importaciones ni seguimiento. Sincronizar el muro no cuenta nuevas aperturas de invitación. No se agregaron dependencias ni variables de entorno. Se mantiene Jotopa en 5174.

### Archivos y migraciones de D

Cinco migraciones nuevas, aplicadas solo a Supabase Local; las 25 anteriores permanecen intactas:

1. `20261123050000_wall_realtime_and_projection.sql`: revisiones, sincronización incremental, acceso temporal de pantalla, RLS, invalidaciones y auditoría.
2. `20261123051000_harden_projection_link_issuance.sql`: cuota serializada de emisión y avisos de cambios de acceso.
3. `20261123052000_revoke_projection_when_issuer_loses_access.sql`: revocación permanente al perder autorización.
4. `20261123053000_scope_realtime_rows_to_authorized_topic.sql`: lectura de mensajes Realtime restringida al tema autorizado.
5. `20261123054000_revoke_projection_on_platform_demotion.sql`: revocación permanente por pérdida del rol de plataforma, conservando accesos autorizados independientemente por el rol del evento.

En `src/features/wall/` se crean `feed-models.ts`, `feed-api.ts`, `feed.test.ts`, `projection.css`; los hooks `useWallFeed`, `useWallRealtime`, `useConversationScroll`; los componentes `LiveWallPost`, `ProjectionControls`, `ProjectionScreen`, `ProjectionSession`, `ParticipationQr`; y las páginas `ProjectionPage`, `ParticipationPage`. Se integran en el router, `GuestWall`, `ModerationWorkspace`, estilos y APIs existentes. `WallAudioPlayer` detiene y libera audio al retirar una publicación sin interrumpir las renovaciones de firma. `wall-media` reutiliza su firma segura para la pantalla. Los tipos de base se regeneraron con Supabase CLI; no se editaron a mano.

Pruebas nuevas: `supabase/tests/projection_rls.sql`, `scripts/projection.integration.test.mjs` (`npm run test:projection`), `tests/browser/projection.spec.mjs` y las seis unitarias de `feed.test.ts`. La regresión RSVP prepara ahora dos cambios distintos del estado guardado para probar un conflicto real; conserva por separado la comprobación de reintentos idempotentes. La regresión de envíos comprueba expresamente el éxito de la baja antes de intentar contactar de nuevo.

### Verificación de D — 23 de noviembre de 2026

| Comprobación ejecutada | Resultado |
| --- | --- |
| `npm run typecheck` | Correcto: TypeScript estricto y tres Edge Functions con Deno. |
| `npm run lint` | Correcto, sin advertencias. |
| `npm run build` | Correcto, sin despliegue. |
| `npm test` | 52 pruebas correctas. |
| `npm run test:rls` | Diez scripts SQL correctos, incluyendo siete roles, acceso anónimo y revocación por cambios de rol de evento/plataforma. Fixtures revertidos. |
| Diez suites de integración real contra Supabase Local | 93 escenarios correctos; 103 entradas TAP contando los diez contenedores. D aporta once escenarios y verifica además respuesta HTTP 429 y `Retry-After` en la firma de medios. |
| `npm run test:e2e` | Corrida final completa: 32 recorridos correctos en Chrome, a 360 y 1440 px. |
| Build compilado en preview temporal 5176 | Tres recorridos correctos: proyección a ambos anchos y regresión multimedia extendida de 60 segundos. El preview se detiene al finalizar. |

La suite completa inicial detectó un fallo en la renovación de audio después de una sesión intensiva: la firma alcanzaba la cuota de lecturas y no conservaba el tiempo de espera del servidor. Se corrigió **sin aumentar ni desactivar límites**. La Edge Function devuelve HTTP 429 con `retry_after`/`Retry-After`; el cliente conserva el archivo en reproducción, espera ese plazo y renueva su siguiente acceso. También mantiene la renovación durante la reproducción fuera de pantalla o con la pestaña en segundo plano. Las corridas finales comprobaron una segunda firma real, reproducción continua durante 60 segundos, finalización normal y reproducción posterior desde cero. Se retiró la instrumentación temporal de diagnóstico.

La prueba de concurrencia de RSVP se corrigió para partir de un estado diferente de ambas respuestas propuestas. Una comprobación Realtime falló durante ejecución concurrente con las pruebas SQL; se verificó por separado y en los recorridos reales de navegador. No se realizó un benchmark de latencia bajo carga.

Los recorridos de D cargan 66 publicaciones, incluidas fotografías y voz, mantienen el historial al recorrerlo y reciben aprobaciones/ocultamientos sin refrescar. Comprueban pausa manual, recorrido completo, controles de audio, detención al ocultar un mensaje, pantalla completa, revocación, QR decodificado con un lector independiente, rechazo de enlaces externos y entrada mediante la invitación propia. Se verifica además ausencia de tokens personales/proyección en consola y Referer. La integración cubre canales privados reales, rechazo de publicación falsa, separación de canales públicos, paginación con cambios concurrentes, cuotas, permisos de siete roles, aislamiento de eventos/archivos y auditoría sin credenciales.

 Las [capturas reales de revisión](artifacts/etapa-d/revision.html) muestran proyección, historial, controles privados, QR e invitación en vivo a 360 y 1440 px, además de la pantalla a 1920 px. Son datos temporales de pruebas retirados al finalizar; no se agregó contenido de demostración permanente.

Las pruebas de navegador utilizan Chrome y reproducción de audio real con archivos de prueba. Se decodifica el QR con un lector independiente y se prueba su destino. No se probó una cámara lectora física, un televisor/proyector real, Android ni Safari/iOS. Para usar un teléfono o pantalla física hace falta una URL accesible desde ese dispositivo: `localhost` apunta a su propio equipo. No se configuró acceso por red ni HTTPS externo; el micrófono en dispositivos físicos necesita un contexto seguro. Tampoco se realizó una prueba masiva de carga o un nuevo benchmark Lighthouse. La renovación y revocación de firmas no borra copias descargadas. El navegador puede restringir pantalla completa o reproducción según sus permisos.

Comprobación final: cero cuentas y eventos de prueba, publicaciones, configuraciones de muro, credenciales de proyección y archivos multimedia de fixtures. Las 30 migraciones están aplicadas localmente. Los hashes de `AGENTS.md`, `package-lock.json` y las 25 migraciones anteriores permanecen idénticos. Los tres contenedores de SIGA conservan sus fechas de inicio y cero reinicios. El preview 5176 quedó detenido; Jotopa sigue escuchando en 5174. No se desplegó ningún servicio.

Se detiene el desarrollo después de D para revisar el resultado. E y F no se iniciaron.

### Ampliación de la Etapa D — 25 de noviembre de 2026

Se reutilizaron las cinco migraciones, credenciales revocables, RPC de sincronización, Storage privado, moderación y componentes multimedia existentes. Esta revisión no agrega tablas, migraciones, dependencias ni variables de entorno. Los tipos generados permanecen idénticos porque no cambió el esquema ni sus firmas públicas. Los resultados del 23 y 24 de noviembre son antecedentes; las verificaciones nuevas se documentan separadamente.

La pantalla incorpora nombre e iniciales del evento, tres paletas predefinidas (oliva, rosa y noche), dos combinaciones de las fuentes locales existentes y tamaño grande para distancia. Las preferencias se incluyen en el fragmento del enlace preparado y pueden ajustarse en la pantalla: no modifican el diseño publicado ni se guardan como configuración del evento. El modo presentación oculta controles y conserva un botón discreto para recuperarlos; pantalla completa requiere autorización del navegador.

El movimiento conserva fracciones de píxel para evitar que velocidades suaves se detengan por redondeo. Arranca cuando ya existe historial y el contenedor está montado; no mantiene una animación inútil con el muro vacío. Al final no hay salto: pausa ocho segundos, regreso continuo a velocidad acotada y pausa de cuatro segundos antes de avanzar. Mensajes nuevos al final reanudan el avance desde la posición actual. Rueda, toque, teclado o interacción con el historial pausan el recorrido; reproducir audio lo suspende temporalmente sin superponer voces. El estado de conexión distingue desconexión y reconciliación; recuperar la red fuerza una actualización, además de Realtime y el respaldo periódico existente.

Solo la proyección libera los elementos multimedia al alejarse del área visible, conservando texto, posiciones reservadas e historial completo; un audio activo sigue disponible. Renovar una firma actualiza el enlace ampliado sin descargar de nuevo una fotografía que ya está decodificada. Se añaden duración de voz y errores/reintentos de fotografías; no se crea otro almacenamiento. La ampliación de imágenes usa URLs temporales y navegación sin Referer. Los controles del evento muestran la cantidad autorizada de aprobados mediante la misma RLS y explican el uso al operador.

**Decisión del QR:** se mantiene la entrada que pide el enlace personal recibido. El QR público no lleva credencial de proyección, token personal ni acceso de escritura compartido. Participantes sin invitación necesitarían autorización, identidad declarada diferenciada, cuotas y revocación propios; ese acceso no se habilita como atajo. La proyección funciona con QR desactivado y reutiliza la moderación existente.

Archivos nuevos en `src/features/wall/`: `presentation-models.ts`, `presentation.test.ts`, `hooks/useOnlineStatus.ts`, `components/WallPhoto.tsx`, `components/ProjectionAppearanceFields.tsx` y `components/ProjectionToolbar.tsx`. Se ajustan `ProjectionScreen`, `ProjectionControls`, `ProjectionSession`, `ProjectionPage`, `LiveWallPost`, `WallPostBubble`, los hooks de movimiento/Realtime, `feed-api.ts` y `projection.css`. `tests/isolated/projection-fixture.mjs`, `tests/isolated/projection.spec.mjs` y `playwright.presentation.config.ts` permiten verificar estados difíciles sin mutar la base; esas respuestas simuladas se distinguen de las pruebas reales de Supabase. `npm run test:presentation` ejecuta esa suite; `JOTOPA_PRESENTATION_PREVIEW=1` la ejecuta contra el build en un preview temporal 5176.

#### Verificación ejecutada el 25 de noviembre

| Verificación | Resultado |
| --- | --- |
| Typecheck, lint y build | Correctos sobre el código final; TypeScript estricto y tres Edge Functions. |
| Unitarias | 60 correctas, incluidas ocho nuevas de opciones de presentación y movimiento. |
| SQL/RLS | Diez scripts correctos, con siete roles, aislamiento y revocación. Fixtures SQL revertidos. |
| Integración real | Diez suites correctas: 93 escenarios, 103 entradas TAP contando los contenedores. Incluye las once comprobaciones de D y las nueve suites anteriores. |
| Chrome en 5174 | 38 recorridos completos correctos de A/B/C/D. Después de corregir el arranque automático se repitieron los dos recorridos ampliados de D: ambos correctos. |
| Build compilado en preview 5176 | Tres recorridos reales correctos: D a 360/1440 px y regresión multimedia de C con reproducción continua de 60 segundos, renovación de firma y MediaRecorder real con micrófono virtual. |
| Interfaz aislada del build | Siete recorridos correctos; respuestas simuladas, expresamente sin certificar RLS/Storage. Incluye 150 publicaciones, reconexión, deduplicación, retirada, error de fotografía, exclusión entre voces, bloqueo de reproducción simulado y arranque automático tras la carga. |

La prueba nueva de arranque reprodujo un defecto real: el efecto de movimiento se ejecutaba antes de montar el historial y no volvía a arrancar hasta interactuar. Se habilita ahora al existir publicaciones y se verifica sin tocar controles primero. El recorrido real de escritorio usa movimiento permitido; el de celular comprueba la preferencia de movimiento reducido. La prueba del regreso coloca primero el historial al final mientras está pausado y deja terminar la rueda antes de reanudar, evitando que dos gestos del driver se interfieran.

Los recorridos reales cargan 66 publicaciones; comprueban texto/foto/voz, orden, aprobación y retirada, pausa/reanudación, regreso gradual, audio exclusivo, pantalla completa, revocación y lectura del QR con decodificador independiente. Una aprobación durante la desconexión del navegador se recupera contra Supabase al volver la red. La integración comprueba además paginación con cambios concurrentes, invalidaciones privadas, prohibición de publicación falsa, cuotas y firmas para medios aprobados únicamente. La prueba de interfaz de 150 filas es complementaria y simulada, no una prueba de carga real.

Se inspeccionan cabeceras reales con `request.allHeaders()`. La navegación de proyección conserva `Referrer-Policy: no-referrer`; la ampliación de una fotografía privada responde 200 sin Referer. No se detectan tokens personales/de proyección en Referer o consola ni solicitudes inesperadas a terceros. Las seis regresiones de privacidad de C conservan el colector HTTP real en otro origen loopback y su control negativo. Los informes `artifacts/etapa-d/privacidad-proyeccion-{360|1440}.json` guardan cantidades y booleanos, sin URLs ni credenciales. Un contador de solicitudes de documento comprueba que no hay recargas completas; distingue las actualizaciones del historial que hace React Router.

Al comenzar, Docker/WSL y Supabase no respondían. Cuando el entorno volvió a estar disponible se ejecutaron las pruebas reales. Se inició exclusivamente el runtime local de Edge Functions de Jotopa, que faltaba después de la recuperación y producía HTTP 503 en la primera integración multimedia. Ese intento dejó dos eventos sintéticos y ocho cuentas; se revisaron sus identificadores y la ausencia de archivos antes de retirar exclusivamente esos fixtures. La integración posterior pasó completa. No se reinició Docker, WSL ni SIGA desde el agente.

Las [capturas finales reales de proyección, controles y conversación](artifacts/etapa-d/revision.html) incluyen 360, 1440 y 1920 px, formato 16:9 y modo presentación con texto, fotografía y voz. La [galería aislada](artifacts/etapa-d/ui-aislada-2026-11-25/revision.html) se etiqueta por separado. El [resumen verificable de resultados](artifacts/etapa-d/verificacion-2026-11-25.json) reúne cantidades, privacidad y limpieza sin credenciales. No se añade contenido ficticio permanente al producto.

Comprobación final: cero cuentas/eventos de fixtures, publicaciones, medios, configuraciones de muro, credenciales de proyección y objetos de Storage. Se conserva una cuenta y un evento legítimos anteriores, sin borrarlos. RLS sigue activa en todas las tablas públicas y los tres buckets existentes permanecen privados. Las 30 migraciones están aplicadas; los 40 archivos protegidos mantienen sus hashes, incluidos AGENTS, migraciones, tipos, lockfile, fuentes y configuración de privacidad. Los tres contenedores de SIGA conservan ID, fecha de inicio, estado activo y cero reinicios desde la medición posterior a la recuperación externa de Docker. Preview 5176 detenido; Jotopa permanece en 5174. No hubo despliegues.

**Limitaciones:** no se ejecutó una sesión continua de varias horas, carga masiva ni prueba con televisor/proyector, cámara/micrófono físicos, Android o Safari/iOS. Un dispositivo externo necesita una dirección accesible desde su propia red; `localhost` identifica a ese dispositivo. Las preferencias visuales son por enlace, no configuración persistida del evento, y la identidad actual usa nombre e iniciales, sin descargar otra portada. Los audios requieren interacción y sus metadatos nativos se cargan al usarlos. Una URL firmada ya emitida puede durar hasta 60 segundos; no se pueden retirar bytes descargados. Sin red se conserva el contenido ya autorizado hasta revalidar o vencer la credencial. El QR no permite participar sin invitación personal. Se detiene D para revisión antes de E.

## Estructura y herramientas

React, Vite, TypeScript strict, Tailwind 4, React Router, TanStack Query, Supabase JS, React Hook Form y Zod. Las versiones directas están fijadas y se conserva `package-lock.json`. TypeScript 6.0.3 mantiene compatibilidad con `typescript-eslint`. Los tokens visuales están en `src/styles.css` y las páginas se cargan por ruta.

`features/auth/` agrupa sesión, API, esquemas y páginas; `events/` eventos, `members/` equipo, `guests/` invitados y QR, `rsvp/` la invitación pública y respuestas, `invitations/` envío y seguimiento, `invitation-design/` el editor y la presentación visual, `info/` cupos/mesas e indicadores, y `wall/` buenos deseos, archivos y moderación. Las APIs públicas entre features se exponen por `index.ts`; los submódulos públicos de presentación, medios e invitado mantienen las dependencias de UI separadas. `src/app/` contiene proveedores, layout y router. Las otras features están reservadas. Las CLI de Supabase y Vercel y Playwright son dependencias de desarrollo. Los gráficos se incorporarán en su fase.

`npm audit --omit=dev` no reportó vulnerabilidades en el árbol de dependencias de producción de esta fase. La auditoría completa sigue reportando **38 avisos en dependencias de desarrollo** (16 moderados, 21 altos y 1 crítico), en el árbol de la CLI de Vercel ya existente. No se aplicó `npm audit fix --force` ni se cambió esa CLI como parte de la gestión de invitados. No se usó para desplegar.

## Límites actuales y próximo paso

- El correo externo de equipo con Resend queda pendiente de credenciales y remitente verificado; Mailpit sí está probado. No se implementó envío de invitaciones a invitados por email, confirmación de entrega ni webhooks. Las aperturas del enlace personal sí están implementadas y no prueban lectura de WhatsApp/email.
- El equipo muestra las últimas 100 invitaciones de colaboradores y 30 acciones de auditoría. Esas vistas no tienen paginación; el historial individual nuevo de invitados sí pagina de 25 en 25.
- No se configuró Realtime para los equipos. Los controles se actualizan al recargar/refrescar; SQL aplica los cambios de permisos en cada operación.
- El entorno local conserva la confirmación de registro desactivada. Antes de otro entorno hay que definir confirmación, URLs y proveedor de correo; no se desplegó nada.
- El borrado de eventos es lógico y conserva datos; no hay restauración ni purga en la interfaz.

El siguiente paso es **revisar la Etapa D y sus capturas**, antes de autorizar E. Se recomienda probar también el televisor/proyector definitivo y Android/Safari. El editor visual mantiene ajustes acotados; no hay lienzo libre, historial de versiones ni autoguardado.

E cerrará el registro público, restringirá la creación de eventos y habilitará administración/clientes autorizados. El panel ampliado y los recordatorios con horarios, límites y bajas quedan en F. No se implementaron esas funciones, álbum colaborativo ni logística avanzada. **No se continuará automáticamente a E.**

`AGENTS.md` quedó intacto. No se realizaron despliegues ni se modificó SIGA.
