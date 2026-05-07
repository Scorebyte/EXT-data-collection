# Open Finance Orchestrator — Contexto do Projeto

> Este arquivo é a fonte de verdade para continuar o desenvolvimento após compactação de contexto.
> Atualizar sempre que uma decisão arquitetural for tomada, um módulo for adicionado ou um padrão for estabelecido.

---

## O que é este projeto

Backend orquestrador de fluxo para Open Finance. Recebe um CNPJ, gera um link de autorização via Pluggy, aguarda o usuário autenticar na instituição financeira, coleta os dados (contas + transações), normaliza e envia para um sistema externo de processamento.

**O que ele NÃO é:**
- Não é um banco de dados permanente de dados financeiros
- Não faz análise ou cálculos sobre os dados
- Não tem responsabilidade sobre o sistema externo de destino

**Fonte de verdade dos dados:** Pluggy (pode ser recolhido a qualquer momento)
**MongoDB:** estado transitório apenas — pode ser dropado sem impacto estrutural

---

## Bancos de dados

| Banco | Uso | Quando gravar |
|---|---|---|
| **MongoDB** (local) | Estado transitório do fluxo | Sempre — é a fonte de verdade de status do pipeline |
| **PostgreSQL / Supabase** | Histórico de queries, logs de request, validação de tokens | Apenas nos status-chave: `created`, `auth`, `notauth`, `error` |

**MongoDB collections:** `connections`, `envelopes`, `webhook_subscriptions`
**PostgreSQL tables (via TypeORM):** `companies`, `api_tokens`, `query_history`, `request_logs`

Conexão PostgreSQL configurada via `DATABASE_URL`. Atualmente aponta para Supabase, mas pode ser trocada para qualquer PostgreSQL sem alterar código — só mudar a env var. `synchronize: false` garante que o TypeORM nunca toca no schema.

---

## Stack e versões

| Tecnologia | Versão | Motivo da escolha |
|---|---|---|
| Node.js | ≥20 | LTS atual |
| NestJS | ^10.3.0 | Framework modular com injeção de dependência, decorators para consumers |
| TypeScript | ^5.4.5 | Tipagem estrita |
| RabbitMQ | 3.13 (docker) | Mensageria durável, suporte a DLX, prefetch por consumer |
| MongoDB | 7 (docker) | Armazenamento de estado transitório sem schema rígido |
| Mongoose | ^8.4.0 | ODM para MongoDB com NestJS |
| @golevelup/nestjs-rabbitmq | ^4.0.0 | Melhor DX para RabbitMQ no NestJS — decorators `@RabbitSubscribe` |
| pluggy-sdk | ^0.85.2 | SDK oficial da Pluggy (versão mais recente disponível no npm) |
| @nestjs/typeorm + typeorm | ^11 / ^0.3 | ORM agnóstico de banco — conexão com PostgreSQL |
| pg | ^8.20.0 | Driver PostgreSQL (usado pelo TypeORM) |
| axios | ^1.7.2 | HTTP client para dispatch externo |
| reflect-metadata | ^0.1.14 | Exigido pelo @golevelup/nestjs-rabbitmq (peer dep — não usar ^0.2.x) |

**Atenção:** pluggy-sdk não tem versão 1.x no npm. A versão real é 0.85.2. Não alterar.

---

## Fluxo completo

```
Cliente
  │
  │ POST /api/v1/connections { cnpj }
  ▼
ConnectionController
  │ → cria Connection{status: pending_auth} no MongoDB
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
  │     → publica: open_finance / connection.established
  ▼
[RabbitMQ: q.open_finance.collection]
  │
CollectionConsumer.onConnectionEstablished()
  │ → connection.status = collecting
  │ → PluggyService.fetchAccounts(itemId)
  │ → para cada conta: PluggyService.fetchAllTransactions(accountId)
  │     → usa fetchAllTransactions() do SDK (cursor-based)
  │     → fallback para page-based (pageSize=500) se falhar
  │ → EnvelopeService.create() — salva no MongoDB com envelope padronizado:
  │     { event, lastUpdate, status: PENDING, domainName, body: { accounts, transactions, ... }, error }
  │ → connection.status = collected
  │ → publica: open_finance.clearing / transaction.ready
  │     payload: { transactionId, connectionId, cnpj }  ← apenas referência, SEM payload
  ▼
[RabbitMQ: queue_ext2clear]  ← consumido pelo microserviço de CLEARING
  │
  │  O clearing lê o envelope do MongoDB pelo transactionId,
  │  normaliza, persiste no clearing-db e alimenta o pipeline de ML.
  │  Esta API não tem responsabilidade sobre o que acontece após a publicação.
```

---

## Status de uma Connection (máquina de estados)

