import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ConnectionService } from './connection.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { ApiTokenGuard } from '../../common/guards/api-token.guard';
import { RequestLogInterceptor } from '../../common/interceptors/request-log.interceptor';
import { ValidatedCompany } from '../database/database.service';

@Controller('connections')
@UseGuards(ApiTokenGuard)
@UseInterceptors(RequestLogInterceptor)
export class ConnectionController {
  constructor(private readonly connectionService: ConnectionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async initiate(@Body() dto: CreateConnectionDto, @Req() req: Request) {
    const company = (req as any).company as ValidatedCompany;
    const result = await this.connectionService.initiate(dto.cnpj, company.companyId);
    return {
      connectionId: result.connectionId,
      connectUrl: result.connectUrl,
      company: company.companyName,
    };
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    return this.connectionService.getStatus(id);
  }
}
