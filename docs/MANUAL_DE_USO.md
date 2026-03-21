# Manual de uso de ScrumPilot

## 1. Proposito

ScrumPilot concentra trabajo operativo y administracion de productos Scrum en una misma aplicacion, pero ahora separa mucho mejor ambos contextos:

- `Focused` para trabajo diario sobre tareas pendientes
- `Settings` para datos personales y metricas propias
- `Administracion` para catalogos y gestion de usuarios segun rol
- `Workspace de producto` para backlog, sprints, board, metricas y definiciones

La fuente de verdad de permisos sigue siendo el backend. Si una vista permite navegar hasta cierto punto, la API valida igual cada operacion sensible.

---

## 2. Acceso y shell principal

### Pantalla de login

La ruta `/login` usa una shell minima. No muestra catalogos, tabs ni encabezado autenticado.

La pantalla contiene:

- formulario de `Email` y `Password`
- boton `Entrar`
- boton `Entrar con GitLab`

La ruta `/signup` ya no expone una pantalla separada y redirige a `/login`.

### Restauracion de sesion

Al abrir la app, se intenta restaurar la sesion actual antes de resolver la navegacion.

- si hay sesion valida, `/` redirige a `/focused`
- si no hay sesion, `/` redirige a `/login`

### Encabezado autenticado

Fuera del login, la app muestra una barra superior minima con:

- etiqueta discreta `Focused workspace`
- toggle de tema
- menu de usuario con avatar o iniciales

El menu de usuario ofrece:

- `Focused`
- `Settings`
- `Administracion` si el rol tiene acceso
- `Logout`

---

## 3. Roles y reglas base

### Roles vigentes

Los roles disponibles hoy son:

- `platform_admin`
- `product_owner`
- `scrum_master`
- `team_member`

El rol `viewer` fue eliminado del modelo, de la base y de la interfaz.

### Reglas especiales

- El primer usuario creado en una base vacia pasa a ser `platform_admin`.
- Un `team_member` debe tener al menos un equipo asignado.
- La ruta legacy `/profile` redirige a `/settings`.

### Alcance

- `platform_admin` tiene alcance global.
- `product_owner` trabaja sobre productos propios o donde figura como miembro con rol `product_owner`.
- `scrum_master` y `team_member` trabajan sobre productos vinculados a sus equipos.

Para `team_member`, el backend ademas restringe lectura y colaboracion a tareas visibles de kanban:

- la tarea debe pertenecer a un sprint
- la tarea debe estar asignada al usuario o no tener asignado

---

## 4. Mapa de navegacion

### `Focused`

Es la vista principal despues del login. Todas las sesiones autenticadas aterrizan aqui.

### `Settings`

Reemplaza al antiguo `Perfil`. Centraliza:

- nombre
- avatar URL
- metricas personales

### `Administracion`

Se accede desde el menu de usuario. Solo esta disponible para:

- `platform_admin`
- `product_owner`
- `scrum_master`

### `Workspace de producto`

El shell de producto sigue existiendo, pero ahora se comporta asi:

- `platform_admin`, `product_owner` y `scrum_master` usan tabs de `Resumen`, `Backlog`, `Sprints` y `Metricas`
- `team_member` no entra al workspace general; si intenta abrir `/products/:productId` sin una tarea concreta, es redirigido a `/focused`
- `team_member` si puede abrir definiciones de tarea puntuales por URL o desde el drawer, siempre dentro de las restricciones de kanban visible

---

## 5. Matriz de capacidades reales

La siguiente matriz describe lo que hoy se puede hacer desde la aplicacion y lo que permite la API actual.

