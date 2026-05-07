import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;
  const logger = new Logger('Bootstrap');

  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.setGlobalPrefix('api/v1');

  await app.listen(port);
  logger.log(`Open Finance Orchestrator running on port ${port}`);
  logger.log(`Webhook endpoint: POST /api/v1/webhooks/pluggy`);
}

bootstrap();
