import { Logger } from '@nestjs/common';

const logger = new Logger('RetryUtil');

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; delayMs: number; label?: string },
): Promise<T> {
  const { attempts, delayMs, label = 'operation' } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const backoff = delayMs * Math.pow(2, attempt - 1);
      logger.warn(`${label} attempt ${attempt}/${attempts} failed — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }

  logger.error(`${label} failed after ${attempts} attempts`, lastError);
  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class Semaphore {
  private permits: number;
  private readonly queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release(): void {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.permits++;
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
