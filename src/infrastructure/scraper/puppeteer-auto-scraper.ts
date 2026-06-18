import { Injectable } from '@nestjs/common';
import { IAutoScraper, AutoScrapedContent } from '../../domain/ports/IAutoScraper';
import { IBrowserAutomation } from '../../domain/ports/IBrowserAutomation';
import { AutoScraper } from '../../scraper/auto-scraper';
import { PuppeteerBrowserAutomation } from '../browser/puppeteer-browser-automation';

@Injectable()
export class PuppeteerAutoScraper implements IAutoScraper {
  constructor(private readonly autoScraper: AutoScraper) {}

  async autoScrape(browser: IBrowserAutomation): Promise<AutoScrapedContent> {
    const puppeteer = browser as PuppeteerBrowserAutomation;
    const page = (puppeteer as any)['page'];
    return this.autoScraper.autoScrape(page);
  }
}
