# Troubleshooting

Common errors and how to fix them

---

## Startup errors

**`EADDRINUSE`** — something already owns that port.

```bash
lsof -i :3000
kill -9 <PID>
```

**`SQLITE_CANTOPEN`** — the data directory doesn't exist or lacks write permission.

```bash
mkdir -p data && chmod 755 data
```

**`ECONNREFUSED` connecting to MySQL** — MySQL isn't running or `.env` points to the wrong host.

- Verify MySQL is up: `mysqladmin ping -h 127.0.0.1 -u root -p`
- Check `.env` values for `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`

**`JWT_SECRET too short`** — your secret must be at least 32 characters.

Generate one quickly:

```bash
openssl rand -hex 32
```

Then paste it into `.env` as `JWT_SECRET=<value>`.

---

## Test failures

**Unit tests failing** — run with verbose output to see the stack trace.

```bash
pnpm test:unit
```

**Integration tests can't connect** — the test runner expects a reachable database.

- Use SQLite in-memory mode for local runs: set `DB_CLIENT=sqlite3` and `DB_FILENAME=:memory:`
- Or confirm MySQL is running and credentials in `.env.test` are correct

**Tests timing out** — often caused by a stale process holding a port.

```bash
lsof -i :3000 -i :3001 -i :50051
# kill any leftover node processes on those ports
```

---

## Deployment

**Docker build fails** — mismatched pnpm version is the usual suspect.

```bash
corepack enable && corepack prepare pnpm@latest --activate
```

**Health check failing** — the container's healthcheck URL or port may not match the app.

- Confirm the `HEALTHCHECK` instruction uses the same port as `PORT` in `.env`
- Check with: `curl http://localhost:<PORT>/health`

**gRPC connection refused** — the machine service hasn't registered with the manager.

- Verify the machine service is running: check its logs for `gRPC server started`
- Confirm `MACHINE_SERVICE_URL` in `.env` matches the machine service address

---

## Development

**`pnpm build` type errors** — most often caused by missing `.js` extensions in imports.

```ts
// wrong
import { foo } from './utils'

// correct (ESM)
import { foo } from './utils.js'
```

Also check that your TypeScript version matches `package.json`.

**Hot reload not working** — make sure `pnpm dev` is running, not `pnpm start`.
