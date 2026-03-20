# Manual de uso de ScrumPilot

## 1. Objetivo de la aplicación

ScrumPilot es una aplicación para operar productos Scrum desde una única interfaz:

- catálogo de productos
- gestión de equipos
- backlog del producto
- planificación de sprints
- ejecución Kanban
- métricas
- historial de actividad
- conversación y trazabilidad sobre tareas

El flujo recomendado de trabajo es:

1. Crear o seleccionar un producto.
2. Refinar el backlog.
3. Crear un sprint y asociarlo a un equipo.
4. Mover tareas al sprint.
5. Ejecutar el sprint en Kanban.
6. Registrar conversación y derivar subtareas.
7. Revisar métricas y actividad.

---

## 2. Inicio de sesión y sesión de usuario

### Acceso

La aplicación permite:

- login con email y password
- registro manual
- login con GitLab si está configurado

### Restauración de sesión

Si ya existe sesión válida, al abrir o refrescar la aplicación se intenta restaurarla automáticamente.

### Perfil

Todo usuario autenticado puede entrar a `Perfil` y editar:

- nombre
- avatar URL

---

## 3. Roles de usuario

Los roles disponibles en la aplicación son:

- `platform_admin`
- `product_owner`
- `scrum_master`
- `team_member`
- `viewer`

### Regla especial de alta inicial

- El primer usuario registrado en una base vacía pasa a ser `platform_admin`.
- Los siguientes registros públicos quedan como `team_member`.

### Regla especial para `team_member`

Un usuario con rol `team_member` debe tener al menos un equipo asignado. Esa validación se aplica al crearlo y también al cambiarle el rol desde administración.

### Alcance por equipos

Los roles `team_member` y `viewer` trabajan con alcance restringido por equipos.

Eso significa:

- sólo deben operar sobre equipos a los que pertenecen
- la actividad por usuario se restringe a usuarios con equipos en común
- historias, tareas, sprints e indicadores se filtran por productos accesibles desde esos equipos

### Nota importante sobre permisos

La fuente de verdad de permisos es el backend. Algunas pantallas pueden ser navegables desde frontend, pero cada operación relevante se valida en API.

---

## 4. Matriz de permisos por rol

### 4.1 Resumen ejecutivo

| Área / acción | platform_admin | product_owner | scrum_master | team_member | viewer |
|---|---|---|---|---|---|
| Ver productos | Sí | Sí | Sí | Sí | Sí |
| Crear / editar / eliminar productos | Sí | Sí | No | No | No |
| Configurar workflow del producto | Sí | Sí | Sí | No | No |
| Ver equipos | Sí | Sí | Sí | Sí, sólo propios | Sí, sólo propios |
| Crear / editar equipos | Sí | No | Sí | No | No |
| Eliminar equipos | Sí | No | No | No | No |
| Asignar miembros a equipos | Sí | No | Sí | No | No |
| Vincular productos a equipos | Sí | Sí | Sí | No | No |
| Ver backlog / historias | Sí | Sí | Sí | Sí, con alcance | Sí, con alcance |
| Crear / editar historias | Sí | Sí | Sí | Sí, con alcance | No |
| Eliminar / rankear historias | Sí | Sí | Sí | No | No |
| Ver tareas | Sí | Sí | Sí | Sí, con alcance | Sí, con alcance |
| Crear / editar tareas | Sí | Sí | Sí | Sí, con alcance | No |
| Eliminar tareas | Sí | Sí | Sí | No | No |
| Cambiar estado de tareas | Sí | Sí | Sí | Sí, con alcance | No |
| Asignar tarea / moverla de sprint administrativamente | Sí | Sí | Sí | No | No |
| Escribir mensajes en tareas | Sí | Sí | Sí | Sí, con alcance | No |
| Crear tarea desde mensaje | Sí | Sí | Sí | Sí, con alcance | No |
| Crear / editar / iniciar / completar sprint | Sí | Sí | Sí | No | No |
| Ver board del sprint | Sí | Sí | Sí | Sí, con alcance | Sí, con alcance |
| Crear tareas desde board del sprint | Sí | Sí | Sí | Sí, con alcance | No |
| Reordenar / mover tarjetas en board | Sí | Sí | Sí | Sí, con alcance | No |
| Ver métricas | Sí | Sí | Sí | Sí, con alcance | Sí, con alcance |
| Administrar usuarios, roles y equipos de usuario | Sí | No | No | No | No |
| Ver actividad por usuario desde Admin | Sí | No | No | No | No |

### 4.2 Qué puede hacer cada rol

#### `platform_admin`

Es el rol de control total. Puede:

