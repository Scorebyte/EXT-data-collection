# Open Finance Orchestrator — Contexto do Projeto

> Este arquivo é a fonte de verdade para continuar o desenvolvimento após compactação de contexto.
> Atualizar sempre que uma decisão arquitetural for tomada, um módulo for adicionado ou um padrão for estabelecido.

---

## O que é este projeto

Backend orquestrador de fluxo para Open Finance. Recebe um CNPJ, gera um link de autorização via Pluggy, aguarda o usuário autenticar na instituição financeira, coleta os dados brutos (contas + transações), salva no MongoDB dentro de um envelope padronizado e publica apenas uma referência (`transactionId`) para o microserviço de clearing consumir.

**O que ele NÃO é:**
- Não é um banco de dados permanente de dados financeiros
- Não faz normalização, análise ou cálculos sobre os dados
- Não tem responsabilidade sobre o que acontece após a publicação para o clearing

**Fonte de dados:** Pluggy SDK (temporário — será substituído pela API Open Finance diretamente)
**MongoDB:** estado transitório + envelope raw — o clearing lê e normaliza

---

## Bancos de dados

| Banco | Uso | Quando gravar |
|---|---|---|
| **MongoDB Atlas** | Estado do fluxo + envelope raw do Pluggy | Sempre — fonte de verdade do pipeline |
| **PostgreSQL / Supabase** | Histórico LGPD, logs de request, validação de tokens | Apenas nos status-chave: `created`, `auth`, `notauth`, `error` |

**MongoDB:** cluster `credit-analysis-cluster`, database `credit_analysis_engine`
**Collections:** `connections`, `normalized_transactions`
**PostgreSQL tables (via TypeORM):** `companies`, `api_tokens`, `query_history`, `request_logs`

Conexão PostgreSQL via `DATABASE_URL`. Pode ser trocada para qualquer PostgreSQL sem alterar código — só mudar a env var. `synchronize: false` garante que o TypeORM nunca toca no schema.

---

## Stack e versões

| Tecnologia | Versão | Motivo da escolha |
|---|---|---|
| Node.js | ≥20 | LTS atual |
| NestJS | ^10.3.0 | Framework modular com DI e decorators para consumers |
| TypeScript | ^5.4.5 | Tipagem estrita |
| RabbitMQ | CloudAMQP (cloud) | Mensageria durável, suporte a DLX, prefetch por consumer |
| MongoDB | Atlas (cloud) | Armazenamento de estado transitório sem schema rígido |
| Mongoose | ^8.4.0 | ODM para MongoDB com NestJS |
| @golevelup/nestjs-rabbitmq | ^4.0.0 | Melhor DX para RabbitMQ no NestJS — decorators `@RabbitSubscribe` |
| pluggy-sdk | ^0.85.2 | SDK oficial da Pluggy (versão mais recente disponível no npm) |
| @nestjs/typeorm + typeorm | ^11 / ^0.3 | ORM agnóstico de banco — conexão com PostgreSQL |
| pg | ^8.20.0 | Driver PostgreSQL (usado pelo TypeORM) |
| axios | ^1.7.2 | HTTP client para chamadas externas |
| reflect-metadata | ^0.1.14 | Exigido pelo @golevelup/nestjs-rabbitmq (peer dep — não usar ^0.2.x) |

> **Atenção:** pluggy-sdk não tem versão 1.x no npm. A versão real é 0.85.2. Não alterar.

---

## Fluxo completo

