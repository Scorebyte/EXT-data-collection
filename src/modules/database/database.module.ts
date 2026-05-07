import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { ApiToken } from './entities/api-token.entity';
import { QueryHistory } from './entities/query-history.entity';
import { RequestLog } from './entities/request-log.entity';
import { DatabaseService } from './database.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('database.url'),
        ssl: { rejectUnauthorized: false },
        entities: [Company, ApiToken, QueryHistory, RequestLog],
        synchronize: false,
        retryAttempts: 3,
        retryDelay: 3000,
        logging: config.get<string>('nodeEnv') === 'development' ? ['error', 'warn'] : ['error'],
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Company, ApiToken, QueryHistory, RequestLog]),
  ],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
