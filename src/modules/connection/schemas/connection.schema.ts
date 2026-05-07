import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ConnectionDocument = HydratedDocument<Connection>;

export enum ConnectionStatus {
  CREATED = 'created',
  NOT_AUTH = 'not_auth',
  CONNECTED = 'connected',
  COLLECTING = 'collecting',
  COLLECTED = 'collected',
  NORMALIZING = 'normalizing',
  NORMALIZED = 'normalized',
  DISPATCHING = 'dispatching',
  DISPATCHED = 'dispatched',
  ERROR = 'error',
}

@Schema({ collection: 'connections', timestamps: true, versionKey: false })
export class Connection {
  @Prop({ required: true, index: true })
  cnpj!: string;

  @Prop({ required: true, unique: true, index: true })
  clientUserId!: string;

  @Prop({ required: true, enum: ConnectionStatus, default: ConnectionStatus.CREATED })
  status!: ConnectionStatus;

  @Prop({ index: true, sparse: true })
  pluggyItemId?: string;

  @Prop()
  connectToken?: string;

  @Prop()
  connectUrl?: string;

  @Prop()
  collectedDataId?: string;

  @Prop()
  normalizedDataId?: string;

  @Prop()
  externalReference?: string;

  @Prop({ required: true })
  companyId!: number;

  @Prop({ type: Object })
  lastError?: { message: string; at: Date };

  @Prop({ type: [String], default: [] })
  statusHistory!: string[];
}

export const ConnectionSchema = SchemaFactory.createForClass(Connection);

ConnectionSchema.index({ cnpj: 1, status: 1 });
