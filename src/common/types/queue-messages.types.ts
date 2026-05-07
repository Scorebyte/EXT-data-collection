import type { Account, Transaction } from 'pluggy-sdk';

export interface ConnectionEstablishedMessage {
  connectionId: string;
  pluggyItemId: string;
  cnpj: string;
}

export interface DataCollectedMessage {
  connectionId: string;
  cnpj: string;
  accounts: Account[];
  transactions: Transaction[];
}

export interface TransactionReadyMessage {
  transactionId: string;
  connectionId: string;
  cnpj: string;
}

export interface DataNormalizedMessage {
  connectionId: string;
  cnpj: string;
  data: Record<string, unknown>;
}

export interface DispatchCompletedMessage {
  connectionId: string;
  cnpj: string;
  externalReference: string;
  success: boolean;
  error?: string;
}

export interface ClientNotificationMessage {
  connectionId: string;
  cnpj: string;
  event: ClientNotificationEvent;
  payload: Record<string, unknown>;
}

export enum ClientNotificationEvent {
  CONNECTION_ESTABLISHED = 'connection.established',
  COLLECTION_COMPLETED = 'collection.completed',
  DISPATCH_COMPLETED = 'dispatch.completed',
  PROCESSING_FAILED = 'processing.failed',
}