```
Cliente
  │
  │ POST /api/v1/connections { cnpj }
  ▼
ConnectionController
  │ → cria Connection { status: created } no MongoDB
  │ → PluggyService.createConnectToken(clientUserId)
  │ → retorna { connectionId, connectUrl }
  ▼
[usuário acessa connectUrl, autentica no banco via Pluggy Connect]
  │
  │ Pluggy notifica via webhook
  ▼
POST /api/v1/webhooks/pluggy
  │ → valida HMAC-SHA256 (header x-pluggy-signature)
  │ → responde 200 imediatamente (não bloqueia)
  │ → WebhookService.handlePluggyEvent() [assíncrono, fire-and-forget]
  │     → polling item até status = UPDATED (máx 8 tentativas, 3s cada)
  │     → connection.pluggyItemId = itemId
  │     → connection.status = connected
  │     → publica: exchange 'data-collection' / routing key 'connection.established'
  ▼
[RabbitMQ: fila 'q.data-collection']
  │
CollectionConsumer.onConnectionEstablished()
  │ → connection.status = collecting
  │ → PluggyService.fetchAccounts(itemId)
  │ → para cada conta: PluggyService.fetchAllTransactions(accountId)
  │     → usa fetchAllTransactions() do SDK (cursor-based)
  │     → fallback para page-based (pageSize=500) se falhar
  │ → EnvelopeService.create() — salva no MongoDB (normalized_transactions):
  │     { event, lastUpdate, status: PENDING, domainName: 'data-collection',
  │       body: { connectionId, cnpj, pluggyItemId, collectedAt, accounts, transactions },
  │       error: null }
  │ → connection.status = collected
  │ → publica: exchange 'data-collection' / routing key 'transaction.ready'
  │     payload: { transactionId, connectionId, cnpj }  ← apenas referência, SEM payload raw
  ▼
[RabbitMQ: fila 'ext2clearing']  ← consumido pelo microserviço de CLEARING
  │
  │  O clearing lê o envelope do MongoDB pelo transactionId,
  │  normaliza, persiste no clearing-db e alimenta o pipeline de ML.
  │  Esta API não tem responsabilidade sobre o que acontece após a publicação.
```

---

## Status de uma Connection (máquina de estados)

```
created ──→ connected → collecting → collected
   │
   └──→ not_auth   (login falhou na instituição financeira)
   │
   └──→ error      (qualquer etapa técnica com falha)
```

| Status | Origem | Significado |
|---|---|---|
| `created` | `ConnectionService.initiate()` | Link gerado, aguardando autenticação do usuário |
| `not_auth` | `WebhookService` (evento `item/login_error` ou status `LOGIN_ERROR`) | Usuário falhou na autenticação junto à instituição |
| `connected` | `WebhookService` (item `UPDATED`) | Autenticação OK, pronto para coletar |
| `collecting` | `CollectionConsumer` | Buscando contas e transações no Pluggy |
| `collected` | `CollectionConsumer` | Dados brutos salvos no MongoDB |
| `error` | qualquer worker | Falha técnica irrecuperável |

Todas as transições passam por `ConnectionService.transition()` que:
1. Atualiza o campo `status`
2. Faz push em `statusHistory[]` (log imutável de todas as transições)
3. Aceita `extra` para salvar campos adicionais na mesma operação
4. Sincroniza `query_history` no PostgreSQL para os status mapeados: `created`, `auth`, `notauth`, `error`

---

## Estrutura de arquivos

