export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  mongodb: {
    uri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/open-finance',
  },

  rabbitmq: {
    uri: process.env.RABBITMQ_URI ?? 'amqp://guest:guest@localhost:5672',
  },

  pluggy: {
    clientId: process.env.PLUGGY_CLIENT_ID ?? '',
    clientSecret: process.env.PLUGGY_CLIENT_SECRET ?? '',
    webhookSecret: process.env.PLUGGY_WEBHOOK_SECRET ?? '',
    connectBaseUrl: 'https://connect.pluggy.ai',
  },

  externalSystem: {
    url: process.env.EXTERNAL_SYSTEM_URL ?? 'http://localhost:9000/ingest',
    apiKey: process.env.EXTERNAL_SYSTEM_API_KEY ?? '',
  },

  database: {
    url: process.env.DATABASE_URL ?? '',
  },

  resilience: {
    dispatchConcurrency: parseInt(process.env.DISPATCH_CONCURRENCY ?? '3', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS ?? '3', 10),
    retryDelayMs: parseInt(process.env.RETRY_DELAY_MS ?? '2000', 10),
  },
});
