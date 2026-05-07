export const EXCHANGE = 'data-collection';
export const DLX = 'data-collection.dlx';

export const QUEUE_COLLECTION  = 'q.data-collection';
export const QUEUE_EXT2CLEARING = 'ext2clearing';
export const DLQ_COLLECTION    = 'dlq.data-collection';

export const ROUTING_KEYS = {
  CONNECTION_ESTABLISHED: 'connection.established',
  TRANSACTION_READY:      'transaction.ready',
} as const;
