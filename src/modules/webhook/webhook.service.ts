import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PluggyService } from '../pluggy/pluggy.service';
import { ConnectionService } from '../connection/connection.service';
import { ConnectionStatus } from '../connection/schemas/connection.schema';
import { EXCHANGE, ROUTING_KEYS } from '../messaging/queues.constants';
import { ConnectionEstablishedMessage } from '../../common/types/queue-messages.types';
import { PluggyWebhookPayload, PluggyWebhookEvent } from './dto/pluggy-webhook.dto';
import { sleep } from '../../common/utils/retry.util';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly pluggy: PluggyService,
    private readonly connectionService: ConnectionService,
    private readonly amqp: AmqpConnection,
  ) {}

  async handlePluggyEvent(payload: PluggyWebhookPayload): Promise<void> {
    this.logger.log(`Pluggy webhook received — event=${payload.event} itemId=${payload.itemId}`);

    const { event, itemId } = payload;

    if (event === PluggyWebhookEvent.ITEM_LOGIN_ERROR) {
      await this.handleNotAuth(itemId);
      return;
    }

    if (event === PluggyWebhookEvent.ITEM_ERROR) {
      await this.handleItemError(itemId, payload.error?.message ?? 'Unknown error from Pluggy');
      return;
    }

    if (
      event === PluggyWebhookEvent.ITEM_CREATED ||
      event === PluggyWebhookEvent.ITEM_UPDATED
    ) {
      await this.handleItemReady(itemId);
      return;
    }

    this.logger.debug(`Unhandled webhook event type: ${event}`);
  }

  private async handleItemReady(itemId: string): Promise<void> {
    const item = await this.waitForItemReady(itemId);
    if (!item) return;

    const clientUserId = item.clientUserId ?? '';
    const connection = await this.connectionService.findByClientUserId(clientUserId);
    if (!connection) {
      this.logger.warn(`No connection found for clientUserId=${clientUserId}`);
      return;
    }

    await this.connectionService.transition(connection._id.toString(), ConnectionStatus.CONNECTED, {
      pluggyItemId: itemId,
    });

    const message: ConnectionEstablishedMessage = {
      connectionId: connection._id.toString(),
      pluggyItemId: itemId,
      cnpj: connection.cnpj,
    };

    await this.amqp.publish(EXCHANGE, ROUTING_KEYS.CONNECTION_ESTABLISHED, message);
    this.logger.log(
      `Published ${ROUTING_KEYS.CONNECTION_ESTABLISHED} for connection ${connection._id}`,
    );
  }

  private async handleNotAuth(itemId: string): Promise<void> {
    const item = await this.pluggy.fetchItem(itemId).catch(() => null);
    const clientUserId = item?.clientUserId ?? '';

    const connection = clientUserId
      ? await this.connectionService.findByClientUserId(clientUserId)
      : await this.connectionService.findByPluggyItemId(itemId);

    if (!connection) {
      this.logger.warn(`No connection found for NOT_AUTH event — itemId=${itemId}`);
      return;
    }

    await this.connectionService.transition(connection._id.toString(), ConnectionStatus.NOT_AUTH, {
      pluggyItemId: itemId,
    });

    this.logger.warn(`Connection ${connection._id} marked as NOT_AUTH`);
  }

  private async handleItemError(itemId: string, errorMessage: string): Promise<void> {
    const connection = await this.connectionService.findByPluggyItemId(itemId);
    if (!connection) {
      this.logger.warn(`No connection found for itemId=${itemId} on error event`);
      return;
    }
    await this.connectionService.markError(connection._id.toString(), errorMessage);
  }

  private async waitForItemReady(itemId: string, maxAttempts = 8, delayMs = 3000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const item = await this.pluggy.fetchItem(itemId);

      if (this.pluggy.isItemReady(item)) return item;

      if (this.pluggy.isItemFailed(item)) {
        this.logger.error(`Item ${itemId} failed with status=${item.status}`);
        if (item.status === 'LOGIN_ERROR') {
          await this.handleNotAuth(itemId);
        } else {
          await this.handleItemError(itemId, item.error?.message ?? `Item status: ${item.status}`);
        }
        return null;
      }

      this.logger.debug(
        `Item ${itemId} status=${item.status} — waiting... (${attempt}/${maxAttempts})`,
      );
      await sleep(delayMs);
    }

    this.logger.error(`Item ${itemId} did not reach UPDATED after ${maxAttempts} attempts`);
    return null;
  }
}
