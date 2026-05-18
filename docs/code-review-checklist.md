# Code Review Checklist

Items to check before merging a pull request

---

## Must-check

- [ ] **Type safety** — no `any`; use `unknown` plus type guards
- [ ] **Error handling** — every `catch` block handles the error; no empty catches
- [ ] **Input validation** — user input validated with Zod schemas
- [ ] **Logging** — no sensitive data (passwords, tokens) in log output
- [ ] **Tests** — new behavior covered by unit or integration tests

---

## Security

- [ ] **SQL** — parameterized queries only; no string concatenation
- [ ] **File uploads** — MIME type and size validated
- [ ] **Auth middleware** — sensitive endpoints protected
- [ ] **Rate limiting** — login, upload, and other high-risk endpoints throttled

---

## Performance

- [ ] **Queries** — include `WHERE` clauses; large datasets paginated
- [ ] **Async** — `async`/`await` throughout; no synchronous blocking calls
- [ ] **Resource cleanup** — connections, timers, and streams properly closed

---

## Code quality

- [ ] **Naming** — variable and function names express intent clearly
- [ ] **Function length** — single function ≤ 80 lines
- [ ] **Comments** — complex logic explained inline
- [ ] **Imports** — relative paths use `.js` suffix per ESM convention
