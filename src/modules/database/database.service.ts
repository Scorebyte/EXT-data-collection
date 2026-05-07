import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, MoreThan } from 'typeorm';
import { ApiToken } from './entities/api-token.entity';
import { QueryHistory } from './entities/query-history.entity';
import { RequestLog } from './entities/request-log.entity';

export interface ValidatedCompany {
  companyId: number;
  companyName: string;
}

export type QueryHistoryStatus = 'created' | 'auth' | 'notauth' | 'error';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectRepository(ApiToken)
    private readonly apiTokenRepo: Repository<ApiToken>,

    @InjectRepository(QueryHistory)
    private readonly queryHistoryRepo: Repository<QueryHistory>,

    @InjectRepository(RequestLog)
    private readonly requestLogRepo: Repository<RequestLog>,
  ) {}

  async validateToken(rawToken: string): Promise<ValidatedCompany> {
    const token = await this.apiTokenRepo.findOne({
      where: [
        { tokenHash: rawToken, active: true, expiresAt: IsNull() },
        { tokenHash: rawToken, active: true, expiresAt: MoreThan(new Date()) },
      ],
      relations: ['company'],
    });
    if (!token) {
      throw new UnauthorizedException('Invalid or expired API token');
    }

    return {
      companyId: token.companyId,
      companyName: token.company.name,
    };
  }

  async writeQueryHistory(params: {
    cnpj: string;
    status: QueryHistoryStatus;
    companyId: number;
    domain?: string;
  }): Promise<void> {
    const now = new Date();
    await this.queryHistoryRepo.insert({
      cnpj: params.cnpj,
      status: params.status,
      companyId: params.companyId,
      domain: params.domain ?? null,
      lastUpdate: now,
      lastChecked: now,
    });
  }

  async logRequest(params: {
    companyId: number;
    endpoint: string;
    statusCode: number;
  }): Promise<void> {
    await this.requestLogRepo.insert({
      companyId: params.companyId,
      endpoint: params.endpoint,
      statusCode: params.statusCode,
    });
  }
}
