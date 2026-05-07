import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../modules/database/database.service';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return this.deny('Missing Bearer token');
    }

    const rawToken = authHeader.slice(7).trim();
    if (!rawToken) {
      return this.deny('Missing Bearer token');
    }

    const company = await this.db.validateToken(rawToken);
    (request as any).company = company;

    return true;
  }

  private deny(message: string): never {
    const { UnauthorizedException } = require('@nestjs/common');
    throw new UnauthorizedException(message);
  }
}
