import { Injectable, Logger } from '@nestjs/common';
import type { Account, Transaction } from 'pluggy-sdk';
import { PluggyService } from '../pluggy/pluggy.service';

export interface CollectedPayload {
  accounts: Account[];
  transactions: Transaction[];
}

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);

  constructor(private readonly pluggy: PluggyService) {}

  async collect(pluggyItemId: string): Promise<CollectedPayload> {
    this.logger.log(`Starting data collection for item ${pluggyItemId}`);

    const accounts = await this.pluggy.fetchAccounts(pluggyItemId);
    this.logger.log(`Fetched ${accounts.length} accounts for item ${pluggyItemId}`);

    const allTransactions: Transaction[] = [];

    for (const account of accounts) {
      const transactions = await this.pluggy.fetchAllTransactions(account.id);
      allTransactions.push(...transactions);
      this.logger.log(`Account ${account.id} (${account.name}): ${transactions.length} transactions`);
    }

    this.logger.log(
      `Collection done — item=${pluggyItemId} accounts=${accounts.length} transactions=${allTransactions.length}`,
    );

    return { accounts, transactions: allTransactions };
  }
}
