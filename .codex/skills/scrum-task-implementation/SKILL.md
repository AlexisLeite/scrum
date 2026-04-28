---
name: scrum-task-implementation
description: Implementa tareas Scrum de punta a punta en el repo actual usando las herramientas del tablero Scrum. Usa este skill cuando haya que tomar una tarea pendiente, asignar la tarea solicitada por el usuario que no tenga responsable, pasarla a In Progress, implementar exactamente lo pedido en la descripcion o en sus actividades checkbox, validar el resultado, probar tambien la UI o el flujo afectado con Playwright contra el entorno watch cuando corresponda, hacer commit de los cambios con el id de la tarea, cerrar la tarea en Done y publicar un comentario final exhaustivo en markdown con resumen, validaciones, pruebas, actividades y archivos tocados. Asume que es muy probable que haya otros agentes trabajando en paralelo y extrema el cuidado con el estado del repositorio antes, durante y despues de cada edicion.
---

# Scrum Task Implementation

## Flujo

Sigue este flujo completo sin pedir confirmacion adicional salvo que la tarea sea ambigua, contradictoria o requiera una decision de producto no deducible del contexto.

1. Lista las tareas pendientes con el MCP de Scrum.
2. Identifica la tarea indicada por el usuario. Si no indica ninguna, busca la primera tarea sin responsable.
3. Toma esa tarea para el usuario autenticado.
4. Cambia su estado a `In Progress`.
5. Lee los detalles en profundidad de la tarea antes de editar codigo.
6. Incluye en esa lectura la historia, la tarea, los ultimos mensajes y cualquier tarea padre o mensaje padre cuando exista para reconstruir el contexto completo.
7. Si la tarea incluye `activities`, tratalas como la lista ordenada de acciones a ejecutar antes del cierre global.
8. Implementa solo lo que pida la tarea y sus actividades pendientes, respetando el estado actual del worktree.
9. Ejecuta validaciones razonables para el cambio: pruebas focalizadas, lint o build parcial si aplica.
10. Prueba con el MCP de Playwright el flujo afectado en `https://vmi3181573.contaboserver.net:5443/` siempre que el cambio tenga impacto verificable desde UI o navegador.
11. Antes de usar Playwright o probar manualmente en navegador, lee `.codex/local/credentials.toml`, elige `default_role` salvo que la tarea requiera otro rol y usa ese `email` / `password` para iniciar sesion.
12. Haz un commit al finalizar cualquier tarea con cambios de codigo o archivos, incluyendo el id de la tarea en el mensaje de commit.
13. Cambia la tarea a `Done` cuando la implementacion, la validacion y el commit esten terminados.
14. Publica un comentario final en markdown valido, exhaustivo y autocontenido con resumen, justificacion, validaciones, pruebas, actividades, archivos tocados y el id del commit generado.

## Reglas Operativas

- Asume por defecto que hay otros agentes trabajando en paralelo sobre el mismo repositorio.
- No saltes pasos del flujo salvo que una herramienta falle o la tarea ya este en un estado incompatible.
- No tomes una tarea ya asignada a otra persona.
- Si no hay tareas sin responsable, informa ese resultado y deten el flujo.
- Antes de cambiar codigo, revisa `git status --short` y evita tocar archivos con cambios ajenos salvo que la tarea lo exija.
- Repite la inspeccion del worktree antes de aplicar cambios grandes, antes de correr validaciones y antes de cerrar la tarea.
- Si haces cambios, no termines la tarea sin crear un commit propio al final de tu trabajo.
- El mensaje del commit debe incluir de forma visible el id de la tarea para mantener trazabilidad.
- El comentario final de la tarea debe incluir el hash del commit git resultante.
- Nunca reviertas, pises ni reformatees cambios ajenos para "limpiar" el repo.
- Si detectas archivos relacionados con tu tarea que cambiaron mientras trabajabas, relee el contexto y adapta tu implementacion en vez de asumir que tu version local sigue siendo correcta.
- Manten el diff minimo y localizado para reducir conflictos con trabajo concurrente.
- Si la descripcion de la tarea entra en conflicto con el codigo existente o no alcanza para implementar algo con seguridad, deja un comentario explicando el bloqueo en vez de improvisar.
- No marques la tarea como `Done` si no llegaste a implementar o validar el cambio principal.
- Si `readTasks` o `get_task_details` devuelve `activities`, usa cada `activity.id` como referencia unica para esa tarea.
- No marques una actividad como finalizada hasta completar y validar esa accion concreta.
- Cuando una actividad termine bien, llama a `change_task_activity_status` con `checked: true`.
- Si una actividad falla o queda bloqueada, dejala pendiente y publica un comentario indicando el `activity.id`, el texto de la actividad y el motivo.
- Si el cambio afecta una experiencia navegable, usa el MCP de Playwright para probarla contra `https://vmi3181573.contaboserver.net:5443/`.
- Ese entorno corre en modo watch con HMR; aprovecha ese comportamiento para revalidar rapido despues de cada ajuste relevante.
- Las credenciales del entorno de validacion viven en `.codex/local/credentials.toml`, archivo local ignorado por git.
- Si el archivo no existe, si falta `default_role` o si el rol elegido no tiene `email` y `password`, detente y explica el bloqueo en vez de improvisar credenciales.
- El usuario de prueba ya dispone de un producto habilitado para trabajar sin restricciones; usa ese contexto en las pruebas en vez de reconfigurar datos.

