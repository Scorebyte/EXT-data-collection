import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Envelope, EnvelopeDocument, EnvelopeEvent, EnvelopeStatus } from './schemas/envelope.schema';
import type { Account, Transaction } from 'pluggy-sdk';

export interface EnvelopeBody {
  connectionId: string;
  cnpj: string;
  pluggyItemId: string;
  collectedAt: string;
  accounts: Account[];
  transactions: Transaction[];
}

const DOMAIN_NAME = 'data-collection';

@Injectable()
export class EnvelopeService {
  private readonly logger = new Logger(EnvelopeService.name);

  constructor(
    @InjectModel(Envelope.name)
    private readonly envelopeModel: Model<EnvelopeDocument>,
  ) {}

  async create(data: EnvelopeBody): Promise<string> {
    const now = new Date();
    const doc = await this.envelopeModel.create({
      event: EnvelopeEvent.OPEN_FINANCE_DATA_COLLECTED,
      lastUpdate: now,
      status: EnvelopeStatus.PENDING,
      domainName: DOMAIN_NAME,
      body: {
        connectionId: data.connectionId,
        cnpj: data.cnpj,
        pluggyItemId: data.pluggyItemId,
        collectedAt: data.collectedAt,
        accounts: data.accounts,
        transactions: data.transactions,
      },
      error: null,
    });

    this.logger.log(
      `Envelope created — id=${doc._id} cnpj=${data.cnpj} accounts=${data.accounts.length} transactions=${data.transactions.length}`,
    );

    return doc._id.toString();
  }

  async markError(transactionId: string, errorMessage: string): Promise<void> {
    await this.envelopeModel.findByIdAndUpdate(transactionId, {
      $set: {
        status: EnvelopeStatus.ERROR,
        error: errorMessage,
        lastUpdate: new Date(),
      },
    });
  }
}
