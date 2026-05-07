import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';

@Entity({ schema: 'public', name: 'query_history' })
export class QueryHistory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ type: 'varchar' })
  cnpj: string;

  @Column({ type: 'varchar' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  domain: string | null;

  @Column({ name: 'last_update', type: 'timestamp', nullable: true })
  lastUpdate: Date | null;

  @Column({ name: 'last_checked', type: 'timestamp', nullable: true })
  lastChecked: Date | null;

  @Column({ name: 'company_id', type: 'bigint' })
  companyId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
