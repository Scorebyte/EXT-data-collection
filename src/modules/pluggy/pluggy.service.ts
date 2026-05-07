import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PluggyClient } from 'pluggy-sdk';
import type { Item, Account, Transaction } from 'pluggy-sdk';
import { withRetry } from '../../common/utils/retry.util';
import { MOCK_ITEM, MOCK_ACCOUNTS, MOCK_TRANSACTIONS } from './mock/pluggy-mock.data';

export type { Item as PluggyItem, Account as PluggyAccount, Transaction as PluggyTransaction };

@Injectable()
export class PluggyService implements OnModuleInit {
  private readonly logger = new Logger(PluggyService.name);
  private client!: PluggyClient;
  private readonly mock: boolean;

  constructor(private readonly config: ConfigService) {
    this.mock = config.get<boolean>('pluggy.mock') ?? false;
  }

  onModuleInit() {
    if (this.mock) {
      this.logger.warn('Pluggy running in MOCK mode — no real API calls will be made');
      return;
    }
    this.client = new PluggyClient({
      clientId: this.config.get<string>('pluggy.clientId') ?? '',
      clientSecret: this.config.get<string>('pluggy.clientSecret') ?? '',
    });
    this.logger.log('Pluggy client initialized');
  }

  async createConnectToken(clientUserId: string): Promise<{ accessToken: string }> {
    if (this.mock) return { accessToken: `mock-token-${clientUserId}` };
    return withRetry(
      () => this.client.createConnectToken(undefined, { clientUserId }),
      { attempts: 3, delayMs: 1000, label: 'createConnectToken' },
    );
  }

  buildConnectUrl(accessToken: string): string {
    if (this.mock) return `http://localhost:3000/mock-connect?token=${accessToken}`;
    const base = this.config.get<string>('pluggy.connectBaseUrl') ?? 'https://connect.pluggy.ai';
    return `${base}?token=${accessToken}`;
  }

  async fetchItem(itemId: string): Promise<Item> {
    if (this.mock) return { ...MOCK_ITEM, id: itemId };
    return withRetry(
      () => this.client.fetchItem(itemId),
      { attempts: 3, delayMs: 1000, label: `fetchItem:${itemId}` },
    );
  }

  async fetchAccounts(itemId: string): Promise<Account[]> {
    if (this.mock) return MOCK_ACCOUNTS;
    const result = await withRetry(
      () => this.client.fetchAccounts(itemId),
      { attempts: 3, delayMs: 1000, label: `fetchAccounts:${itemId}` },
    );
    return result.results;
  }

  async fetchAllTransactions(accountId: string, from?: string): Promise<Transaction[]> {
    if (this.mock) {
      return MOCK_TRANSACTIONS.filter(t => t.accountId === accountId);
    }
    this.logger.debug(`Fetching all transactions for account ${accountId}`);
    try {
      const result = await withRetry(
        () => this.client.fetchAllTransactions(accountId, from ? { dateFrom: from } : undefined),
        { attempts: 3, delayMs: 1500, label: `fetchAllTransactions:${accountId}` },
      );
      this.logger.debug(`Fetched ${result.length} transactions for account ${accountId}`);
      return result;
    } catch (err) {
      this.logger.warn(
        `fetchAllTransactions failed for ${accountId}, falling back to paged: ${(err as Error).message}`,
      );
      return this.fetchTransactionsPaged(accountId, from);
    }
  }

  private async fetchTransactionsPaged(accountId: string, from?: string): Promise<Transaction[]> {
    const allTransactions: Transaction[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const result = await withRetry(
        () =>
          this.client.fetchTransactions(accountId, {
            ...(from ? { from } : {}),
            page,
            pageSize: 500,
          }),
        { attempts: 3, delayMs: 1000, label: `fetchTransactions:${accountId}:page${page}` },
      );
      allTransactions.push(...result.results);
      totalPages = result.totalPages ?? 1;
      this.logger.debug(
        `Transactions page ${page}/${totalPages} for account ${accountId}: ${result.results.length} records`,
      );
      page++;
    } while (page <= totalPages);

    return allTransactions;
  }

  isItemReady(item: Item): boolean {
    return item.status === 'UPDATED';
  }

  isItemFailed(item: Item): boolean {
    return item.status === 'LOGIN_ERROR' || item.status === 'OUTDATED';
  }
}
