# Kill processes listening on port `p`

```bash
lsof -tiTCP:p -sTCP:LISTEN | xargs -r kill
```

Force kill if needed:

```bash
lsof -tiTCP:p -sTCP:LISTEN | xargs -r kill -9
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

# Open ssh port on remote postgres

ssh -L 6543:127.0.0.1:5433 usuario@95.111.237.196