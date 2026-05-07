import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { Connection, ConnectionDocument, ConnectionStatus } from './schemas/connection.schema';
import { PluggyService } from '../pluggy/pluggy.service';
import { DatabaseService, QueryHistoryStatus } from '../database/database.service';

const HISTORY_STATUS_MAP: Partial<Record<ConnectionStatus, QueryHistoryStatus>> = {
  [ConnectionStatus.CREATED]:   'created',
  [ConnectionStatus.CONNECTED]: 'auth',
  [ConnectionStatus.NOT_AUTH]:  'notauth',
  [ConnectionStatus.ERROR]:     'error',
};

@Injectable()
export class ConnectionService {
  private readonly logger = new Logger(ConnectionService.name);

  constructor(
    @InjectModel(Connection.name)
    private readonly connectionModel: Model<ConnectionDocument>,
    private readonly pluggy: PluggyService,
    private readonly db: DatabaseService,
  ) {}

  async initiate(cnpj: string, companyId: number): Promise<{ connectionId: string; connectUrl: string }> {
    const existing = await this.connectionModel.findOne({
      cnpj,
      companyId,
      status: { $in: [ConnectionStatus.CREATED, ConnectionStatus.CONNECTED] },
    });

    if (existing) {
      this.logger.warn(`Active connection for CNPJ ${cnpj} / company ${companyId} — returning existing`);
      return { connectionId: existing._id.toString(), connectUrl: existing.connectUrl ?? '' };
    }

    const clientUserId = `${cnpj}-${randomUUID()}`;
    const token = await this.pluggy.createConnectToken(clientUserId);
    const connectUrl = this.pluggy.buildConnectUrl(token.accessToken);

    const connection = await this.connectionModel.create({
      cnpj,
      companyId,
      clientUserId,
      status: ConnectionStatus.CREATED,
      connectToken: token.accessToken,
      connectUrl,
      statusHistory: [ConnectionStatus.CREATED],
    });

    this.syncQueryHistory(connection).catch(() => null);

    this.logger.log(`Connection initiated — cnpj=${cnpj} company=${companyId} id=${connection._id}`);
    return { connectionId: connection._id.toString(), connectUrl };
  }

  async findByClientUserId(clientUserId: string): Promise<ConnectionDocument | null> {
    return this.connectionModel.findOne({ clientUserId });
  }

  async findByPluggyItemId(pluggyItemId: string): Promise<ConnectionDocument | null> {
    return this.connectionModel.findOne({ pluggyItemId });
  }

  async findById(connectionId: string): Promise<ConnectionDocument> {
    const doc = await this.connectionModel.findById(connectionId);
    if (!doc) throw new NotFoundException(`Connection ${connectionId} not found`);
    return doc;
  }

  async transition(
    connectionId: string,
    nextStatus: ConnectionStatus,
    extra?: Partial<Connection>,
  ): Promise<ConnectionDocument> {
    const doc = await this.connectionModel.findByIdAndUpdate(
      connectionId,
      {
        $set: { status: nextStatus, ...extra },
        $push: { statusHistory: nextStatus },
      },
      { new: true },
    );

    if (!doc) throw new NotFoundException(`Connection ${connectionId} not found`);
    this.logger.log(`Connection ${connectionId} → ${nextStatus}`);

    if (HISTORY_STATUS_MAP[nextStatus]) {
      this.syncQueryHistory(doc).catch(() => null);
    }

    return doc;
  }

  async markError(connectionId: string, message: string): Promise<void> {
    const doc = await this.connectionModel.findByIdAndUpdate(
      connectionId,
      {
        $set: { status: ConnectionStatus.ERROR, lastError: { message, at: new Date() } },
        $push: { statusHistory: ConnectionStatus.ERROR },
      },
      { new: true },
    );

    this.logger.error(`Connection ${connectionId} → error: ${message}`);
    if (doc) this.syncQueryHistory(doc).catch(() => null);
  }

  async getStatus(connectionId: string): Promise<{ status: string; history: string[] }> {
    const doc = await this.findById(connectionId);
    return { status: doc.status, history: doc.statusHistory };
  }

  private async syncQueryHistory(doc: ConnectionDocument): Promise<void> {
    const historyStatus = HISTORY_STATUS_MAP[doc.status as ConnectionStatus];
    if (!historyStatus) return;

    await this.db.writeQueryHistory({
      cnpj: doc.cnpj,
      status: historyStatus,
      companyId: doc.companyId,
    });
  }
}
