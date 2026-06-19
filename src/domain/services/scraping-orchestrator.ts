import { ScrapingTaskMessage } from '../value-objects/scraping-task';
import { ScrapingResult } from '../value-objects/scraping-result';
import { IBrowserAutomation } from '../ports/IBrowserAutomation';
import { ISessionManager } from '../ports/ISessionManager';
import { IAutoScraper } from '../ports/IAutoScraper';
import { LoginConfig } from '../value-objects/login-config';
import { SearchConfig } from '../value-objects/search-config';
import { SelectorValue, SelectorMap } from '../value-objects/selector';
import { FlowStep } from '../value-objects/flow-step';
import { Timed } from '../../utils/timing';

export class ScrapingOrchestrator {
  constructor(
    private readonly browser: IBrowserAutomation,
    private readonly timeout: number,
    private readonly sessionManager?: ISessionManager,
    private readonly autoScraper?: IAutoScraper,
  ) {}

  @Timed()
  async execute(task: ScrapingTaskMessage): Promise<Record<string, unknown>> {
    switch (task.strategy) {
      case 'auto': {
        if (!this.autoScraper) throw new Error('AutoScraper required for auto strategy');
        await this.navigate(task.url);
        await this.sleep(1500);
        const content = await this.autoScraper.autoScrape(this.browser);
        return { title: content.title, sections: content.sections, links: content.links, text: content.text };
      }
      case 'extract':
        await this.navigate(task.url);
        return this.extract(task.selectors ?? {});
      case 'search': {
        if (!task.search) throw new Error('search strategy requires search config');
        await this.navigate(task.url);
        await this.performSearch(task.search);
        return this.extract(task.selectors ?? {});
      }
      case 'login_then_extract': {
        if (!task.login) throw new Error('login_then_extract requires login config');
        await this.ensureLoggedIn(task.url, task.login);
        return this.extract(task.selectors ?? {});
      }
      case 'login_then_search': {
        if (!task.login || !task.search) throw new Error('login_then_search requires login and search config');
        await this.ensureLoggedIn(task.url, task.login);
        await this.performSearch(task.search);
        return this.extract(task.selectors ?? {});
      }
      case 'custom_flow': {
        if (!task.flow?.length) throw new Error('custom_flow requires flow array');
        await this.navigate(task.url);
        const result: Record<string, unknown> = {};
        for (const step of task.flow) {
          await this.runStep(step);
          if (step.type === 'extract') {
            Object.assign(result, await this.extract(step.selectors));
          }
        }
        return result;
      }
      default:
        throw new Error(`Unknown strategy: ${(task as { strategy: string }).strategy}`);
    }
  }

  private async ensureLoggedIn(url: string, login: LoginConfig): Promise<void> {
    if (login.sessionKey && this.sessionManager) {
      const restored = await this.sessionManager.load(this.browser, url, login.sessionKey);
      if (restored) {
        if (login.successSelector) {
          try {
            await this.browser.waitForSelector(login.successSelector, 5000);
            return;
          } catch {
            // session stale, re-login
          }
        } else {
          return;
        }
      }
    }

    await this.navigate(url);
    await this.performLogin(login);

    if (login.sessionKey && this.sessionManager) {
      await this.sessionManager.save(this.browser, url, login.sessionKey);
    }
  }

  private async performLogin(login: LoginConfig): Promise<void> {
    await this.browser.waitForSelector(login.usernameSelector, this.timeout);
    await this.browser.type(login.usernameSelector, login.username, 50);
    await this.sleep(300);
    await this.browser.type(login.passwordSelector, login.password, 50);
    await this.sleep(300);
    await this.browser.click(login.submitSelector);

    if (login.successSelector) {
      await this.browser.waitForSelector(login.successSelector, this.timeout);
    } else {
      await this.sleep(5000);
    }
  }

  private async performSearch(search: SearchConfig): Promise<void> {
    await this.browser.waitForSelector(search.inputSelector, this.timeout);
    await this.browser.type(search.inputSelector, search.query, 30);
    await this.sleep(300);
    await this.browser.click(search.submitSelector);

    if (search.waitForSelector) {
      await this.browser.waitForSelector(search.waitForSelector, this.timeout);
    } else {
      await this.sleep(search.waitMs ?? 2000);
    }
  }

  private async navigate(url: string): Promise<void> {
    try {
      await this.browser.goto(url, this.timeout);
    } catch {
      await this.browser.goto(url, Math.floor(this.timeout / 2));
    }
  }

  private async extract(selectors: SelectorMap): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(selectors)) {
      try {
        result[key] = await this.extractOne(value);
      } catch {
        result[key] = null;
      }
    }
    return result;
  }

  private async extractOne(selector: SelectorValue): Promise<unknown> {
    if (typeof selector === 'string') {
      const values = await this.browser.extractText(selector);
      return values.length === 1 ? values[0] : values;
    }

    if ('css' in selector) {
      if (selector.attr) {
        const values = await this.browser.extractAttribute(selector.css, selector.attr);
        return values.length === 1 ? values[0] : values;
      }
      const values = await this.browser.extractText(selector.css);
      return values.length === 1 ? values[0] : values;
    }

    if ('xpath' in selector) {
      const values = await this.browser.extractXPath(selector.xpath, selector.attr);
      return values.length === 1 ? values[0] : values;
    }

    if ('text' in selector) {
      return await this.browser.extractByText(selector.text);
    }

    return null;
  }

  private async runStep(step: FlowStep): Promise<void> {
    switch (step.type) {
      case 'navigate':
        await this.navigate(step.url);
        break;
      case 'click':
        await this.browser.waitForSelector(step.selector, this.timeout);
        await this.browser.click(step.selector);
        break;
      case 'type':
        await this.browser.waitForSelector(step.selector, this.timeout);
        await this.browser.type(step.selector, step.text, step.delayMs ?? 50);
        break;
      case 'wait':
        if (step.selector) {
          await this.browser.waitForSelector(step.selector, step.timeoutMs ?? this.timeout);
        } else {
          await this.sleep(step.sleepMs ?? 1000);
        }
        break;
      case 'scroll':
        if (step.toBottom) {
          await this.browser.scrollToBottom();
        } else if (step.px) {
          await this.browser.scrollBy(step.px);
        }
        break;
      case 'extract':
        break;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