- administrar usuarios, roles y equipos
- crear, editar y eliminar productos
- crear, editar y eliminar equipos
- operar backlog, tareas y sprints
- ver y consultar actividad y métricas

#### `product_owner`

Está orientado a producto. Puede:

- crear, editar y eliminar productos
- configurar workflow del producto
- refinar backlog
- crear, editar y eliminar historias
- crear, editar y eliminar tareas
- crear, editar, iniciar y completar sprints
- consultar métricas
- vincular productos a equipos

No puede:

- administrar usuarios globales
- crear o editar equipos directamente
- eliminar equipos

#### `scrum_master`

Está orientado a ejecución y coordinación operativa. Puede:

- crear y editar equipos
- asignar o quitar miembros de equipos
- vincular productos a equipos
- configurar workflow del producto
- crear, editar y eliminar historias
- crear, editar y eliminar tareas
- crear, editar, iniciar y completar sprints
- operar el board Kanban
- consultar métricas

No puede:

- crear o eliminar productos
- administrar usuarios globales
- eliminar equipos

#### `team_member`

Está orientado a ejecución dentro de su alcance. Puede:

- ver equipos donde participa
- ver backlog, tareas, sprints, board y métricas dentro del alcance de sus equipos
- crear y editar historias dentro de productos accesibles
- crear y editar tareas
- cambiar estado de tareas
- crear tareas desde sprint board
- mover tarjetas en el board
- participar en la conversación de tareas
- crear subtareas o tareas desde mensajes

No puede:

- eliminar historias
- rankear backlog
- eliminar tareas
- administrar productos
- administrar equipos
- crear o cerrar sprints
- reasignar administrativamente tareas con los endpoints reservados a roles de coordinación

#### `viewer`

Es un rol de consulta. Puede:

- ver equipos propios
- ver historias, tareas, sprints, board, actividad visible y métricas dentro de su alcance

No puede:

- crear
- editar
- eliminar
- cambiar estados
- publicar mensajes

---

## 5. Secciones globales de la aplicación

## 5.1 Inicio

La pantalla `Inicio` cumple dos funciones:

- si no hay sesión, muestra entrada y registro
- si hay sesión, muestra un panel principal y accesos rápidos a productos

Contenido principal:

- KPIs básicos del catálogo
- acceso rápido a `Productos`
- acceso directo al workspace de cada producto

Uso recomendado:

- entrar aquí para retomar el trabajo diario
- saltar al workspace del producto activo

## 5.2 Productos

Ruta principal: `Productos`

Función:

- administrar el catálogo de productos
- abrir el workspace de cada producto

Acciones disponibles desde el catálogo:

- `+ Producto`: abre drawer de creación
- `Editar`: abre drawer de edición
- `Abrir workspace`: entra al workspace del producto
- `Eliminar`: borra el producto

### Importante sobre eliminación

Eliminar un producto dispara borrado en cascada de sus elementos relacionados, incluyendo:

- historias
- tareas
- sprints

Uso recomendado:

1. crear el producto
2. completar key y descripción
3. abrir workspace
4. gestionar backlog y sprints desde allí

## 5.3 Equipos

Ruta principal: `Equipos`

Función:

- mantener la estructura operativa de equipos
- gestionar miembros
- asociar productos al equipo

Acciones disponibles:

- `+ Equipo`: crea un equipo
- `Editar`: abre drawer de edición integral
- `Eliminar`: elimina el equipo si el rol lo permite

Dentro de la edición de equipo se puede gestionar:

- nombre
- descripción
- miembros del equipo
- productos vinculados
- historial de actividad del equipo

Uso recomendado:

1. crear el equipo
2. agregar miembros
3. asociar los productos que ese equipo puede trabajar

## 5.4 Perfil

Ruta principal: `Perfil`

Función:

- permitir que cada usuario actualice su identidad visual

Campos editables:

- nombre
- avatar URL

## 5.5 Admin

Ruta principal: `Admin`

Visible en la navegación sólo para `platform_admin`.

Función:

- administración de usuarios
- asignación de roles
- asignación de equipos a usuarios
- consulta de actividad por usuario

Operaciones disponibles:

- cambiar rol de un usuario
- abrir editor de equipos del usuario
- crear usuario nuevo
- consultar actividad y estadísticas de un usuario

### Regla crítica

Si se crea un usuario con rol `team_member`, debe salir de administración con al menos un equipo asignado.

---

## 6. Workspace de producto

Al abrir un producto se ingresa a su workspace. La navegación principal del workspace está organizada en:

- `Resumen`
- `Backlog`
- `Sprints`
- `Metricas`

Además existen páginas de definición completas para:

- historia
- sprint
- tarea

## 6.1 Resumen

Función:

- vista ejecutiva del producto

