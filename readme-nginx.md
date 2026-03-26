# Nginx + Produccion (Scrum)

Este documento resume los comandos operativos para:

- Chequear salud
- Reiniciar aplicaciones
- Hacer build de las aplicaciones

Asume el despliegue actual:

- API interna: `127.0.0.1:3100`
- MCP interno: `127.0.0.1:3101`
- Frontend interno (preview): `127.0.0.1:4173`
- Puertos externos por nginx: `3000` (api), `3001` (mcp), `5173` (frontend)

## 1) Chequear salud

### Estado de nginx

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager -n 50
```

### Ver puertos escuchando

```bash
sudo ss -ltnp | grep -E ':3000|:3001|:5173|:3100|:3101|:4173|:80'
```

### Probar endpoints publicados por nginx

```bash
curl -i http://127.0.0.1:5173/
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3001/
```

Notas esperadas:

- Frontend suele responder `200`.
- API en `/` puede responder `404` si no existe ruta raiz (esto puede ser normal).
- MCP en `/` puede responder `401` sin `x-api-key` (tambien puede ser normal).

### Revisar logs

```bash
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

## 2) Reiniciar aplicaciones

### Detener procesos actuales (api/mcp + frontend preview)

```bash
pkill -f 'node dist/src/main.js' || true
pkill -f 'vite preview --host 127.0.0.1 --port 4173' || true
```

### Levantar API + MCP en produccion

```bash
cd /root/repos/scrum/apps/api
set -a
source /root/repos/scrum/.env
set +a
export PORT=3100
export MCP_PORT=3101
nohup node dist/src/main.js >/tmp/scrum-api.log 2>&1 &
```

### Levantar Frontend en produccion (preview)

```bash
cd /root/repos/scrum
nohup pnpm --filter @scrum/web preview --host 127.0.0.1 --port 4173 >/tmp/scrum-web.log 2>&1 &
```

### Recargar nginx

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Verificacion rapida post-reinicio

```bash
sudo ss -ltnp | grep -E ':3000|:3001|:5173|:3100|:3101|:4173'
```

## 3) Build de las aplicaciones

### Build completo del monorepo

```bash
cd /root/repos/scrum
pnpm build
```

### Build por aplicacion (opcional)

```bash
cd /root/repos/scrum/apps/api
pnpm build

cd /root/repos/scrum/apps/web
pnpm build
```

## 4) Flujo recomendado (build + restart)

```bash
cd /root/repos/scrum
pnpm build

pkill -f 'node dist/src/main.js' || true
pkill -f 'vite preview --host 127.0.0.1 --port 4173' || true

cd /root/repos/scrum/apps/api
set -a
source /root/repos/scrum/.env
set +a
export PORT=3100
export MCP_PORT=3101
nohup node dist/src/main.js >/tmp/scrum-api.log 2>&1 &

cd /root/repos/scrum
nohup pnpm --filter @scrum/web preview --host 127.0.0.1 --port 4173 >/tmp/scrum-web.log 2>&1 &

sudo nginx -t && sudo systemctl reload nginx
```

## 5) Si aparece error de permisos

Ejecuta con `sudo` solo lo que realmente lo requiere:

- nginx (`nginx -t`, `systemctl reload/status`)
- lectura de logs de `/var/log/nginx`

Si no tienes permisos para puertos/procesos del sistema:

```bash
sudo -v
sudo systemctl status nginx
```