```
startup/
├── .env                        → variáveis reais (gitignored)
├── .env.example                → todas as variáveis documentadas
├── .gitignore
├── package.json
├── tsconfig.json
├── nest-cli.json
├── readme.md                   → este arquivo
└── src/
    ├── main.ts                 → bootstrap, ValidationPipe global, GlobalExceptionFilter, prefixo /api/v1
    ├── app.module.ts           → importa todos os módulos
    ├── config/
    │   └── configuration.ts   → todas as env vars tipadas com defaults
    ├── common/
    │   ├── filters/
    │   │   └── http-exception.filter.ts  → captura qualquer exceção, resposta padronizada
    │   ├── guards/
    │   │   └── api-token.guard.ts        → valida Bearer token via SHA-256 + PostgreSQL
    │   ├── interceptors/
    │   │   └── request-log.interceptor.ts → loga requests no PostgreSQL
    │   ├── types/
    │   │   └── queue-messages.types.ts   → interfaces das mensagens de fila
    │   └── utils/
    │       └── retry.util.ts             → withRetry(), sleep()
    └── modules/
        ├── messaging/
        │   ├── queues.constants.ts       → nomes de exchanges, filas, DLQs, routing keys (fonte única)
        │   └── messaging.module.ts       → configura RabbitMQModule, declara exchanges/filas/DLX
        ├── pluggy/
        │   ├── pluggy.service.ts         → wrapper do SDK: createConnectToken, fetchItem, fetchAccounts, fetchAllTransactions
        │   └── pluggy.module.ts
        ├── connection/
        │   ├── schemas/connection.schema.ts     → Connection, ConnectionStatus enum
        │   ├── dto/create-connection.dto.ts     → valida CNPJ (14 dígitos numéricos)
        │   ├── connection.service.ts            → initiate(), findByClientUserId(), transition(), markError()
        │   ├── connection.controller.ts         → POST /connections, GET /connections/:id/status
        │   └── connection.module.ts
        ├── webhook/
        │   ├── dto/pluggy-webhook.dto.ts        → PluggyWebhookPayload, PluggyWebhookEvent enum
        │   ├── webhook.service.ts               → handlePluggyEvent(), polling waitForItemReady()
        │   ├── webhook.controller.ts            → POST /webhooks/pluggy (valida assinatura HMAC)
        │   └── webhook.module.ts
        ├── collection/
        │   ├── collection.service.ts   → collect(): busca contas+transações no Pluggy
        │   ├── collection.consumer.ts  → @RabbitSubscribe connection.established → salva envelope → publica transaction.ready
        │   └── collection.module.ts
        ├── envelope/
        │   ├── schemas/envelope.schema.ts  → Envelope, EnvelopeStatus, EnvelopeEvent
        │   ├── envelope.service.ts         → create(), markError()
        │   └── envelope.module.ts
        └── database/
            ├── entities/
            │   ├── company.entity.ts          → public.companies
            │   ├── api-token.entity.ts        → public.api_tokens
            │   ├── query-history.entity.ts    → public.query_history
            │   └── request-log.entity.ts      → public.request_logs
            ├── database.service.ts            → validateToken(), writeQueryHistory(), logRequest()
            └── database.module.ts             → TypeORM global, synchronize: false
```

---

## RabbitMQ — exchanges e filas

### Exchanges

| Nome | Tipo | Uso |
|---|---|---|
| `data-collection` | topic | exchange principal |
| `data-collection.dlx` | topic | dead-letter exchange |

### Routing keys

| Constante | Valor | Publicado por |
|---|---|---|
| `CONNECTION_ESTABLISHED` | `connection.established` | `WebhookService` |
| `TRANSACTION_READY` | `transaction.ready` | `CollectionConsumer` |

### Filas

| Fila | Routing key | Consumer | DLQ |
|---|---|---|---|
| `q.data-collection` | `connection.established` | `CollectionConsumer` | `dlq.data-collection` |
| `ext2clearing` | `transaction.ready` | microserviço de clearing (externo) | — |

### Channels configurados
- `default`: prefetchCount=10

---

## MongoDB — collections

### `connections`

Estado e histórico de cada fluxo. Campos relevantes: `cnpj`, `companyId`, `clientUserId`, `pluggyItemId`, `status`, `statusHistory[]`, `connectUrl`, `connectToken`, `lastError`.

**Índices:** `cnpj + status` (busca de conexão ativa), `clientUserId` (correlação webhook), `pluggyItemId` (erro event)

### `normalized_transactions`

Envelope padronizado com os dados brutos do Pluggy.

```json
{
  "createdAt":  "2026-05-07T00:00:00.000Z",
  "event":      "OPEN_FINANCE_DATA_COLLECTED",
  "lastUpdate": "2026-05-07T00:00:00.000Z",
  "status":     "PENDING",
  "domainName": "data-collection",
  "body": {
    "connectionId": "...",
    "cnpj":         "12345678000195",
    "pluggyItemId": "...",
    "collectedAt":  "2026-05-07T00:00:00.000Z",
    "accounts":     [...],
    "transactions": [...]
  },
  "error": null
}
```

---

## PostgreSQL — tabelas

| Tabela | Propósito |
|---|---|
| `companies` | Empresas clientes da API |
| `api_tokens` | Tokens de autenticação (armazenados como hash SHA-256) |
| `query_history` | Histórico de eventos LGPD por CNPJ: `created`, `auth`, `notauth`, `error` |
| `request_logs` | Log de todas as requisições HTTP com status code |

