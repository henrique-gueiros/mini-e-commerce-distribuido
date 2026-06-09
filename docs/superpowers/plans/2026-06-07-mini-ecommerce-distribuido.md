# Mini E-commerce Distribuído — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a distributed mini e-commerce system with four Express/Node.js microservices (gateway, users, products, orders), JSON file storage, JWT authentication, products replication, and Docker Compose orchestration.

**Architecture:** Single git repository with four independent Node.js services, each with its own `package.json` and JSON data file. All external traffic enters through the API Gateway (:5000), which checks JWT presence and proxies to the correct service. The products service runs as two instances (primary :5002, replica :5012) for strong-consistency write replication and round-robin reads.

**Tech Stack:** Node.js 20, Express 4, jsonwebtoken, bcrypt, axios, uuid, dotenv, Docker (node:20-alpine)

---

## File Structure

```
mini-e-commerce-distribuido/
├── users/
│   ├── package.json
│   ├── .env.example
│   ├── index.js          ← Express app + server start
│   ├── routes.js         ← Route definitions + JWT middleware
│   ├── controller.js     ← register / login / getUser logic
│   ├── db.js             ← readDb() / writeDb() for users.json
│   └── db.json           ← persistent data (starts as [])
├── products/
│   ├── package.json
│   ├── .env.example
│   ├── index.js
│   ├── routes.js         ← Route definitions + JWT + admin middleware
│   ├── controller.js     ← listProducts / getProduct / createProduct / internalCreate
│   ├── db.js             ← readDb() / writeDb() using DB_FILE env var
│   ├── db-primary.json   ← data for primary instance
│   └── db-replica.json   ← data for replica instance
├── orders/
│   ├── package.json
│   ├── .env.example
│   ├── index.js
│   ├── routes.js
│   ├── controller.js     ← createOrder / getOrders (calls users + products)
│   ├── db.js
│   └── db.json
├── gateway/
│   ├── package.json
│   ├── .env.example
│   ├── index.js
│   ├── routes.js         ← Proxy routes + JWT presence check
│   └── controller.js     ← Heartbeat, round-robin, proxyRequest()
├── docker-compose.yml
└── README.md
```

---

## Task 1: Users Service

**Files:**
- Create: `users/package.json`
- Create: `users/.env.example`
- Create: `users/db.json`
- Create: `users/db.js`
- Create: `users/controller.js`
- Create: `users/routes.js`
- Create: `users/index.js`

- [ ] **Step 1.1 — Create `users/package.json`**

```json
{
  "name": "users",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.0"
  }
}
```

- [ ] **Step 1.2 — Install dependencies**

Run from `users/`:
```bash
npm install
```

- [ ] **Step 1.3 — Create `users/.env.example`**

```
JWT_SECRET=your_secret_here
PORT=5001
```

- [ ] **Step 1.4 — Create `users/db.json`**

```json
[]
```

- [ ] **Step 1.5 — Create `users/db.js`**

```javascript
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDb() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
```

- [ ] **Step 1.6 — Create `users/controller.js`**

```javascript
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { readDb, writeDb } = require('./db');

async function register(req, res) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  const users = readDb();
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'email already in use' });
  }
  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hash,
    role: role === 'admin' ? 'admin' : 'user',
  };
  users.push(user);
  writeDb(users);
  return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const users = readDb();
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  return res.json({ token });
}

function getUser(req, res) {
  const user = readDb().find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'user not found' });
  }
  return res.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}

module.exports = { register, login, getUser };
```

- [ ] **Step 1.7 — Create `users/routes.js`**

```javascript
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const controller = require('./controller');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid token' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

router.post('/users/register', controller.register);
router.post('/users/login', controller.login);
router.get('/users/:id', authMiddleware, controller.getUser);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
```

- [ ] **Step 1.8 — Create `users/index.js`**

```javascript
require('dotenv').config();
const express = require('express');
const routes = require('./routes');

const app = express();
app.use(express.json());
app.use(routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`users service running on :${PORT}`));
```

- [ ] **Step 1.9 — Create `.env` from example and smoke-test**

```bash
# in users/
cp .env.example .env
# edit .env: set JWT_SECRET=supersecret
node index.js
```

In another terminal:
```bash
curl http://localhost:5001/health
# Expected: {"status":"ok"}
```

