import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBrowserPool } from '../../domain/ports/IBrowserPool';
import { IBrowserAutomation } from '../../domain/ports/IBrowserAutomation';
import { BrowserPool } from '../../scraper/browser-pool';
import { getRandomUserAgent } from '../../scraper/stealth.config';
import { PuppeteerBrowserAutomation } from './puppeteer-browser-automation';

@Injectable()
export class PuppeteerBrowserPool implements IBrowserPool {
  private readonly logger = new Logger(PuppeteerBrowserPool.name);

  constructor(
    private readonly browserPool: BrowserPool,
    private readonly config: ConfigService,
  ) {}

  async acquire(blockResources = true): Promise<IBrowserAutomation> {
    const page = await this.browserPool.acquirePage(blockResources);
    await page.setUserAgent(getRandomUserAgent());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'es-ES,es;q=0.9',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
    return new PuppeteerBrowserAutomation(page);
  }

  async release(browser: IBrowserAutomation): Promise<void> {
    const puppeteerBrowser = browser as PuppeteerBrowserAutomation;
    const page = (puppeteerBrowser as any)['page'];
    if (page) {
      await this.browserPool.releasePage(page).catch(() => {});
    }
  }

  getStats(): { browsers: number; maxPages: number; currentPages: number; waiting: number } {
    return this.browserPool.getStats();
  }
}
