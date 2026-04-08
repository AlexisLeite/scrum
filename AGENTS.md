# AGENTS

## Entorno de desarrollo

- El server de desarrollo ya está levantado en `https://vmi3181573.contaboserver.net:5443`.
- Está corriendo en modo watch, por lo que no es necesario levantarlo nuevamente.

## Credenciales locales

Las credenciales de prueba no deben quedar en archivos versionados.

- Configuralas en el archivo local `.codex/local/credentials.toml`.
- Ese archivo esta ignorado por git y no se debe commitear.
- Puedes partir de `.codex/local/credentials.example.toml`.
- Los roles validos son `scrum_master`, `product_owner`, `team_member` y `quality_assurance`.
- Define un par `email` / `password` para cada rol que necesites usar.
- Usa `default_role` para indicar que rol debe tomar el agente por defecto al validar con Playwright o al iniciar sesion manualmente.

Ejemplo de estructura:

```toml
default_role = "scrum_master"

[roles.scrum_master]
email = "completar"
password = "completar"

[roles.product_owner]
email = "completar"
password = "completar"

[roles.team_member]
email = "completar"
password = "completar"

[roles.quality_assurance]
email = "completar"
password = "completar"
```

## Playwright

- Prioriza las credenciales de `.codex/local/credentials.toml` para cualquier validación autenticada.
- En este repo `Playwright` no está instalado como dependencia fija, así que para pruebas por consola conviene usar un paquete temporal y el navegador del sistema.
- El navegador disponible y validado en este entorno es `/usr/bin/google-chrome`.
- Al automatizar contra `https://vmi3181573.contaboserver.net:5443`, usa `--ignore-certificate-errors` porque el entorno remoto puede presentar advertencias de certificado.
- No asumas que un login exitoso siempre redirige fuera de `/login` o deja cookies visibles. En este entorno hubo casos donde la autenticación respondió bien pero la URL no cambió inmediatamente. Verifica también contenido autenticado real en pantalla.
- Si una vista no muestra datos suficientes para validar layout, documenta explícitamente esa limitación del entorno en lugar de inventar datos o alterar contenido productivo.