---

## Task 2: Products Service

**Files:**
- Create: `products/package.json`
- Create: `products/.env.example`
- Create: `products/db-primary.json`
- Create: `products/db-replica.json`
- Create: `products/db.js`
- Create: `products/controller.js`
- Create: `products/routes.js`
- Create: `products/index.js`

- [ ] **Step 2.1 — Create `products/package.json`**

```json
{
  "name": "products",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.0"
  }
}
```

- [ ] **Step 2.2 — Install dependencies**

```bash
npm install
```

- [ ] **Step 2.3 — Create `products/.env.example`**

```
JWT_SECRET=your_secret_here
PORT=5002
DB_FILE=db-primary.json
IS_REPLICA=false
PRODUCTS_REPLICA_URL=http://localhost:5012
```

- [ ] **Step 2.4 — Create `products/db-primary.json` and `products/db-replica.json`**

Both files:
```json
[]
```

- [ ] **Step 2.5 — Create `products/db.js`**

```javascript
const fs = require('fs');
const path = require('path');

function getDbPath() {
  return path.join(__dirname, process.env.DB_FILE || 'db-primary.json');
}

function readDb() {
  const p = getDbPath();
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeDb(data) {
  fs.writeFileSync(getDbPath(), JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
```

- [ ] **Step 2.6 — Create `products/controller.js`**

```javascript
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { readDb, writeDb } = require('./db');

function listProducts(req, res) {
  return res.json(readDb());
}

function getProduct(req, res) {
  const product = readDb().find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'product not found' });
  return res.json(product);
}

async function createProduct(req, res) {
  const { name, price, stock } = req.body;
  if (!name || price == null || stock == null) {
    return res.status(400).json({ error: 'name, price and stock are required' });
  }
  const product = { id: uuidv4(), name, price, stock };
  const products = readDb();
  products.push(product);
  writeDb(products);

  if (process.env.IS_REPLICA !== 'true' && process.env.PRODUCTS_REPLICA_URL) {
    try {
      await axios.post(`${process.env.PRODUCTS_REPLICA_URL}/internal/products`, product);
    } catch {
      return res.status(500).json({ error: 'failed to replicate to secondary' });
    }
  }

  return res.status(201).json(product);
}

function internalCreate(req, res) {
  const product = req.body;
  const products = readDb();
  products.push(product);
  writeDb(products);
  return res.status(201).json(product);
}

module.exports = { listProducts, getProduct, createProduct, internalCreate };
```

- [ ] **Step 2.7 — Create `products/routes.js`**

```javascript
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const controller = require('./controller');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid token' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'admin role required' });
  }
  next();
}

router.get('/products', controller.listProducts);
router.get('/products/:id', controller.getProduct);
router.post('/products', authMiddleware, adminMiddleware, controller.createProduct);
router.post('/internal/products', controller.internalCreate);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
```

- [ ] **Step 2.8 — Create `products/index.js`**

```javascript
require('dotenv').config();
const express = require('express');
const routes = require('./routes');

const app = express();
app.use(express.json());
app.use(routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`products service running on :${PORT}`));
```

- [ ] **Step 2.9 — Smoke-test primary and replica**

Terminal 1 (primary):
```bash
# in products/
cp .env.example .env
# edit .env: JWT_SECRET=supersecret, PORT=5002, IS_REPLICA=false
node index.js
```

Terminal 2 (replica):
```bash
# in products/
PORT=5012 DB_FILE=db-replica.json IS_REPLICA=true JWT_SECRET=supersecret node index.js
```

Verify both:
```bash
curl http://localhost:5002/health
# Expected: {"status":"ok"}

curl http://localhost:5012/health
# Expected: {"status":"ok"}
```

---

## Task 3: Orders Service

**Files:**
- Create: `orders/package.json`
- Create: `orders/.env.example`
- Create: `orders/db.json`
- Create: `orders/db.js`
- Create: `orders/controller.js`
- Create: `orders/routes.js`
- Create: `orders/index.js`

- [ ] **Step 3.1 — Create `orders/package.json`**

```json
{
  "name": "orders",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.2",
    "uuid": "^9.0.0"
  }
}
```

- [ ] **Step 3.2 — Install dependencies**

```bash
npm install
```

- [ ] **Step 3.3 — Create `orders/.env.example`**

