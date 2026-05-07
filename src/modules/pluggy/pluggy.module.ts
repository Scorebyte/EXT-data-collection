import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PluggyService } from './pluggy.service';

@Module({
  imports: [ConfigModule],
  providers: [PluggyService],
  exports: [PluggyService],
})
export class PluggyModule {}
