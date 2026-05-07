import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGE, DLX,
  QUEUE_COLLECTION, QUEUE_EXT2CLEARING, DLQ_COLLECTION,
  ROUTING_KEYS,
} from './queues.constants';

@Module({
  imports: [
    RabbitMQModule.forRootAsync(RabbitMQModule, {
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('rabbitmq.uri') ?? 'amqp://guest:guest@localhost:5672',
        exchanges: [
          { name: EXCHANGE, type: 'topic', options: { durable: true } },
          { name: DLX,      type: 'topic', options: { durable: true } },
        ],
        queues: [
          {
            name: DLQ_COLLECTION,
            options: { durable: true },
            exchange: DLX,
            routingKey: ROUTING_KEYS.CONNECTION_ESTABLISHED,
          },
          {
            name: QUEUE_COLLECTION,
            options: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': ROUTING_KEYS.CONNECTION_ESTABLISHED,
                'x-message-ttl': 86400000,
              },
            },
            exchange: EXCHANGE,
            routingKey: ROUTING_KEYS.CONNECTION_ESTABLISHED,
          },
          {
            name: QUEUE_EXT2CLEARING,
            options: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': DLX,
                'x-dead-letter-routing-key': ROUTING_KEYS.TRANSACTION_READY,
                'x-message-ttl': 86400000,
              },
            },
            exchange: EXCHANGE,
            routingKey: ROUTING_KEYS.TRANSACTION_READY,
          },
        ],
        channels: {
          default: { prefetchCount: 10, default: true },
        },
        connectionInitOptions: { wait: true, timeout: 30000 },
        enableDirectReplyTo: false,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [RabbitMQModule],
})
export class MessagingModule {}