```
JWT_SECRET=your_secret_here
PORT=5003
USERS_URL=http://localhost:5001
PRODUCTS_URL=http://localhost:5002
```

- [ ] **Step 3.4 — Create `orders/db.json`**

```json
[]
```

- [ ] **Step 3.5 — Create `orders/db.js`**

```javascript
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function readDb() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { readDb, writeDb };
```

- [ ] **Step 3.6 — Create `orders/controller.js`**

```javascript
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { readDb, writeDb } = require('./db');

async function createOrder(req, res) {
  const { userId, productId, quantity } = req.body;
  if (!userId || !productId || quantity == null) {
    return res.status(400).json({ error: 'userId, productId and quantity are required' });
  }

  let user, product;

  try {
    const { data } = await axios.get(`${process.env.USERS_URL}/users/${userId}`, {
      headers: { authorization: req.headers.authorization },
    });
    user = data;
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(400).json({ error: 'user not found' });
    }
    return res.status(400).json({ error: 'could not validate user' });
  }

  try {
    const { data } = await axios.get(`${process.env.PRODUCTS_URL}/products/${productId}`);
    product = data;
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(400).json({ error: 'product not found' });
    }
    return res.status(400).json({ error: 'could not validate product' });
  }

  const order = {
    id: uuidv4(),
    userId,
    productId,
    quantity,
    userSnapshot: user,
    productSnapshot: product,
    createdAt: new Date().toISOString(),
  };

  const orders = readDb();
  orders.push(order);
  writeDb(orders);
  return res.status(201).json(order);
}

function getOrders(req, res) {
  const orders = readDb().filter(o => o.userId === req.params.userId);
  return res.json(orders);
}

module.exports = { createOrder, getOrders };
```

- [ ] **Step 3.7 — Create `orders/routes.js`**

```javascript
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const controller = require('./controller');

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing or invalid token' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

router.post('/orders', authMiddleware, controller.createOrder);
router.get('/orders/:userId', authMiddleware, controller.getOrders);
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
```

- [ ] **Step 3.8 — Create `orders/index.js`**

```javascript
require('dotenv').config();
const express = require('express');
const routes = require('./routes');

const app = express();
app.use(express.json());
app.use(routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => console.log(`orders service running on :${PORT}`));
```

- [ ] **Step 3.9 — Smoke-test**

```bash
# in orders/
cp .env.example .env
# edit .env: JWT_SECRET=supersecret
node index.js
```

```bash
curl http://localhost:5003/health
# Expected: {"status":"ok"}
```

---

## Task 4: API Gateway

**Files:**
- Create: `gateway/package.json`
- Create: `gateway/.env.example`
- Create: `gateway/controller.js`
- Create: `gateway/routes.js`
- Create: `gateway/index.js`

- [ ] **Step 4.1 — Create `gateway/package.json`**

```json
{
  "name": "gateway",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "axios": "^1.6.2",
    "dotenv": "^16.3.1",
    "express": "^4.18.2"
  }
}
```

- [ ] **Step 4.2 — Install dependencies**

```bash
npm install
```

- [ ] **Step 4.3 — Create `gateway/.env.example`**

```
PORT=5000
JWT_SECRET=your_secret_here
USERS_URL=http://localhost:5001
PRODUCTS_URL=http://localhost:5002
PRODUCTS_REPLICA_URL=http://localhost:5012
ORDERS_URL=http://localhost:5003
```

- [ ] **Step 4.4 — Create `gateway/controller.js`**