## Implementacion

- Usa el contenido de la tarea como fuente de verdad para el alcance.
- Antes de tocar codigo, relee siempre el detalle profundo de la tarea y el contexto conversacional asociado.
- Si la tarea tiene actividades checkbox pendientes, ejecutalas en orden de `itemIndex` respetando `parentActivityId` y `depth`; las ya finalizadas pueden considerarse contexto y no deben reabrirse salvo que la tarea lo pida.
- Tras completar cada actividad pendiente, actualiza su estado con `change_task_activity_status` antes de pasar a la siguiente.
- Si la tarea deriva de otra tarea o de un mensaje, navega tambien esos padres antes de decidir la implementacion.
- Inspecciona primero los archivos y modulos relacionados antes de editar.
- Manten los cambios acotados al problema descrito.
- Si hay senales de trabajo concurrente en los mismos archivos, prioriza integrarte con ese estado en lugar de sobrescribirlo.
- Respeta las convenciones del repo y corre la validacion mas especifica posible para reducir tiempo y ruido.
- Cuando corresponda, valida el flujo afectado de punta a punta con Playwright navegando el entorno remoto en modo watch.
- Documenta en tus notas y en el comentario final que probaste con Playwright, que flujo cubriste y cual fue el resultado.
- Si haces una suposicion relevante, documentala en la respuesta final y en el comentario de la tarea.

## Actividades Checklist

- Las actividades vienen en `task.activities` con `id`, `itemIndex`, `checked`, `text`, `line`, `depth`, `parentActivityId` y `childActivityIds`.
- Trata cada actividad pendiente como una accion verificable dentro de la tarea principal.
- Si `parentActivityId` no es `null`, la actividad es hija de otra actividad y debe interpretarse como un subpaso dentro de esa accion padre.
- Usa `activity.id` al comentar bloqueos o resultados parciales para que otra persona pueda ubicar el checkbox exacto.
- Si no hay actividades, sigue el flujo normal de tarea unica.
- El comentario final debe resumir actividades finalizadas, pendientes o bloqueadas, incluso cuando todas hayan salido bien.

## Credenciales Locales

- Usa `.codex/local/credentials.toml` como fuente de verdad para credenciales locales del repo.
- Ese archivo no se debe versionar; si falta, toma como plantilla `.codex/local/credentials.example.toml`.
- La estructura esperada es un `default_role` y una tabla `[roles.<nombre>]` con `email` y `password` por rol.
- Los roles admitidos en este repo son `scrum_master`, `product_owner`, `team_member` y `quality_assurance`.
- Para pruebas normales, usa `default_role` salvo que la tarea pida explicitamente validar con otro rol.
- Si necesitas inspeccionar el archivo desde shell, usa una lectura local con `python3` y `tomllib`; no copies credenciales a archivos versionados, comentarios de codigo ni commits.

## Validacion Con Playwright

- Usa el MCP de Playwright para navegar a `https://vmi3181573.contaboserver.net:5443/`.
- Lee `.codex/local/credentials.toml`, resuelve el rol a usar y luego inicia sesion con ese `email` / `password`.
- Si el cambio tiene impacto visible o funcional en UI, recorre el flujo afectado y verifica el resultado esperado directamente en navegador.
- Si el cambio no es razonablemente verificable en navegador, deja constancia explicita de por que no correspondia una prueba con Playwright.
- Si Playwright falla por un problema del entorno o de infraestructura, documenta el intento y el bloqueo con suficiente detalle.

## Comentario Final En La Tarea

El comentario final debe ser markdown valido, autocontenido y exhaustivo. Debe explicar que se hizo, por que se implemento de esa manera, que se valido, que pruebas manuales o con Playwright se realizaron y cual fue el commit final. Usa esta estructura base:

```md
## Trabajo realizado

- Implementacion 1
- Implementacion 2

## Actividades

- `activity-id` finalizada: resumen breve
- `activity-id` pendiente o bloqueada: motivo, si aplica

## Decisiones tecnicas

- Decision 1 y motivo
- Decision 2 y motivo

## Validaciones

- `comando o verificacion`
- `resultado resumido`

## Pruebas en entorno

- `Playwright o prueba manual`
- `flujo cubierto y resultado`

## Commit

- `hash-del-commit`

## Archivos tocados

- `ruta/al/archivo1`
- `ruta/al/archivo2`
```

Incluye los archivos realmente modificados, no una lista hipotetica. Si una validacion no pudo correrse, si Playwright no aplicaba o si alguna prueba fallo por el entorno, indicalo explicitamente. El comentario debe permitir que otra persona entienda el alcance completo del trabajo sin releer toda la conversacion.
