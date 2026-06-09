# SPEC — Mini E-commerce Distribuído

## Visão Geral

Sistema de e-commerce mínimo composto por quatro componentes: um API Gateway e três microsserviços independentes (Usuários, Produtos e Pedidos). Cada serviço possui seu próprio armazenamento de dados e se comunica via HTTP/REST.

---

## Arquitetura

```
Cliente (curl / Postman / script)
         │
┌────────▼───────────┐
│    API Gateway     │  :5000  ← ponto de entrada único
└──┬─────────┬───────┘
   │         │         │
┌──▼──┐  ┌───▼──┐  ┌───▼────┐
│Users│  │Prods │  │Orders  │
│:5001│  │:5002 │  │:5003   │
└─────┘  └──────┘  └────────┘
              │
         ┌────▼────┐
         │Replica  │
         │:5012    │
         └─────────┘
```

---

## Componentes

### API Gateway (`gateway/`)

**Responsabilidades:**
- Receber todas as requisições externas
- Validar a presença do JWT no header `Authorization: Bearer <token>` e repassá-lo para os serviços internos
- Rotear cada requisição ao microsserviço correto via proxy HTTP
- Executar heartbeat periódico em todos os serviços
- Retornar `503 Service Unavailable` caso o serviço de destino esteja indisponível

**Heartbeat:**
- Intervalo: a cada 5 segundos
- Endpoint verificado: `GET /health` em cada microsserviço
- Após 2 tentativas sem resposta: marcar serviço como `DOWN` e registrar em log com timestamp
- Quando o serviço voltar a responder: marcar como `UP` e registrar recuperação em log
- Enquanto `DOWN`: qualquer requisição para aquele serviço retorna `503`

---

### Serviço de Usuários (`users/`) — porta 5001

**Armazenamento:** arquivo JSON ou SQLite local

**Endpoints:**

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/users/register` | ✗ | Registra novo usuário |
| POST | `/users/login` | ✗ | Autentica e retorna JWT |
| GET | `/users/:id` | ✓ JWT | Retorna dados do usuário |
| GET | `/health` | ✗ | Health check |

**Regras de negócio:**
- Senhas armazenadas com hash (bcrypt ou SHA-256)
- Email deve ser único
- `role` do usuário pode ser `user` ou `admin`
- Login retorna JWT contendo: `userId`, `email`, `role`, `exp`

**Payloads:**

```json
// POST /users/register
{ "name": "string", "email": "string", "password": "string", "role": "user|admin" }

// POST /users/login
{ "email": "string", "password": "string" }
// → { "token": "<jwt>" }

// GET /users/:id
// → { "id": "string", "name": "string", "email": "string", "role": "string" }
```

---

### Serviço de Produtos (`products/`) — porta 5002 (primária) + 5012 (réplica)

**Armazenamento:** duas réplicas (ex: dois arquivos JSON ou dois processos)

**Endpoints:**

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| GET | `/products` | ✗ | Lista todos os produtos |
| GET | `/products/:id` | ✗ | Detalha um produto |
| POST | `/products` | ✓ JWT admin | Cria produto |
| GET | `/health` | ✗ | Health check |

**Regras de negócio:**
- Escrita (POST): deve ser propagada para **ambas as réplicas** antes de confirmar sucesso
- Leitura (GET): distribuída entre réplicas por **round-robin simples**
- Estratégia de consistência: **forte** — toda escrita aguarda confirmação das duas réplicas

**Payloads:**

```json
// POST /products
{ "name": "string", "price": number, "stock": number }

// GET /products
// → [{ "id": "string", "name": "string", "price": number, "stock": number }]
```

---

### Serviço de Pedidos (`orders/`) — porta 5003

**Armazenamento:** arquivo JSON ou SQLite local

**Endpoints:**

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/orders` | ✓ JWT | Cria pedido |
| GET | `/orders/:userId` | ✓ JWT | Lista pedidos do usuário |
| GET | `/health` | ✗ | Health check |

**Regras de negócio:**
- Ao criar pedido, o serviço deve validar a existência do `userId` e `productId` consultando os respectivos serviços
- O pedido armazena snapshot dos dados no momento da criação (não referência dinâmica)

**Payloads:**

```json
// POST /orders
{ "userId": "string", "productId": "string", "quantity": number }

// GET /orders/:userId
// → [{ "id": "string", "userId": "string", "productId": "string", "quantity": number, "createdAt": "ISO8601" }]
```

---

## Segurança (JWT)

- Chave secreta via variável de ambiente `JWT_SECRET`
- Token gerado no login com: `userId`, `email`, `role`, `exp` (expiração configurável, sugestão: 1h)
- Endpoints protegidos devem rejeitar requisições sem token ou com token inválido/expirado com `401 Unauthorized`
- Criação de produto requer `role === "admin"` no payload do token; caso contrário `403 Forbidden`
- O Gateway repassa o header `Authorization` intacto para os serviços internos

---

## Variáveis de Ambiente

| Variável | Serviço | Descrição |
|----------|---------|-----------|
| `JWT_SECRET` | users, gateway | Chave de assinatura JWT |
| `PORT` | todos | Porta de cada serviço |
| `USERS_URL` | gateway | URL do serviço de usuários |
| `PRODUCTS_URL` | gateway | URL do serviço de produtos |
| `ORDERS_URL` | gateway | URL do serviço de pedidos |
| `PRODUCTS_REPLICA_URL` | products | URL da réplica do serviço de produtos |

---

## Respostas de Erro Padrão

| Código | Situação |
|--------|----------|
| 400 | Payload inválido ou campo obrigatório ausente |
| 401 | Token ausente ou inválido |
| 403 | Permissão insuficiente (ex: não-admin tentando criar produto) |
| 404 | Recurso não encontrado |
| 503 | Serviço de destino indisponível (heartbeat detectou falha) |

---

## Estrutura de Arquivos

```
entrega/
├── gateway/
│   ├── index.js         # (ou equivalente na linguagem escolhida)
│   └── .env.example
├── users/
│   ├── index.js
│   ├── db.json          # ou users.db (SQLite)
│   └── .env.example
├── products/
│   ├── index.js
│   ├── db-primary.json
│   ├── db-replica.json
│   └── .env.example
├── orders/
│   ├── index.js
│   ├── db.json
│   └── .env.example
├── docker-compose.yml   # opcional
└── README_execucao.md
```

---

## Health Check (todos os serviços)

```
GET /health
→ 200 OK
{ "status": "ok" }
```

---

## Fluxo Principal — Criar Pedido (happy path)

```
1. Cliente → POST /users/login → Gateway → Users → JWT retornado
2. Cliente → POST /orders (com JWT) → Gateway (valida JWT presente)
3. Gateway → Orders:5003
4. Orders → GET /users/:id (valida usuário existe)
5. Orders → GET /products/:id (valida produto existe)
6. Orders → salva pedido localmente
7. Orders → 201 Created com dados do pedido
```

---

## Tech Stack Sugerida

- **Runtime:** Node.js + Express (ou Python + FastAPI)
- **Armazenamento:** JSON file ou SQLite
- **JWT:** `jsonwebtoken` (Node) ou `python-jose` (Python)
- **Hash de senha:** `bcrypt`
- **Docker:** opcional, mas recomendado para facilitar execução