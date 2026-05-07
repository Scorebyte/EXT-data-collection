import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { CollectionService } from './collection.service';
import { ConnectionService } from '../connection/connection.service';
import { EnvelopeService } from '../envelope/envelope.service';
import { ConnectionStatus } from '../connection/schemas/connection.schema';
import { EXCHANGE, QUEUE_COLLECTION, ROUTING_KEYS } from '../messaging/queues.constants';
import { ConnectionEstablishedMessage, TransactionReadyMessage } from '../../common/types/queue-messages.types';

@Injectable()
export class CollectionConsumer {
  private readonly logger = new Logger(CollectionConsumer.name);

  constructor(
    private readonly collectionService: CollectionService,
    private readonly connectionService: ConnectionService,
    private readonly envelopeService: EnvelopeService,
    private readonly amqp: AmqpConnection,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE,
    routingKey: ROUTING_KEYS.CONNECTION_ESTABLISHED,
    queue: QUEUE_COLLECTION,
  })
  async onConnectionEstablished(msg: ConnectionEstablishedMessage): Promise<void | Nack> {
    const { connectionId, pluggyItemId, cnpj } = msg;
    this.logger.log(`[Collection] Processing connection ${connectionId}`);

    try {
      await this.connectionService.transition(connectionId, ConnectionStatus.COLLECTING);

      const { accounts, transactions } = await this.collectionService.collect(pluggyItemId);

      const transactionId = await this.envelopeService.create({
        connectionId,
        cnpj,
        pluggyItemId,
        collectedAt: new Date().toISOString(),
        accounts,
        transactions,
      });

      await this.connectionService.transition(connectionId, ConnectionStatus.COLLECTED);

      const outMsg: TransactionReadyMessage = { transactionId, connectionId, cnpj };
      await this.amqp.publish(EXCHANGE, ROUTING_KEYS.TRANSACTION_READY, outMsg);

      this.logger.log(
        `[Collection] Envelope saved — transactionId=${transactionId} accounts=${accounts.length} transactions=${transactions.length}`,
      );
    } catch (err: any) {
      this.logger.error(`[Collection] Failed for ${connectionId}: ${err.message}`, err.stack);
      await this.connectionService.markError(connectionId, err.message).catch(() => null);
      return new Nack(false);
    }
  }
}
