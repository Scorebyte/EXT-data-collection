import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { DatabaseModule } from './modules/database/database.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { PluggyModule } from './modules/pluggy/pluggy.module';
import { ConnectionModule } from './modules/connection/connection.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { EnvelopeModule } from './modules/envelope/envelope.module';
import { CollectionModule } from './modules/collection/collection.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongodb.uri'),
      }),
      inject: [ConfigService],
    }),
    DatabaseModule,
    MessagingModule,
    PluggyModule,
    ConnectionModule,
    WebhookModule,
    EnvelopeModule,
    CollectionModule,
  ],
})
export class AppModule {}
