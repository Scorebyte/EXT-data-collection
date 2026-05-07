import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookService } from './webhook.service';
import { PluggyWebhookPayload } from './dto/pluggy-webhook.dto';

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly config: ConfigService,
  ) {}

  @Post('pluggy')
  @HttpCode(HttpStatus.OK)
  async handlePluggy(
    @Body() payload: PluggyWebhookPayload,
    @Headers('x-pluggy-signature') signature: string,
  ) {
    this.validateSignature(payload, signature);

    this.webhookService.handlePluggyEvent(payload).catch(err =>
      this.logger.error(`Error processing Pluggy webhook: ${err.message}`, err.stack),
    );

    return { received: true };
  }

  private validateSignature(payload: unknown, signature: string): void {
    const secret = this.config.get<string>('pluggy.webhookSecret');
    if (!secret) return;

    if (!signature) throw new UnauthorizedException('Missing webhook signature');

    const expected = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      const sigBuffer = Buffer.from(signature, 'hex');
      const expBuffer = Buffer.from(expected, 'hex');
      if (sigBuffer.length !== expBuffer.length || !timingSafeEqual(sigBuffer, expBuffer)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }
}