```javascript
const axios = require('axios');

const serviceUrls = {
  users: () => process.env.USERS_URL,
  products: () => process.env.PRODUCTS_URL,
  orders: () => process.env.ORDERS_URL,
};

const status = { users: 'UP', products: 'UP', orders: 'UP' };
const failureCount = { users: 0, products: 0, orders: 0 };
let productRoundRobin = 0;

function getProductsUrl() {
  const urls = [process.env.PRODUCTS_URL, process.env.PRODUCTS_REPLICA_URL].filter(Boolean);
  const url = urls[productRoundRobin % urls.length];
  productRoundRobin++;
  return url;
}

async function pingService(name, url) {
  try {
    await axios.get(`${url}/health`, { timeout: 3000 });
    if (status[name] === 'DOWN') {
      console.log(`[${new Date().toISOString()}] ${name} recovered (UP)`);
    }
    status[name] = 'UP';
    failureCount[name] = 0;
  } catch {
    failureCount[name]++;
    if (failureCount[name] >= 2 && status[name] !== 'DOWN') {
      status[name] = 'DOWN';
      console.log(`[${new Date().toISOString()}] ${name} is DOWN`);
    }
  }
}

function startHeartbeat() {
  setInterval(() => {
    pingService('users', process.env.USERS_URL);
    pingService('products', process.env.PRODUCTS_URL);
    pingService('orders', process.env.ORDERS_URL);
  }, 5000);
}

async function proxyRequest(serviceName, targetUrl, req, res) {
  if (status[serviceName] === 'DOWN') {
    return res.status(503).json({ error: `${serviceName} service unavailable` });
  }
  try {
    const { host, 'content-length': _cl, ...forwardHeaders } = req.headers;
    const response = await axios({
      method: req.method,
      url: `${targetUrl}${req.path}`,
      headers: forwardHeaders,
      data: req.body,
      params: req.query,
    });
    return res.status(response.status).json(response.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(503).json({ error: `${serviceName} service unavailable` });
  }
}

module.exports = { startHeartbeat, proxyRequest, getProductsUrl, status };
```

- [ ] **Step 4.5 — Create `gateway/routes.js`**

```javascript
const router = require('express').Router();
const { proxyRequest, getProductsUrl } = require('./controller');

function requireToken(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing authorization token' });
  }
  next();
}

// Users — public
router.post('/users/register', (req, res) =>
  proxyRequest('users', process.env.USERS_URL, req, res));
router.post('/users/login', (req, res) =>
  proxyRequest('users', process.env.USERS_URL, req, res));

// Users — protected
router.get('/users/:id', requireToken, (req, res) =>
  proxyRequest('users', process.env.USERS_URL, req, res));

// Products — public reads (round-robin between primary and replica)
router.get('/products', (req, res) =>
  proxyRequest('products', getProductsUrl(), req, res));
router.get('/products/:id', (req, res) =>
  proxyRequest('products', getProductsUrl(), req, res));

// Products — protected write (always to primary)
router.post('/products', requireToken, (req, res) =>
  proxyRequest('products', process.env.PRODUCTS_URL, req, res));

// Orders — protected
router.post('/orders', requireToken, (req, res) =>
  proxyRequest('orders', process.env.ORDERS_URL, req, res));
router.get('/orders/:userId', requireToken, (req, res) =>
  proxyRequest('orders', process.env.ORDERS_URL, req, res));

// Gateway health
router.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = router;
```

- [ ] **Step 4.6 — Create `gateway/index.js`**

```javascript
require('dotenv').config();
const express = require('express');
const routes = require('./routes');
const { startHeartbeat } = require('./controller');

const app = express();
app.use(express.json());
app.use(routes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`gateway running on :${PORT}`);
  startHeartbeat();
});
```

- [ ] **Step 4.7 — Smoke-test the full system (manual)**

With users, products (primary + replica), and orders already running:

```bash
# in gateway/
cp .env.example .env
# edit .env with correct values
node index.js
```

```bash
curl http://localhost:5000/health
# Expected: {"status":"ok"}

# Register a user
curl -X POST http://localhost:5000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","password":"123456","role":"admin"}'

# Login
curl -X POST http://localhost:5000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'
# Save the token from the response

# Create product (replace TOKEN with actual value)
curl -X POST http://localhost:5000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Notebook","price":3500,"stock":10}'

# List products (round-robin — run twice to hit both replicas)
curl http://localhost:5000/products
curl http://localhost:5000/products
```

---

## Task 5: Docker Setup

**Files:**
- Create: `users/Dockerfile`
- Create: `products/Dockerfile`
- Create: `orders/Dockerfile`
- Create: `gateway/Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 5.1 — Create `users/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
```

- [ ] **Step 5.2 — Create `products/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
```

- [ ] **Step 5.3 — Create `orders/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
```

- [ ] **Step 5.4 — Create `gateway/Dockerfile`**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY . .
CMD ["node", "index.js"]
```

- [ ] **Step 5.5 — Create `docker-compose.yml`**

