import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { DatabaseService } from '../../modules/database/database.service';

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLogInterceptor.name);

  constructor(private readonly db: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const company = (req as any).company;

    return next.handle().pipe(
      tap({
        next: () => this.log(company?.companyId, req.path, res.statusCode),
        error: (err) => this.log(company?.companyId, req.path, err?.status ?? 500),
      }),
    );
  }

  private log(companyId: number | undefined, endpoint: string, statusCode: number): void {
    if (!companyId) return;
    this.db
      .logRequest({ companyId, endpoint, statusCode })
      .catch(err => this.logger.warn(`Failed to log request: ${err.message}`));
  }
}