---

## Variáveis de ambiente

```bash
PORT=3000
NODE_ENV=development

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/credit_analysis_engine?appName=<cluster>

# RabbitMQ (CloudAMQP)
RABBITMQ_URI=amqps://<user>:<pass>@<host>/<vhost>

# PostgreSQL (Supabase ou qualquer PostgreSQL)
DATABASE_URL=postgresql://postgres:<pass>@db.<id>.supabase.co:5432/postgres

# Pluggy
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
PLUGGY_WEBHOOK_SECRET=      # secret para validar HMAC-SHA256 dos webhooks

# Resiliência
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=2000
```

---

## Padrões e convenções adotadas

### Pattern de resiliência em todo worker
```typescript
try {
  // processamento
} catch (err) {
  await connectionService.markError(connectionId, err.message).catch(() => null);
  return new Nack(false); // vai para DLQ, não retorna à fila
}
```

### withRetry — backoff exponencial
```
tentativa 1: falha → espera 2s
tentativa 2: falha → espera 4s
tentativa 3: falha → lança erro
```

### Webhook HMAC
- Header esperado: `x-pluggy-signature`
- Algoritmo: HMAC-SHA256 do body JSON
- Comparação: `timingSafeEqual` (evita timing attack)
- Se `PLUGGY_WEBHOOK_SECRET` não estiver configurado, a validação é pulada (modo dev)

### clientUserId
Formato: `{cnpj}-{uuid}` — gerado na iniciação da conexão. É a chave que correlaciona o webhook da Pluggy de volta à nossa `Connection`. O item da Pluggy armazena este valor em `item.clientUserId`.

### Nomenclatura de arquivos
- `*.schema.ts` — Mongoose schema + tipo `HydratedDocument`
- `*.consumer.ts` — classe com `@RabbitSubscribe`
- `*.service.ts` — lógica de negócio
- `*.controller.ts` — HTTP endpoints
- `*.module.ts` — importações e exports do módulo

### Validação de token
Todo endpoint (exceto webhooks) requer `Authorization: Bearer <token>`. O guard calcula SHA-256 do token e consulta `api_tokens` JOIN `companies` no PostgreSQL. O `companyId` resultante é anexado ao request para uso nos controllers.

---

## Endpoints HTTP

Base: `http://localhost:3000/api/v1`

| Método | Path | Auth | Descrição |
|---|---|---|---|
| POST | `/connections` | Bearer | Inicia fluxo com CNPJ, retorna connectUrl |
| GET | `/connections/:id/status` | Bearer | Consulta status atual e histórico |
| POST | `/webhooks/pluggy` | HMAC | Recebe eventos da Pluggy (webhook) |

### Exemplo de uso completo
```bash
# 1. Iniciar conexão
curl -X POST http://localhost:3000/api/v1/connections \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"cnpj": "12345678000195"}'
# → { connectionId, connectUrl }

# 2. Redirecionar usuário para connectUrl

# 3. Pluggy bate no webhook automaticamente após autenticação

# 4. Acompanhar progresso
curl http://localhost:3000/api/v1/connections/{connectionId}/status \
  -H "Authorization: Bearer <token>"
# → { status: "collected", history: ["created","connected","collecting","collected"] }
```

---

## Como rodar

```bash
# Configurar variáveis
cp .env.example .env
# preencher com credenciais reais (Pluggy, CloudAMQP, MongoDB Atlas, Supabase)

# Instalar dependências
npm install

# Desenvolvimento com hot-reload
npm run start:dev

# Build de produção
npm run build
npm run start:prod
```

Não é necessário docker — MongoDB, RabbitMQ e PostgreSQL estão todos na nuvem.

---

## Configurar webhook na Pluggy

No dashboard da Pluggy (https://dashboard.pluggy.ai), cadastrar:
- URL: `https://{seu-dominio}/api/v1/webhooks/pluggy`
- Eventos: `item/created`, `item/updated`, `item/error`, `item/login_error`
- O secret gerado deve ser colocado em `PLUGGY_WEBHOOK_SECRET`

Para testes locais usar ngrok: `ngrok http 3000`