```yaml
version: '3.8'

services:
  users:
    build: ./users
    ports:
      - "5001:5001"
    environment:
      PORT: 5001
      JWT_SECRET: supersecret

  products-primary:
    build: ./products
    ports:
      - "5002:5002"
    environment:
      PORT: 5002
      JWT_SECRET: supersecret
      DB_FILE: db-primary.json
      IS_REPLICA: "false"
      PRODUCTS_REPLICA_URL: http://products-replica:5012

  products-replica:
    build: ./products
    ports:
      - "5012:5012"
    environment:
      PORT: 5012
      JWT_SECRET: supersecret
      DB_FILE: db-replica.json
      IS_REPLICA: "true"

  orders:
    build: ./orders
    ports:
      - "5003:5003"
    environment:
      PORT: 5003
      JWT_SECRET: supersecret
      USERS_URL: http://users:5001
      PRODUCTS_URL: http://products-primary:5002
    depends_on:
      - users
      - products-primary

  gateway:
    build: ./gateway
    ports:
      - "5000:5000"
    environment:
      PORT: 5000
      JWT_SECRET: supersecret
      USERS_URL: http://users:5001
      PRODUCTS_URL: http://products-primary:5002
      PRODUCTS_REPLICA_URL: http://products-replica:5012
      ORDERS_URL: http://orders:5003
    depends_on:
      - users
      - products-primary
      - products-replica
      - orders
```

- [ ] **Step 5.6 — Smoke-test Docker build**

From the project root:
```bash
docker-compose up --build
```

Wait for all 5 services to print their startup messages, then:
```bash
curl http://localhost:5000/health
# Expected: {"status":"ok"}
```

---

## Task 6: README.md (Portuguese)

**Files:**
- Create: `README.md`

- [ ] **Step 6.1 — Create `README.md`**

```markdown
# Mini E-commerce Distribuído

Sistema de e-commerce distribuído composto por quatro microsserviços independentes que se comunicam via HTTP/REST, com autenticação JWT e replicação no serviço de produtos.

---

## Arquitetura

```
Cliente (curl / Postman)
         │
┌────────▼───────────┐
│    API Gateway     │  :5000  ← ponto de entrada único
└──┬─────────┬───────┘
   │         │         │
┌──▼──┐  ┌───▼──┐  ┌───▼────┐
│Users│  │Prods │  │Orders  │
│:5001│  │:5002 │  │:5003   │
└─────┘  └──┬───┘  └────────┘
            │
       ┌────▼────┐
       │ Réplica │
       │  :5012  │
       └─────────┘
```

Todos os requests externos passam pelo **API Gateway** (:5000), que verifica a presença do token JWT e repassa ao microsserviço correto.

---

## O que é Replicação? (Serviço de Produtos)

O serviço de Produtos possui **duas instâncias** rodando ao mesmo tempo:

- **Primária** (porta 5002): recebe todas as escritas
- **Réplica** (porta 5012): cópia sincronizada da primária

### Escrita (POST /products) — Consistência Forte

Toda vez que um produto é criado, o seguinte acontece:

```
1. Primária recebe o produto e salva localmente
2. Primária replica o produto para a instância réplica
3. Só retorna 201 quando AMBAS confirmaram o salvamento
```

Isso garante que os dados estejam sempre idênticos nas duas instâncias — nunca uma réplica desatualizada.

### Leitura (GET /products) — Round-Robin

As requisições de leitura são distribuídas alternadamente entre as duas instâncias:

```
1ª requisição → Primária  (:5002)
2ª requisição → Réplica   (:5012)
3ª requisição → Primária  (:5002)
...
```

Isso distribui a carga de leitura entre os dois servidores.

---

## Pré-requisitos

- [Docker](https://www.docker.com/) e Docker Compose instalados
- (Opcional, para rodar sem Docker) Node.js 20+

---

## Rodando com Docker

```bash
docker-compose up --build
```

Aguarde todos os 5 serviços iniciarem. O gateway estará disponível em `http://localhost:5000`.

Para parar tudo:
```bash
docker-compose down
```

---

## Rodando Manualmente (sem Docker)

Crie um arquivo `.env` em cada serviço copiando o `.env.example` e preenchendo os valores. Abra 5 terminais:

