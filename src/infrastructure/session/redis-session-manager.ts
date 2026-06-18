import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBrowserAutomation, BrowserCookie } from '../../domain/ports/IBrowserAutomation';
import { ISessionManager } from '../../domain/ports/ISessionManager';
import { RedisService } from '../../redis/redis.service';

interface CachedSession {
  cookies: BrowserCookie[];
  localStorage: Record<string, string>;
  domain: string;
  savedAt: string;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class RedisSessionManager implements ISessionManager {
  private readonly logger = new Logger(RedisSessionManager.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  private key(domain: string, sessionKey: string): string {
    return `scraping:session:${domain}:${sessionKey}`;
  }

  private domainOf(url: string): string {
    try { return new URL(url).hostname; } catch { return 'unknown'; }
  }

  async load(browser: IBrowserAutomation, url: string, sessionKey: string): Promise<boolean> {
    const domain = this.domainOf(url);
    const cached = await this.redis.getJson<CachedSession>(this.key(domain, sessionKey));
    if (!cached) return false;

    try {
      if (cached.cookies?.length) {
        await browser.setCookies(cached.cookies);
      }
      await browser.goto(url);
      if (cached.localStorage && Object.keys(cached.localStorage).length > 0) {
        await browser.setLocalStorage(cached.localStorage);
        await browser.reload();
      }
      return true;
    } catch (err) {
      this.logger.warn(`Session restore failed for ${domain}/${sessionKey}: ${(err as Error).message}`);
      return false;
    }
  }

  async save(browser: IBrowserAutomation, url: string, sessionKey: string): Promise<void> {
    const domain = this.domainOf(url);
    try {
      const cookies = await browser.getCookies();
      const localStorage = await browser.getLocalStorage();

      await this.redis.setJson(
        this.key(domain, sessionKey),
        { cookies, localStorage, domain, savedAt: new Date().toISOString() } satisfies CachedSession,
        SESSION_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`Failed to save session: ${(err as Error).message}`);
    }
  }

  async clear(domain: string, sessionKey: string): Promise<void> {
    await this.redis.del(this.key(domain, sessionKey));
  }
}
