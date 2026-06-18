import { Page } from 'puppeteer';
import { IBrowserAutomation, BrowserCookie } from '../../domain/ports/IBrowserAutomation';

export class PuppeteerBrowserAutomation implements IBrowserAutomation {
  constructor(private readonly page: Page) {}

  async navigate(url: string, timeout?: number): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout });
  }

  async waitForSelector(selector: string, timeout?: number): Promise<void> {
    await this.page.waitForSelector(selector, { timeout });
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async type(selector: string, text: string, delay?: number): Promise<void> {
    await this.page.type(selector, text, { delay });
  }

  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }

  async scrollBy(px: number): Promise<void> {
    await this.page.evaluate((p) => window.scrollBy(0, p), px);
  }

  async extractText(selector: string): Promise<string[]> {
    return this.page.$$eval(selector, (els) =>
      els.map((el) => (el as HTMLElement).innerText?.trim() ?? el.textContent?.trim() ?? ''),
    );
  }

  async extractAttribute(selector: string, attr: string): Promise<string[]> {
    return this.page.$$eval(selector, (els, a) =>
      els.map((el) => el.getAttribute(a as string) ?? ''),
      attr,
    );
  }

  async extractAllText(selector: string): Promise<string[]> {
    return this.extractText(selector);
  }

  async extractXPath(xpath: string, attr?: string): Promise<string[]> {
    const handles = await this.page.$x(xpath);
    const values = await Promise.all(
      handles.map(async (h) => {
        const el = h.asElement();
        if (!el) return '';
        if (attr) {
          return await this.page.evaluate((node, a) => (node as Element).getAttribute(a as string) ?? '', el, attr);
        }
        return await this.page.evaluate((node) => (node as Element).textContent?.trim() ?? '', el);
      }),
    );
    return values;
  }

  async extractByText(text: string): Promise<string> {
    return this.page.evaluate((searchText) => {
      const xpath = `//*[contains(text(), "${searchText.replace(/"/g, '\\"')}")]`;
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      const node = result.singleNodeValue as Element | null;
      return node?.textContent?.trim() ?? '';
    }, text);
  }

  async extractLinks(): Promise<Array<{ href: string; text: string }>> {
    return this.page.$$eval('a[href]', (els) =>
      els
        .map((el) => {
          const href = (el as HTMLAnchorElement).href;
          const text = el.textContent?.trim() ?? '';
          return href && href !== '#' && text ? { href, text } : null;
        })
        .filter((x): x is { href: string; text: string } => x !== null),
    );
  }

  async extractTitle(): Promise<string> {
    return this.page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (h1) return h1.textContent?.trim() ?? '';
      const title = document.querySelector('title');
      return title?.textContent?.trim() ?? '';
    });
  }

  async extractBodyText(): Promise<string> {
    return this.page.evaluate(() => document.body.innerText ?? '');
  }

  async extractSections(): Promise<string[]> {
    return this.page.evaluate(() => {
      const sections: string[] = [];
      document.querySelectorAll('h2, h3').forEach((h) => {
        const text = h.textContent?.trim();
        if (text) sections.push(text);
      });
      return sections;
    });
  }

  async getCookies(): Promise<BrowserCookie[]> {
    const cookies = await this.page.cookies();
    return cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
      expires: c.expires,
    }));
  }

  async setCookies(cookies: BrowserCookie[]): Promise<void> {
    await this.page.setCookie(
      ...cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        expires: c.expires,
      })),
    );
  }

  async getLocalStorage(): Promise<Record<string, string>> {
    return this.page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) items[k] = localStorage.getItem(k) ?? '';
      }
      return items;
    });
  }

  async setLocalStorage(items: Record<string, string>): Promise<void> {
    await this.page.evaluate((stored) => {
      Object.entries(stored).forEach(([k, v]) => {
        try { localStorage.setItem(k, v); } catch {}
      });
    }, items);
  }

  async executeScript<T>(fn: string): Promise<T> {
    return this.page.evaluate(new Function(fn) as () => T);
  }

  async setUserAgent(userAgent: string): Promise<void> {
    await this.page.setUserAgent(userAgent);
  }

  async setExtraHeaders(headers: Record<string, string>): Promise<void> {
    await this.page.setExtraHTTPHeaders(headers);
  }

  async sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async goto(url: string, timeout?: number): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout });
  }

  async reload(timeout?: number): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout });
  }
}
