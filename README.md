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
1. Gateway repassa o request para a instância primária
2. Primária replica o produto para a instância réplica via POST /internal/products
3. Só retorna 201 quando a réplica confirma o salvamento
4. Se a réplica falhar, retorna 500 — nenhum dado é salvo na primária
```

Isso garante que os dados estejam sempre idênticos nas duas instâncias — nunca uma réplica desatualizada.

### Leitura (GET /products) — Round-Robin

As requisições de leitura são distribuídas alternadamente entre as duas instâncias pelo Gateway:

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
cd orders && npm install && \
  JWT_SECRET=supersecret \
  USERS_URL=http://localhost:5001 \
  PRODUCTS_URL=http://localhost:5002 \
  node index.js

# Terminal 5 — Gateway
cd gateway && npm install && \
  JWT_SECRET=supersecret \
  USERS_URL=http://localhost:5001 \
  PRODUCTS_URL=http://localhost:5002 \
  PRODUCTS_REPLICA_URL=http://localhost:5012 \
  ORDERS_URL=http://localhost:5003 \
  node index.js
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
| `DB_FILE` | products | Arquivo de dados (`db-primary.json` ou `db-replica.json`) |
| `IS_REPLICA` | products | `true` na réplica — impede propagação infinita de escrita |

---

## Exemplos de Uso (curl)

Substitua `<token>`, `<userId>` e `<productId>` pelos valores reais retornados nas chamadas anteriores.

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

### 3. Login e obter token

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

Execute duas vezes seguidas para ver o round-robin em ação — o gateway alternará entre primária (:5002) e réplica (:5012).

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
| 502 | Serviço upstream indisponível (orders não conseguiu alcançar users/products) |
| 503 | Serviço indisponível — heartbeat do gateway detectou falha |