```
created ──→ connected → collecting → collected → normalizing → normalized → dispatching → dispatched
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
| `collecting` | `CollectionConsumer` | Buscando contas e transações na Pluggy |
| `collected` | `CollectionConsumer` | Dados brutos salvos no MongoDB |
| `normalizing` | `NormalizationConsumer` | Padronizando campos e formatos |
| `normalized` | `NormalizationConsumer` | Dados prontos para envio |
| `dispatching` | `DispatchConsumer` | Enviando para sistema externo |
| `dispatched` | `DispatchConsumer` | Envio confirmado pelo externo |
| `error` | qualquer worker | Falha técnica irrecuperável |

Todas as transições passam por `ConnectionService.transition()` que:
1. Atualiza o campo `status`
2. Faz push em `statusHistory[]` (log imutável de todas as transições)
3. Aceita `extra` para salvar campos adicionais na mesma operação

---

## Estrutura de arquivos

```
startup/
├── docker-compose.yml          → MongoDB 7 + RabbitMQ 3.13-management
├── .env.example                → todas as variáveis documentadas
├── package.json
├── tsconfig.json
├── nest-cli.json
├── CONTEXT.md                  → este arquivo
└── src/
    ├── main.ts                 → bootstrap, ValidationPipe global, GlobalExceptionFilter, prefixo /api/v1
    ├── app.module.ts           → importa todos os módulos
    ├── config/
    │   └── configuration.ts   → todas as env vars tipadas com defaults
    ├── common/
    │   ├── filters/
    │   │   └── http-exception.filter.ts  → captura qualquer exceção, resposta padronizada
    │   ├── types/
    │   │   └── queue-messages.types.ts   → interfaces de todas as mensagens de fila + enum ClientNotificationEvent
    │   └── utils/
    │       └── retry.util.ts             → withRetry(), sleep(), classe Semaphore
    └── modules/
        ├── messaging/
        │   ├── queues.constants.ts       → nomes de exchanges, queues, DLQs, routing keys (fonte única)
        │   └── messaging.module.ts       → configura RabbitMQModule, declara exchanges/queues/DLX
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
        │   ├── collection.service.ts   → collect(): busca contas+transações na Pluggy, retorna payload bruto
        │   ├── collection.consumer.ts  → @RabbitSubscribe connection.established, publica payload completo
        │   └── collection.module.ts
        │   (normalização é responsabilidade de módulo EXTERNO que consome data.collected)
        ├── dispatch/
        │   ├── dispatch.service.ts    → send(connectionId, cnpj, data) com Semaphore + withRetry
        │   ├── dispatch.consumer.ts   → @RabbitSubscribe data.normalized, usa data da mensagem diretamente
        │   └── dispatch.module.ts
        └── notification/
            ├── schemas/webhook-subscription.schema.ts → WebhookSubscription (cnpj, url, events[])
            ├── dto/register-webhook.dto.ts
            ├── notification.service.ts    → registerSubscription(), dispatch()
            ├── notification.consumer.ts   → @RabbitSubscribe dispatch.completed
            ├── notification.controller.ts → POST /webhooks/subscriptions
            └── notification.module.ts
```

---

## RabbitMQ — exchanges e filas

### Exchanges
| Nome | Tipo | Uso |
|---|---|---|
| `open_finance` | topic | exchange principal, todas as mensagens |
| `open_finance.dlx` | topic | dead-letter exchange |

### Routing keys
| Constante | Valor | Publicado por |
|---|---|---|
| `CONNECTION_ESTABLISHED` | `connection.established` | WebhookService |
| `DATA_COLLECTED` | `data.collected` | CollectionConsumer |
| `DATA_NORMALIZED` | `data.normalized` | NormalizationConsumer |
| `DISPATCH_COMPLETED` | `dispatch.completed` | DispatchConsumer |
| `CLIENT_NOTIFICATION` | `notification.client` | (reservado) |

### Filas principais (todas durable, com DLX e TTL 24h)
| Fila | Consome | DLQ |
|---|---|---|
| `q.open_finance.collection` | `connection.established` | `dlq.open_finance.collection` |
| `q.open_finance.normalization` | `data.collected` | `dlq.open_finance.normalization` |
| `q.open_finance.dispatch` | `data.normalized` | `dlq.open_finance.dispatch` |
| `q.open_finance.notification` | `dispatch.completed` | `dlq.open_finance.notification` |

### Channels configurados
- `default`: prefetchCount=10 (collection, normalization, notification)
- `dispatch`: prefetchCount=3 (alinhado com DISPATCH_CONCURRENCY)

---

## MongoDB — collections

| Collection | Schema | Propósito |
|---|---|---|
| `connections` | `Connection` | Estado de cada fluxo (status, IDs, histórico) |
| `webhook_subscriptions` | `WebhookSubscription` | URLs de clientes para notificação |

**Dados financeiros não são persistidos no MongoDB.** O payload bruto da Pluggy trafega inteiro pelo RabbitMQ. O módulo externo que normaliza também publica os dados normalizados na mensagem, não em banco.

**Índices relevantes:**
- `connections`: `cnpj + status` (busca de conexão ativa), `clientUserId` (correlação webhook), `pluggyItemId` (erro event)
- Todas as collections têm `timestamps: true` (createdAt/updatedAt automáticos)

---

## Variáveis de ambiente

```bash
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/open-finance
RABBITMQ_URI=amqp://guest:guest@localhost:5672
PLUGGY_CLIENT_ID=           # credencial Pluggy
PLUGGY_CLIENT_SECRET=       # credencial Pluggy
PLUGGY_WEBHOOK_SECRET=      # secret para validar HMAC-SHA256 dos webhooks
EXTERNAL_SYSTEM_URL=        # endpoint POST do sistema externo
EXTERNAL_SYSTEM_API_KEY=    # auth do sistema externo (Bearer token)
DISPATCH_CONCURRENCY=3      # max requisições simultâneas para o externo
RETRY_ATTEMPTS=3            # tentativas em falhas transitórias
RETRY_DELAY_MS=2000         # delay base do backoff exponencial
```

---

## Padrões e convenções adotadas

### Pattern de resilência em todo worker
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

### Semaphore — controle de concorrência
Usado exclusivamente no DispatchService. Instanciado no `onModuleInit()` com valor de `DISPATCH_CONCURRENCY`.

### Webhook HMAC
- Header esperado: `x-pluggy-signature`
- Algoritmo: HMAC-SHA256 do body JSON
- Comparação: `timingSafeEqual` (evita timing attack)
- Se `PLUGGY_WEBHOOK_SECRET` não estiver configurado, a validação é pulada (modo dev)

### clientUserId
Formato: `{cnpj}-{uuid}` — gerado na iniciação da conexão. É a chave que correlaciona o webhook da Pluggy de volta à nossa `Connection`. O item da Pluggy armazena este valor em `item.clientUserId`.

### Nomenclatura de arquivos
- `*.schema.ts` — Mongoose schema + tipo `HydratedDocument`
- `*.consumer.ts` — classe que contém `@RabbitSubscribe`
- `*.service.ts` — lógica de negócio, acessa MongoDB e outros services
- `*.controller.ts` — HTTP endpoints
- `*.module.ts` — importações e exports do módulo

---

## Endpoints HTTP

Base: `http://localhost:3000/api/v1`