Muestra:

- nombre y descripción del producto
- cantidad de historias
- cuántas están `READY`
- cuántas están `IN_SPRINT`
- sprint activo

Uso recomendado:

- revisar salud general del producto antes de entrar al detalle

## 6.2 Backlog

Función:

- gestionar historias de usuario y su prioridad

Qué muestra:

- lista priorizada de historias
- puntos de historia
- estado visible
- cantidad de tareas

Acciones principales:

- `+`: crear historia
- drag and drop de historias para priorizar
- `Subir` / `Bajar`: ajuste fino de prioridad
- `Editar`: abre drawer de historia
- `Gestionar tareas`: entra a la vista de tareas de esa historia

### Regla de estados de historia

El estado de historia no es totalmente manual.

- `DRAFT` y `READY` sí se pueden elegir manualmente.
- `IN_SPRINT` y `DONE` son estados derivados.

La lógica funcional es:

- una historia está `IN_SPRINT` cuando alguna de sus tareas está en sprint
- una historia está `DONE` cuando todas sus tareas están terminadas

## 6.3 Definición de historia

Se accede desde:

- el drawer de historia con `Ir a la definicion`
- la ruta semántica de definición de historia

Función:

- edición completa de la historia en pantalla completa

Campos principales:

- título
- story points
- estado manual (`DRAFT` o `READY`)
- descripción con editor MDX

Secciones adicionales:

- tareas de la historia agrupadas por backlog o sprint
- actividad de la historia

## 6.4 Tareas de historia

Función:

- operar el conjunto de tareas de una historia sin salir del producto

Qué se puede hacer:

- crear tarea
- editar tarea
- cambiar estado
- ver sprint asociado
- ver responsable
- revisar horas

Uso recomendado:

- refinar el trabajo técnico derivado de una historia
- preparar el backlog técnico antes de comprometer tareas a sprint

## 6.5 Sprints

Función:

- planificar y operar iteraciones

Qué muestra:

- listado de sprints del producto
- estado de cada sprint
- fechas
- equipo asociado

Acciones principales:

- `+ Sprint`: crear sprint
- `Editar`: abre drawer de sprint
- `Iniciar sprint`
- `Completar sprint`
- abrir board de ejecución

## 6.6 Definición de sprint

Se accede desde:

- el drawer de sprint con `Ir a la definicion`
- la ruta semántica de definición de sprint

Campos principales:

- nombre
- equipo
- objetivo
- fecha de inicio
- fecha de fin

Sección especial:

- gestión de tareas del sprint

Desde esa sección se puede:

- buscar tareas pendientes
- agregar tareas al sprint
- filtrar tareas ya agregadas
- quitar tareas del sprint

Además incluye:

- historial de actividad del sprint

## 6.7 Ejecución del sprint (Kanban)

Función:

- ejecutar el sprint en columnas Kanban

Qué permite:

- ver columnas del workflow del producto
- mover tareas entre columnas
- reordenar tareas dentro de la misma columna
- crear nuevas tareas desde una columna
- asignar responsable directamente
- editar tarea
- buscar tareas
- filtrar por usuario

Qué muestra cada tarjeta:

- título
- historia asociada
- asignado
- estado
- descripción resumida
- fecha de última actualización
- puntos de esfuerzo

Uso recomendado:

- trabajo diario del sprint
- seguimiento de bloqueos
- cierre de tareas con registro de horas reales

## 6.8 Métricas

Función:

- seguimiento cuantitativo del producto, equipo, sprint y usuario

Qué muestra:

- periodo analizado
- tareas trabajadas
- tareas completadas
- puntos entregados
- burnup / burndown
- velocidad del equipo
- velocidad del usuario

Interpretación general:

- `Burnup / Burndown`: evolución diaria del scope, completado y restante del sprint seleccionado
- `Velocidad del equipo`: puntos completados por sprint
- `Velocidad del usuario`: puntos completados por persona

---

## 7. Drawers y páginas de definición

La aplicación usa dos niveles de edición:

### 7.1 Drawer

Se usa para:

- creación rápida
- edición contextual sin perder la pantalla de fondo

Todos los objetos principales se crean desde drawer:

- producto
- equipo
- historia
- sprint
- tarea

### 7.2 Página de definición

Se usa para:

- edición extensa
- trabajo prolongado
- colaboración o navegación entre elementos relacionados

Desde los drawers de historia, sprint y tarea existe el botón `Ir a la definicion`.

---

## 8. Editor de descripciones y mensajes

Las descripciones y mensajes usan `MDXEditor`.

Capacidades disponibles:

- headings
- párrafos
- bold / italic / underline
- listas
- citas
- enlaces
- imágenes
- tablas
- bloques de código

