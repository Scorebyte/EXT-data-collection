import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EnvelopeDocument = HydratedDocument<Envelope>;

export enum EnvelopeStatus {
  PENDING    = 'PENDING',
  PROCESSING = 'PROCESSING',
  PROCESSED  = 'PROCESSED',
  ERROR      = 'ERROR',
}

export enum EnvelopeEvent {
  OPEN_FINANCE_DATA_COLLECTED = 'OPEN_FINANCE_DATA_COLLECTED',
}

@Schema({ collection: 'normalized_transactions', timestamps: true, versionKey: false })
export class Envelope {
  @Prop({ required: true })
  event!: string;

  @Prop({ required: true })
  lastUpdate!: Date;

  @Prop({ required: true, enum: EnvelopeStatus, default: EnvelopeStatus.PENDING })
  status!: EnvelopeStatus;

  @Prop({ required: true })
  domainName!: string;

  @Prop({ type: Object, required: true })
  body!: Record<string, unknown>;

  @Prop({ type: String, default: null })
  error!: string | null;
}

export const EnvelopeSchema = SchemaFactory.createForClass(Envelope);
