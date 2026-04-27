# Kill processes listening on port `8989`

```bash
sudo kill -9 "$(sudo ss -lptn 'sport = :8989' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -n1)"
```

# Read watch console status

Read the latest 10 lines from the development watch console exposed by `AGENTS.md`:

```bash
printf 'read()\n' | nc 127.0.0.1 7777
```

Read more context when needed, for example the latest 25 lines:

```bash
printf 'read(25)\n' | nc 127.0.0.1 7777
```

Use this remote stream first when checking TypeScript/watch status, before running extra commands like `pnpm typecheck`, `turbo run typecheck`, or `tsc`.

# Dump of postgres database

ssh ...@95.111.237.196 'PGPASSWORD="..." pg_dump -h 127.0.0.1 -p 5433 -U postgres -d gym_management' > dump.sq
l

# Open ssh port on remote postgres

ssh -L 6543:127.0.0.1:5433 usuario@95.111.237.196