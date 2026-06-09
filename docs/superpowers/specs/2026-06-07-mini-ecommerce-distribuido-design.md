# Design — Mini E-commerce Distribuído

**Date:** 2026-06-07  
**Stack:** Node.js + Express  
**Status:** Approved

---

## 1. Architecture Overview

Four independent Node.js/Express services in a single git repository. Each service has its own `package.json`, `node_modules`, and JSON data file(s). Docker Compose orchestrates all of them.

```
mini-e-commerce-distribuido/
├── gateway/            :5000  ← single entry point for all clients
├── users/              :5001  ← auth, JWT issuance
├── products/           :5002  ← products primary replica
│                       :5012  ← products secondary replica (same codebase, different env)
├── orders/             :5003  ← depends on users + products at runtime
├── docker-compose.yml
└── README.md
```

**Communication:** all inter-service calls are plain HTTP. The Gateway proxies requests; Orders calls Users and Products directly during order creation.

**JWT flow:** Users service issues the token on login. Gateway checks the token is present before forwarding. Individual services validate the token fully (Products for admin check, Orders for authenticated routes).

---

## 2. Internal Structure Per Service

Every service follows the same layered layout:

```
<service>/
├── package.json
├── .env.example
├── index.js          ← Express setup, starts server (~20 lines)
├── routes.js         ← Route definitions, attaches middleware
├── controller.js     ← Business logic (no Express objects beyond req/res)
└── db.js             ← Read/write JSON file, returns plain objects
```

- **`index.js`** — creates Express app, registers routes, starts listening.
- **`routes.js`** — mounts endpoints, applies `authMiddleware` where needed. JWT middleware lives here (small enough, no separate file needed).
- **`controller.js`** — business logic. Calls `db.js` for data, calls external services via `axios`. Returns data or throws errors.
- **`db.js`** — two functions: `readDb()` and `writeDb(data)`. Synchronous JSON file read/write (safe for single-process Node at this scale).

**Products exception:** runs as two processes from the same codebase, controlled by env vars:

```
products/
├── db-primary.json    ← used when PORT=5002
└── db-replica.json    ← used when PORT=5012
```

Key env vars that differentiate the two instances:

| Variable | Primary | Replica |
|----------|---------|---------|
| `PORT` | 5002 | 5012 |
| `DB_FILE` | `db-primary.json` | `db-replica.json` |
| `IS_REPLICA` | `false` | `true` |

`IS_REPLICA=true` tells the process to skip write propagation (prevents infinite replication loop).

---

## 3. Key Behaviors & Data Flow

### Heartbeat (Gateway)

- Every 5 seconds, Gateway sends `GET /health` to users, products-primary, and orders.
- Tracks a failure counter per service — after 2 consecutive failures, service is marked `DOWN` and logged with timestamp.
- On recovery, service is marked `UP` and recovery is logged.
- Any request to a `DOWN` service returns `503` immediately without forwarding.

### JWT Validation — Two Levels

- **Gateway:** checks only that the token is *present* in `Authorization: Bearer <token>`. Rejects with `401` if missing. Does not verify the signature. Forwards header intact.
- **Services:** verify JWT signature using `JWT_SECRET`. Routes marked with auth validate fully. Products checks `role === "admin"` for `POST /products`, returning `403` if not.

### Products Write Replication (Strong Consistency)

When the primary receives `POST /products`:
1. Saves to its own `db-primary.json`
2. Forwards the same payload to the replica via `POST /internal/products` on `:5012`
3. Returns `201` only after **both** succeed. If the replica call fails, returns `500`.

Read requests (GET) are distributed between primary and replica via **round-robin** — the gateway alternates between `:5002` and `:5012` on each request.

### Order Creation Flow

`POST /orders` triggers three sequential HTTP calls inside Orders service:
1. `GET /users/:userId` → confirm user exists
2. `GET /products/:productId` → confirm product exists + capture data snapshot
3. Save order locally with snapshot + `createdAt` ISO8601 timestamp

---

## 4. Error Handling & HTTP Conventions

**Standard error shape** across all services:
```json
{ "error": "message describing what went wrong" }
```

**Status code map:**

| Code | When |
|------|------|
| `400` | Missing/invalid fields in request body |
| `401` | Token absent or signature invalid/expired |
| `403` | Valid token but insufficient role |
| `404` | User, product, or order not found |
| `500` | Unexpected error (replica unreachable, file I/O failure) |
| `503` | Gateway: target service is `DOWN` |

**Error propagation in Orders:** if Users or Products returns non-2xx during order creation, Orders returns `400` with the upstream error message. Never exposes internal URLs or stack traces.

**Global error handler:** each `index.js` registers an Express error handler as the last middleware. Catches unhandled errors, returns `500` with a generic message. Stack traces go to `console.error` only.

**Health check** — identical across all services:
```json
GET /health → 200 { "status": "ok" }
```

---

## 5. Docker Setup

Each service has a minimal `Dockerfile` (Node 20 Alpine). Docker Compose wires all services with environment variables and a shared internal network.

**Key compose behaviors:**
- Services communicate via Docker service names (e.g., `http://users:5001`)
- Products runs as **two containers** from the same image: `products-primary` (:5002) and `products-replica` (:5012), each with different env vars and data file paths
- `depends_on` ensures gateway starts after users, products-primary, and orders
- All ports exposed to host for direct `curl`/Postman access

```yaml
# Simplified structure
services:
  gateway:
    ports: ["5000:5000"]
    depends_on: [users, products-primary, orders]
  users:
    ports: ["5001:5001"]
  products-primary:
    ports: ["5002:5002"]
  products-replica:
    ports: ["5012:5012"]
  orders:
    ports: ["5003:5003"]
```

---

## 6. README.md (Portuguese)

The README will include:
- What the system is and why it exists
- Architecture diagram (ASCII)
- Explanation of what replication is and why Products has two instances
- Prerequisites (Docker, Node.js)
- How to run with Docker (`docker-compose up`)
- How to run each service manually (for development)
- `curl` examples for every endpoint (register, login, create product, list products, create order, list orders)

---

## 7. Decisions Log

| Decision | Choice | Reason |
|----------|--------|--------|
| Project structure | Independent `package.json` per service | Realistic microservices isolation without workspace tooling |
| Storage | JSON files | Zero dependencies, simple for a study project |
| Docker | Yes, with `docker-compose.yml` | Easy one-command startup |
| Tests | No | Spec doesn't require them; curl examples in README cover validation |
| Internal structure | Layered (index/routes/controller/db) | Better separation of concerns than a single flat file |
