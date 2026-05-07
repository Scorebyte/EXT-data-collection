export enum PluggyWebhookEvent {
  ITEM_CREATED = 'item/created',
  ITEM_UPDATED = 'item/updated',
  ITEM_ERROR = 'item/error',
  ITEM_WAITING_USER_INPUT = 'item/waiting_user_input',
  ITEM_LOGIN_ERROR = 'item/login_error',
}

export interface PluggyWebhookPayload {
  id: string;
  event: PluggyWebhookEvent | string;
  itemId: string;
  createdAt?: string;
  error?: { code: string; message: string } | null;
}
