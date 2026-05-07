import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PluggyModule } from '../pluggy/pluggy.module';
import { ConnectionModule } from '../connection/connection.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [ConfigModule, PluggyModule, ConnectionModule, MessagingModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