### Uso recomendado

- para negrita, itálica y subrayado se puede usar la toolbar o atajos del editor
- para comentarios y conversaciones, el contenido se renderiza luego como Markdown

---

## 9. Tareas: edición, trazabilidad y colaboración

## 9.1 Datos principales de una tarea

Una tarea puede incluir:

- título
- descripción
- historia
- sprint
- responsable
- estado
- puntos de esfuerzo
- horas estimadas
- horas restantes
- horas reales

### Estimación de esfuerzo

#### Puntos

Se seleccionan mediante un control visual de 1 a 5 puntos.

#### Horas estimadas

Se definen con:

- presets: `4`, `8`, `16`, `24`
- o un valor manual personalizado

#### Horas reales

Al cerrar una tarea se pide el tiempo real para comparar estimación y ejecución.

## 9.2 Cierre de tarea

Cuando una tarea pasa a `Done`:

- se solicita registrar horas reales
- las horas restantes pasan a `0`

## 9.3 Actividad de la tarea

Cada tarea muestra historial de actividad con eventos de auditoría.

Ese historial sirve para rastrear:

- cambios de estado
- cambios de campos
- asignaciones
- acciones de sprint
- mensajes

## 9.4 Conversación de tarea

Cada tarea dispone de una sección colaborativa donde se puede:

- leer mensajes
- publicar mensajes nuevos
- responder mensajes
- crear una nueva tarea a partir de un mensaje

Los mensajes se renderizan como Markdown, no como texto plano.

## 9.5 Tareas hijas y trazabilidad

Una tarea puede tener:

- tarea padre
- mensaje origen
- tareas hijas

La vista de tarea muestra:

- referencia a la tarea padre, si existe
- referencia al mensaje origen, si existe
- listado de tareas hijas
- contador de hijos completados

Si una tarea hija está terminada, se marca visualmente como completada.

Al hacer click en una tarea hija se abre su edición.

---

## 10. Actividad e historial

La aplicación registra actividad sobre las entidades principales:

- usuario
- equipo
- producto
- historia
- tarea
- sprint

### Dónde se consulta

- dentro de drawers y páginas de definición de entidades
- en `Admin`, en la sección `Actividad por usuario`

### Qué valor aporta

Permite reconstruir:

- quién hizo el cambio
- cuándo ocurrió
- sobre qué entidad
- qué acción se ejecutó

---

## 11. Usuarios por defecto en entorno local

Si la base fue preparada con el seed por defecto, existen estos usuarios:

| Rol | Usuario | Password |
|---|---|---|
| platform_admin | `admin@scrum.local` | `admin1234` |
| product_owner | `owner@scrum.local` | `owner1234` |
| scrum_master | `scrum@scrum.local` | `scrum1234` |
| team_member | `member@scrum.local` | `member1234` |

Además el seed crea un equipo inicial:

- `Core Team`

con membresía por defecto para:

- `scrum@scrum.local`
- `member@scrum.local`

---

## 12. Recomendaciones operativas

### Para `platform_admin`

- crea equipos antes de incorporar usuarios operativos
- asigna equipos a cada `team_member`
- usa `Admin` para controlar actividad por persona

### Para `product_owner`

- concentra el trabajo en `Productos`, `Backlog`, `Sprints` y `Metricas`
- usa historias para expresar valor y tareas para el trabajo técnico

### Para `scrum_master`

- mantén equipos y vínculos producto-equipo correctos
- opera el board diariamente
- controla bloqueos y cierre real de horas

### Para `team_member`

- trabaja principalmente en:
  - `Backlog` si participa del refinamiento
  - `Tareas de historia`
  - `Board del sprint`
  - `Definición de tarea`
- usa la conversación de tarea para registrar decisiones y dudas

### Para `viewer`

- usa `Resumen`, `Backlog`, `Sprints`, `Board` y `Metricas` sólo como consulta

---

## 13. Resumen práctico por navegación

### Barra superior

- `Inicio`: tablero general
- `Productos`: catálogo y acceso a workspaces
- `Equipos`: gestión de equipos
- `Perfil`: datos personales
- `Admin`: administración global, sólo `platform_admin`

### Dentro de un producto

- `Resumen`: vista ejecutiva
- `Backlog`: historias y priorización
- `Sprints`: planificación y acceso a board
- `Metricas`: indicadores y series

### Edición avanzada

- `Ir a la definicion`: lleva a una vista full-screen para trabajar sin depender del drawer

---

## 14. Criterio general de uso

Si la acción es rápida o contextual, usa drawer.

Si la acción requiere:

- navegación entre entidades
- conversación
- trazabilidad
- edición extensa

usa la página de definición.