| Area / accion | platform_admin | product_owner | scrum_master | team_member |
|---|---|---|---|---|
| Acceder a `Focused` | Si | Si | Si | Si |
| Acceder a `Settings` | Si | Si | Si | Si |
| Acceder a `Administracion` | Si | Si | Si | No |
| Ver tab `Productos` en `Administracion` | Si | Si | Si | No |
| Ver tab `Equipos` en `Administracion` | Si | Si | Si | No |
| Ver tab `Usuarios` en `Administracion` | Si | No | Si | No |
| Crear usuarios | Si | No | No | No |
| Cambiar rol de usuarios | Si | No | No | No |
| Asignar equipos a usuarios | Si | No | No | No |
| Ver catalogo de productos | Si | Si | Si | Sin catalogo; solo contexto de tareas visibles |
| Crear / editar / eliminar productos | Si | Si | No | No |
| Abrir workspace de producto | Si | Si | Si | No, salvo definicion de tarea puntual |
| Ver equipos | Si | Si | Si | Sin vista administrativa de equipos |
| Crear / editar / eliminar equipos | Si | Si | No | No |
| Gestionar miembros de equipo | Si | Si | No | No |
| Vincular productos a equipos | Si | Si | No | No |
| Ver backlog / historias | Si | Si | Si | No |
| Crear / editar / eliminar historias | Si | No | Si | No |
| Rankear historias | Si | Si | Si | No |
| Ver tareas por historia | Si | Si | Si | No |
| Crear / editar / eliminar tareas | Si | No | Si | No |
| Ver lista de sprints | Si | Si | Si | No |
| Crear / editar / iniciar / completar sprint | Si | No | Si | No |
| Ver board de sprint | Si | Si | Si | No como vista dedicada |
| Ver board de `Focused` | Si | Si | Si | Si |
| Scope de `Focused` | Todas las tareas visibles | Todas las tareas visibles | Todas las tareas visibles | Solo propias o sin asignar |
| Cambiar estado de tarea | Si | No | Si | Solo propia y en sprint activo |
| Reordenar / mover tarjetas | Si | No | Si | Solo propias y en sprint activo |
| Tomar tarea sin asignar | Si | No | Si | Si, solo para si mismo |
| Reasignar tarea a otra persona | Si | No | Si | No |
| Mover tarea entre sprints | Si | No | Si | No |
| Escribir mensajes en tareas | Si | Si | Si | Solo en tareas visibles de kanban |
| Crear tarea desde mensaje | Si | No | Si | No |
| Abrir definicion de tarea | Si, editable | Si, readonly | Si, editable | Si, readonly y solo si la tarea es visible |
| Ver metricas de producto / equipo | Si | Si | Si | No |
| Ver metricas propias en `Settings` | Si | Si | Si | Si |
| Consultar actividad por usuario desde `Usuarios` | Si | No | Si | No |

---

## 6. `Focused` en detalle

`Focused` consume el board de tareas pendientes del kanban activo y aplica el filtro segun el rol del usuario actual.

### Que muestra

Siempre aparecen tareas que cumplan todo esto:

- no estan en `Done`
- pertenecen a un sprint `ACTIVE`
- pertenecen a un producto accesible para ese usuario

Ademas:

- `platform_admin`, `product_owner` y `scrum_master` ven todas las tareas visibles que cumplan esas reglas
- `team_member` ve solo tareas propias o sin asignar

La vista incluye:

- hero principal con resumen del contexto
- tarjetas KPI con conteos de trabajo visible
- kanban pendiente

El board se refresca automaticamente cada 15 segundos.

### Comportamiento por rol

#### `platform_admin`

- ve todas las tareas visibles del board `Focused`
- puede abrir el drawer en modo editable
- puede cambiar estado
- puede mover tarjetas
- puede asignar o reasignar a cualquier persona disponible
- puede comentar y crear tareas derivadas desde mensajes

#### `product_owner`

- ve todas las tareas visibles del board `Focused`
- puede abrir la tarea, pero en modo readonly
- puede usar la conversacion de la tarea
- no puede cambiar estado, asignacion ni campos de la tarea
- no puede crear tareas derivadas desde mensajes

#### `scrum_master`

- ve todas las tareas visibles del board `Focused`
- puede abrir el drawer en modo editable
- puede asignar tareas a otras personas
- puede cambiar estado y mover tarjetas
- puede crear tareas hijas y tareas derivadas desde mensajes

#### `team_member`

- ve solo tareas propias o sin asignar
- puede tomar una tarea sin asignar para si mismo
- puede cambiar estado solo en tareas propias y dentro de un sprint activo
- puede mover solo sus tarjetas en kanban
- no puede reasignar a otra persona
- no puede mover tareas entre sprints
- abre la tarea en modo readonly, pero mantiene conversacion si la tarea es visible

---

## 7. `Administracion` en detalle

La vista `Administracion` separa claramente trabajo operativo de gestion administrativa.

### Tabs visibles por rol

- `platform_admin`: `Productos`, `Equipos`, `Usuarios`
- `product_owner`: `Productos`, `Equipos`
- `scrum_master`: `Productos`, `Equipos`, `Usuarios`

### `Productos`

La tab muestra el catalogo y permite abrir el workspace de cada producto.

- `platform_admin` y `product_owner` ven botones `+ Producto`, `Editar` y `Eliminar`
- `scrum_master` ve la lista y el acceso `Abrir workspace`, pero no tiene botones de mutacion
- al editar un producto, `platform_admin` y `product_owner` tambien pueden guardar los equipos vinculados a ese producto

### `Equipos`

La tab muestra cards con miembros y acciones sobre cada equipo.

- `platform_admin` y `product_owner` pueden crear, editar y eliminar
- `scrum_master` puede consultar y abrir `Ver detalle`, pero no muta equipos desde esta vista

