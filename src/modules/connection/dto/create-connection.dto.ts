import { IsString, Matches, Length } from 'class-validator';

export class CreateConnectionDto {
  @IsString()
  @Matches(/^\d{14}$/, { message: 'cnpj must be exactly 14 digits (no punctuation)' })
  cnpj: string;
}
