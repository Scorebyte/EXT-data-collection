import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { Envelope, EnvelopeSchema } from './schemas/envelope.schema';
import { EnvelopeService } from './envelope.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Envelope.name, schema: EnvelopeSchema }]),
    ConfigModule,
  ],
  providers: [EnvelopeService],
  exports: [EnvelopeService],
})
export class EnvelopeModule {}