```bash
# Terminal 1 — Users
cd users && npm install && node index.js

# Terminal 2 — Products (Primária)
cd products && npm install && \
  PORT=5002 DB_FILE=db-primary.json IS_REPLICA=false \
  PRODUCTS_REPLICA_URL=http://localhost:5012 \
  JWT_SECRET=supersecret node index.js

# Terminal 3 — Products (Réplica)
cd products && \
  PORT=5012 DB_FILE=db-replica.json IS_REPLICA=true \
  JWT_SECRET=supersecret node index.js

# Terminal 4 — Orders
cd orders && npm install && node index.js

# Terminal 5 — Gateway
cd gateway && npm install && node index.js
```

---

## Variáveis de Ambiente

| Variável | Serviço | Descrição |
|----------|---------|-----------|
| `JWT_SECRET` | todos | Chave de assinatura JWT |
| `PORT` | todos | Porta do serviço |
| `USERS_URL` | gateway, orders | URL do serviço de usuários |
| `PRODUCTS_URL` | gateway, orders | URL do serviço de produtos (primária) |
| `PRODUCTS_REPLICA_URL` | gateway, products | URL da réplica de produtos |
| `ORDERS_URL` | gateway | URL do serviço de pedidos |
| `DB_FILE` | products | Arquivo de dados (primária ou réplica) |
| `IS_REPLICA` | products | `true` na réplica — impede propagação infinita |

---

## Exemplos de Uso (curl)

### 1. Registrar usuário comum

```bash
curl -X POST http://localhost:5000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name": "João", "email": "joao@email.com", "password": "123456", "role": "user"}'
```

### 2. Registrar admin

```bash
curl -X POST http://localhost:5000/users/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Admin", "email": "admin@email.com", "password": "admin123", "role": "admin"}'
```

### 3. Login

```bash
curl -X POST http://localhost:5000/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@email.com", "password": "admin123"}'
# Resposta: {"token": "<jwt>"}
```

Guarde o token retornado — você precisará dele nas próximas requisições.

### 4. Buscar dados do usuário

```bash
curl http://localhost:5000/users/<userId> \
  -H "Authorization: Bearer <token>"
```

### 5. Criar produto (requer token de admin)

```bash
curl -X POST http://localhost:5000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "Notebook", "price": 3500.00, "stock": 10}'
```

### 6. Listar todos os produtos

```bash
curl http://localhost:5000/products
```

Execute duas vezes para ver o round-robin em ação — o gateway alternará entre primária e réplica.

### 7. Buscar produto por ID

```bash
curl http://localhost:5000/products/<productId>
```

### 8. Criar pedido (requer token)

```bash
curl -X POST http://localhost:5000/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"userId": "<userId>", "productId": "<productId>", "quantity": 2}'
```

### 9. Listar pedidos do usuário

```bash
curl http://localhost:5000/orders/<userId> \
  -H "Authorization: Bearer <token>"
```

---

## Respostas de Erro

| Código | Situação |
|--------|----------|
| 400 | Payload inválido ou campo obrigatório ausente |
| 401 | Token ausente ou inválido/expirado |
| 403 | Permissão insuficiente (ex: não-admin tentando criar produto) |
| 404 | Recurso não encontrado |
| 503 | Serviço indisponível (heartbeat detectou falha) |
```
```

- [ ] **Step 6.2 — Verify README renders correctly**

Open `README.md` in a Markdown viewer and confirm all code blocks, tables, and the ASCII diagram display correctly.

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Gateway heartbeat (5s interval, 2 failures → DOWN, recovery logging): Task 4, `controller.js`
  - Gateway 503 on DOWN service: `proxyRequest()` in `controller.js`
  - JWT presence check at gateway: `requireToken` in `gateway/routes.js`
  - Users register/login/getUser + bcrypt + email uniqueness: Task 1
  - Products CRUD + strong consistency replication + round-robin reads: Task 2 + Task 4
  - Orders create with user/product validation + snapshot: Task 3
  - All `/health` endpoints: included in every `routes.js`
  - Docker Compose with 5 containers: Task 5
  - README in Portuguese with replication explanation: Task 6

- [x] **No placeholders** — all steps contain complete code

- [x] **Type consistency** — `readDb`/`writeDb` named consistently in all services; `proxyRequest(serviceName, targetUrl, req, res)` signature consistent across all gateway route calls
```
