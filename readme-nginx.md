# Nginx + Prod/Dev (Scrum)

Este documento resume los comandos operativos para:

- Chequear salud
- Reiniciar aplicaciones
- Hacer build de las aplicaciones

Asume el despliegue actual:

- Web prod servida por nginx: `443`
- API prod interna: `127.0.0.1:3100`
- MCP prod interna: `127.0.0.1:3101`
- Web dev interna: `127.0.0.1:5000`
- API dev interna: `127.0.0.1:5001`
- Puertos externos por nginx: `3000` (api prod), `3001` (mcp prod), `5443` (web dev), `5444` (api dev)

## 1) Chequear salud

### Estado de nginx

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager -n 50
```

### Ver puertos escuchando

```bash
sudo ss -ltnp | grep -E ':443|:3000|:3001|:5443|:5444|:3100|:3101|:5000|:5001'
```

### Probar endpoints publicados por nginx

```bash
curl -k -i https://127.0.0.1/
curl -k -i https://127.0.0.1:3000/
curl -k -i https://127.0.0.1:3001/
curl -k -i https://127.0.0.1:5443/
curl -k -i https://127.0.0.1:5444/
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

### Detener procesos actuales (dev)

```bash
pkill -f 'pnpm --filter @scrum/api dev' || true
pkill -f 'pnpm --filter @scrum/web dev' || true
```

### Levantar prod desde `deploy/`

```bash
cd /root/repos/scrum
pnpm build
```

### Levantar desarrollo con HMR

```bash
cd /root/repos/scrum
pnpm dev
```

### Recargar nginx

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Verificacion rapida post-reinicio

```bash
sudo ss -ltnp | grep -E ':443|:3000|:3001|:5443|:5444|:3100|:3101|:5000|:5001'
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

## 4) Flujo recomendado

```bash
cd /root/repos/scrum
pnpm build

pnpm dev
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