### `Usuarios`

La tab se llama `Usuarios` y reemplaza al antiguo concepto ambiguo de `Admin`.

- `platform_admin` puede crear usuarios, cambiar roles y editar equipos
- `scrum_master` puede consultar usuarios y abrir actividad, pero no crear ni modificar usuarios

---

## 8. Workspace de producto y definiciones

### Workspace general

Para roles operativos altos (`platform_admin`, `product_owner`, `scrum_master`), el workspace conserva:

- `Resumen`
- `Backlog`
- `Sprints`
- `Metricas`

### Definiciones

Las definiciones completas quedaron separadas del drawer para poder trabajar a pantalla completa:

- definicion de producto
- definicion de historia
- definicion de sprint
- definicion de tarea

### Acceso por rol

- definicion de producto: `platform_admin`, `product_owner`
- definicion de historia: `platform_admin`, `scrum_master`
- definicion de sprint: `platform_admin`, `scrum_master`
- definicion de tarea: todos los roles autenticados, con restricciones por rol

En la definicion de producto tambien queda disponible la gestion de equipos vinculados.

### Definicion de tarea

La definicion de tarea es el punto de mayor detalle y trazabilidad.

Incluye:

- formulario principal de la tarea
- contexto de historia, sprint, asignado y ultima actualizacion
- referencia a mensaje origen
- referencia a tarea padre
- lista de hijos
- conversacion con replies
- apertura de tareas relacionadas y derivadas

El modo readonly se activa cuando:

- el rol no puede editar campos de tarea
- la URL incluye `?mode=readonly`

Consecuencias del readonly:

- los campos de la tarea no se editan
- la navegacion entre tarea padre, hijas y derivadas sigue disponible
- la conversacion puede seguir habilitada si el rol tiene permiso para comentar esa tarea

### Reglas especificas para `team_member`

`team_member` puede:

- abrir la definicion de una tarea visible desde `Focused`
- volver desde la definicion a `Focused`
- navegar a tarea padre, hijas y derivadas si siguen dentro del alcance visible
- escribir mensajes solo si la tarea pertenece a un sprint y esta asignada a el o no tiene asignado

`team_member` no puede:

- entrar al backlog
- entrar a sprints o metricas del producto
- editar campos de la tarea
- crear tareas derivadas desde mensajes

---

## 9. `Settings`

`Settings` reemplaza a `Perfil` como punto unico de configuracion personal.

### Datos editables

Cada usuario puede cambiar:

- `Nombre`
- `Avatar URL`

### Informacion adicional

La vista muestra:

- badge con iniciales del usuario
- email
- rol actual
- resumen de cuenta activa

### Metricas personales

La misma pantalla concentra metricas y velocidad personales por ventana temporal:

- `week`
- `month`
- `semester`
- `year`

Segun el rol y el dato consultado, algun bloque puede quedar solo en lectura o mostrar mensaje de error si el endpoint correspondiente no aplica a ese usuario.

---

## 10. Actividad y metricas

### Actividad por entidad

La actividad de entidades visibles sigue disponible para todos los roles sobre el trabajo al que tengan acceso.

### Actividad por usuario

Actualmente:

- `platform_admin` puede consultar actividad de cualquier usuario
- `scrum_master` puede consultar actividad de usuarios de equipos que comparte
- `team_member` solo puede consultar su propia actividad
- `product_owner` no tiene vista administrativa de actividad por usuario

### Metricas

- metricas de producto y equipo: `platform_admin`, `product_owner`, `scrum_master`
- metricas personales en `Settings`: todos los usuarios autenticados, con disponibilidad final sujeta al endpoint correspondiente

---

## 11. Resumen practico por rol

### `platform_admin`

Usa las tres areas:

- `Focused` para seguimiento rapido
- `Administracion` para catalogos y usuarios
- `Workspace de producto` para operacion completa

### `product_owner`

Se mueve entre:

- `Focused` para contexto rapido
- `Administracion > Productos`
- `Administracion > Equipos`
- `Workspace de producto` para backlog, board y metricas en modo mayormente consultivo

### `scrum_master`

Trabaja principalmente en:

- `Focused`
- `Administracion` para consulta de productos, equipos y usuarios
- `Workspace de producto` para backlog, sprints, board, definicion de historias y definicion de tareas

### `team_member`

Trabaja principalmente en:

- `Focused`
- `Settings`
- definicion de tarea abierta desde el kanban

Su flujo esperado es:

1. entrar a `Focused`
2. tomar una tarea sin asignar o continuar una propia
3. mover la tarjeta dentro del kanban si corresponde
4. abrir el drawer o la definicion de tarea en modo readonly
5. registrar decisiones y dudas en la conversacion