| Método | Path | Descrição |
|---|---|---|
| POST | `/connections` | Inicia fluxo com CNPJ, retorna connectUrl |
| GET | `/connections/:id/status` | Consulta status atual e histórico |
| POST | `/webhooks/pluggy` | Recebe eventos da Pluggy (webhook) |
| POST | `/webhooks/subscriptions` | Registra URL para notificações do cliente |

### Exemplo de uso completo
```bash
# 1. Iniciar conexão
curl -X POST http://localhost:3000/api/v1/connections \
  -H "Content-Type: application/json" \
  -d '{"cnpj": "12345678000195"}'
# → { connectionId, connectUrl }

# 2. Redirecionar usuário para connectUrl

# 3. Pluggy bate no webhook automaticamente após autenticação

# 4. Acompanhar progresso
curl http://localhost:3000/api/v1/connections/{connectionId}/status
# → { status: "collected", history: ["pending_auth","connected","collecting","collected"] }

# 5. Registrar webhook para receber notificação de conclusão
curl -X POST http://localhost:3000/api/v1/webhooks/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"cnpj": "12345678000195", "url": "https://meu-sistema.com/hook", "events": ["dispatch.completed"]}'
```

---

## Payload enviado ao sistema externo

```json
{
  "source": "open-finance-orchestrator",
  "version": "1",
  "cnpj": "12345678000195",
  "connectionId": "mongo-object-id",
  "collectedAt": "2026-05-05T00:00:00.000Z",
  "accounts": [
    {
      "id": "pluggy-account-id",
      "type": "BANK",
      "subtype": "CHECKING_ACCOUNT",
      "name": "Conta Corrente",
      "balance": 1500.00,
      "currency": "BRL",
      "number": "12345-6"
    }
  ],
  "transactions": [
    {
      "id": "pluggy-txn-id",
      "accountId": "pluggy-account-id",
      "description": "PIX RECEBIDO",
      "amount": 500.00,
      "type": "CREDIT",
      "date": "2026-05-01",
      "currency": "BRL"
    }
  ],
  "summary": {
    "totalAccounts": 1,
    "totalTransactions": 42
  }
}
```

---

## Como rodar localmente

```bash
# Subir infraestrutura
docker-compose up -d

# Configurar variáveis
cp .env.example .env
# editar .env com credenciais reais da Pluggy

# Instalar dependências
npm install

# Desenvolvimento com hot-reload
npm run start:dev

# Build de produção
npm run build
npm run start:prod
```

**RabbitMQ Management UI:** http://localhost:15672 (guest/guest)

---

## Configurar webhook na Pluggy

No dashboard da Pluggy (https://dashboard.pluggy.ai), cadastrar:
- URL: `https://{seu-dominio}/api/v1/webhooks/pluggy`
- Eventos: `item/created`, `item/updated`, `item/error`, `item/login_error`
- O secret gerado deve ser colocado em `PLUGGY_WEBHOOK_SECRET`

Para testes locais usar ngrok: `ngrok http 3000`
