# Kill processes listening on port `p`

```bash
lsof -tiTCP:p -sTCP:LISTEN | xargs -r kill
```

Force kill if needed:

```bash
lsof -tiTCP:p -sTCP:LISTEN | xargs -r kill -9
```
