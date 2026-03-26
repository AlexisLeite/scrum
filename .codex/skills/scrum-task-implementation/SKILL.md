---
name: scrum-task-implementation
description: Implementa tareas Scrum de punta a punta en el repo actual usando las herramientas del tablero Scrum. Usa este skill cuando haya que tomar una tarea pendiente, asignar la primera que no tenga responsable, pasarla a In Progress, implementar exactamente lo pedido en la descripcion, validar el resultado, cerrar la tarea en Done y publicar un comentario final en markdown con el detalle de lo hecho y los archivos tocados. Asume que es muy probable que haya otros agentes trabajando en paralelo y extrema el cuidado con el estado del repositorio antes, durante y despues de cada edicion.
---

# Scrum Task Implementation

## Flujo

Sigue este flujo completo sin pedir confirmacion adicional salvo que la tarea sea ambigua, contradictoria o requiera una decision de producto no deducible del contexto.

1. Lista las tareas pendientes con el MCP de Scrum.
2. Identifica la primera tarea sin responsable.
3. Toma esa tarea para el usuario autenticado.
4. Cambia su estado a `In Progress`.
5. Lee los detalles en profundidad de la tarea antes de editar codigo.
6. Incluye en esa lectura la historia, la tarea, los ultimos mensajes y cualquier tarea padre o mensaje padre cuando exista para reconstruir el contexto completo.
7. Implementa solo lo que pida la tarea, respetando el estado actual del worktree.
8. Ejecuta validaciones razonables para el cambio: pruebas focalizadas, lint o build parcial si aplica.
9. Cambia la tarea a `Done` cuando la implementacion y la validacion esten terminadas.
10. Publica un comentario final en markdown valido con resumen, validaciones y archivos tocados.

## Reglas Operativas

- Asume por defecto que hay otros agentes trabajando en paralelo sobre el mismo repositorio.
- No saltes pasos del flujo salvo que una herramienta falle o la tarea ya este en un estado incompatible.
- No tomes una tarea ya asignada a otra persona.
- Si no hay tareas sin responsable, informa ese resultado y deten el flujo.
- Antes de cambiar codigo, revisa `git status --short` y evita tocar archivos con cambios ajenos salvo que la tarea lo exija.
- Repite la inspeccion del worktree antes de aplicar cambios grandes, antes de correr validaciones y antes de cerrar la tarea.
- Nunca reviertas, pises ni reformatees cambios ajenos para "limpiar" el repo.
- Si detectas archivos relacionados con tu tarea que cambiaron mientras trabajabas, relee el contexto y adapta tu implementacion en vez de asumir que tu version local sigue siendo correcta.
- Manten el diff minimo y localizado para reducir conflictos con trabajo concurrente.
- Si la descripcion de la tarea entra en conflicto con el codigo existente o no alcanza para implementar algo con seguridad, deja un comentario explicando el bloqueo en vez de improvisar.
- No marques la tarea como `Done` si no llegaste a implementar o validar el cambio principal.

## Implementacion

- Usa el contenido de la tarea como fuente de verdad para el alcance.
- Antes de tocar codigo, relee siempre el detalle profundo de la tarea y el contexto conversacional asociado.
- Si la tarea deriva de otra tarea o de un mensaje, navega tambien esos padres antes de decidir la implementacion.
- Inspecciona primero los archivos y modulos relacionados antes de editar.
- Manten los cambios acotados al problema descrito.
- Si hay senales de trabajo concurrente en los mismos archivos, prioriza integrarte con ese estado en lugar de sobrescribirlo.
- Respeta las convenciones del repo y corre la validacion mas especifica posible para reducir tiempo y ruido.
- Si haces una suposicion relevante, documentala en la respuesta final y en el comentario de la tarea.

## Comentario Final En La Tarea

El comentario final debe ser markdown valido y autocontenido. Usa esta estructura base:

```md
## Trabajo realizado

- Implementacion 1
- Implementacion 2

## Validaciones

- `comando o verificacion`
- `resultado resumido`

## Archivos tocados

- `ruta/al/archivo1`
- `ruta/al/archivo2`
```

Incluye los archivos realmente modificados, no una lista hipotetica. Si una validacion no pudo correrse, indicalo explicitamente.
