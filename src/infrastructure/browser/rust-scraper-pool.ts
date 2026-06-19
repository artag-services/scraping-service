import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IBrowserPool } from '../../domain/ports/IBrowserPool';
import { IBrowserAutomation, BrowserCookie } from '../../domain/ports/IBrowserAutomation';
import { AutoScrapedContent } from '../../domain/ports/IAutoScraper';

interface RustScrapeResponse {
  title: string;
  sections: string[];
  links: Array<{ href: string; text: string }>;
  text: string;
}

class RustScraperSession implements IBrowserAutomation {
  private cached: RustScrapeResponse | null = null;
  private currentUrl = '';

  constructor(private readonly rustUrl: string) {}

  private async callScrape(url: string, timeout: number): Promise<RustScrapeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout + 5000);

    try {
      const response = await fetch(`${this.rustUrl}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, timeout_ms: timeout }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Rust scraper error (${response.status}): ${body}`);
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async navigate(url: string, timeout?: number): Promise<void> {
    this.currentUrl = url;
    this.cached = await this.callScrape(url, timeout ?? 30_000);
  }

  async goto(url: string, timeout?: number): Promise<void> {
    return this.navigate(url, timeout);
  }

  async extractTitle(): Promise<string> {
    return this.cached?.title ?? '';
  }

  async extractSections(): Promise<string[]> {
    return this.cached?.sections ?? [];
  }

  async extractLinks(): Promise<Array<{ href: string; text: string }>> {
    return this.cached?.links ?? [];
  }

  async extractBodyText(): Promise<string> {
    return this.cached?.text ?? '';
  }

  async waitForSelector(_selector: string, _timeout?: number): Promise<void> {
    throw new Error('waitForSelector not supported without browser');
  }

  async click(_selector: string): Promise<void> {
    throw new Error('click not supported without browser');
  }

  async type(_selector: string, _text: string, _delay?: number): Promise<void> {
    throw new Error('type not supported without browser');
  }

  async scrollToBottom(): Promise<void> {
    throw new Error('scrollToBottom not supported without browser');
  }

  async scrollBy(_px: number): Promise<void> {
    throw new Error('scrollBy not supported without browser');
  }

  async extractText(_selector: string): Promise<string[]> {
    throw new Error('extractText not supported without browser');
  }

  async extractAttribute(_selector: string, _attr: string): Promise<string[]> {
    throw new Error('extractAttribute not supported without browser');
  }

  async extractAllText(_selector: string): Promise<string[]> {
    throw new Error('extractAllText not supported without browser');
  }

  async extractXPath(_xpath: string, _attr?: string): Promise<string[]> {
    throw new Error('extractXPath not supported without browser');
  }

  async extractByText(_text: string): Promise<string> {
    throw new Error('extractByText not supported without browser');
  }

  async getCookies(): Promise<BrowserCookie[]> {
    return [];
  }

  async setCookies(_cookies: BrowserCookie[]): Promise<void> {
    throw new Error('setCookies not supported without browser');
  }

  async getLocalStorage(): Promise<Record<string, string>> {
    return {};
  }

  async setLocalStorage(_items: Record<string, string>): Promise<void> {
    throw new Error('setLocalStorage not supported without browser');
  }

  async executeScript<T>(_fn: string): Promise<T> {
    throw new Error('executeScript not supported without browser');
  }

  async setUserAgent(_userAgent: string): Promise<void> {
    // Rust scraper uses its own UA
  }

  async setExtraHeaders(_headers: Record<string, string>): Promise<void> {
    // Rust scraper uses its own headers
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async reload(_timeout?: number): Promise<void> {
    if (this.currentUrl) {
      this.cached = await this.callScrape(this.currentUrl, _timeout ?? 30_000);
    }
  }
}

@Injectable()
export class RustScraperPool implements IBrowserPool {
  private readonly logger = new Logger(RustScraperPool.name);

  constructor(private readonly config: ConfigService) {}

  async acquire(): Promise<IBrowserAutomation> {
    const rustUrl = this.config.get('RUST_SCRAPER_URL', 'http://127.0.0.1:3009');
    return new RustScraperSession(rustUrl);
  }

  async release(_browser: IBrowserAutomation): Promise<void> {
    // stateless — nothing to clean up
  }

  getStats() {
    return { browsers: 1, maxPages: 100, currentPages: 0, waiting: 0 };
  }
}
