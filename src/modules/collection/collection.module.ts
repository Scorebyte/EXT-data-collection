import { Module } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { CollectionConsumer } from './collection.consumer';
import { PluggyModule } from '../pluggy/pluggy.module';
import { ConnectionModule } from '../connection/connection.module';
import { EnvelopeModule } from '../envelope/envelope.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [PluggyModule, ConnectionModule, EnvelopeModule, MessagingModule],
  providers: [CollectionService, CollectionConsumer],
})
export class CollectionModule {}
