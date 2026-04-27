import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Page } from 'puppeteer'
import { BrowserPool } from './browser-pool'
import { AutoScraper } from './auto-scraper'
import { SessionService } from '../sessions/session.service'
import { getRandomUserAgent } from './stealth.config'
import {
  ScrapingTaskMessage,
  ScrapingResult,
  LoginConfig,
  SearchConfig,
  SelectorMap,
  SelectorValue,
  FlowStep,
} from '../common/types'

@Injectable()
export class PuppeteerScraper {
  private readonly logger = new Logger(PuppeteerScraper.name)
  private readonly defaultTimeout: number

  constructor(
    private readonly browserPool: BrowserPool,
    private readonly sessions: SessionService,
    private readonly config: ConfigService,
    private readonly autoScraper: AutoScraper,
  ) {
    this.defaultTimeout = Number(this.config.get('PUPPETEER_TIMEOUT', 60_000))
  }

  async run(task: ScrapingTaskMessage): Promise<ScrapingResult> {
    const startedAt = new Date()
    const blockResources = task.performance?.blockResources !== false
    const timeout = task.performance?.timeoutMs ?? this.defaultTimeout

    let page: Page | null = null
    try {
      this.logger.log(`🚀 Job ${task.jobId} → ${task.url} [${task.strategy}]`)
      page = await this.browserPool.acquirePage(blockResources)

      await page.setUserAgent(getRandomUserAgent())
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      })

      const data = await this.executeStrategy(page, task, timeout)

      const completedAt = new Date()
      this.logger.log(
        `✅ Job ${task.jobId} completed in ${completedAt.getTime() - startedAt.getTime()}ms`,
      )
      return {
        jobId: task.jobId,
        userId: task.userId,
        url: task.url,
        success: true,
        data,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      }
    } catch (err) {
      const message = (err as Error).message
      this.logger.error(`❌ Job ${task.jobId} failed: ${message}`)
      const completedAt = new Date()
      return {
        jobId: task.jobId,
        userId: task.userId,
        url: task.url,
        success: false,
        error: message,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      }
    } finally {
      if (page) {
        await this.browserPool.releasePage(page).catch(() => {})
      }
    }
  }

  private async executeStrategy(
    page: Page,
    task: ScrapingTaskMessage,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    switch (task.strategy) {
      case 'auto':
        return this.runAuto(page, task.url, timeout)
      case 'extract':
        return this.runExtract(page, task.url, task.selectors ?? {}, timeout)
      case 'search':
        if (!task.search) throw new Error('search strategy requires `search` config')
        return this.runSearch(page, task.url, task.search, task.selectors ?? {}, timeout)
      case 'login_then_extract':
        if (!task.login) throw new Error('login_then_extract requires `login` config')
        return this.runLoginExtract(page, task.url, task.login, task.selectors ?? {}, timeout)
      case 'login_then_search':
        if (!task.login || !task.search)
          throw new Error('login_then_search requires `login` and `search` config')
        return this.runLoginSearch(
          page,
          task.url,
          task.login,
          task.search,
          task.selectors ?? {},
          timeout,
        )
      case 'custom_flow':
        if (!task.flow || task.flow.length === 0)
          throw new Error('custom_flow strategy requires `flow` array')
        return this.runFlow(page, task.url, task.flow, timeout)
      default:
        throw new Error(`Unknown strategy: ${(task as { strategy: string }).strategy}`)
    }
  }

  // ─────────────────────────── Strategies ───────────────────────────

  private async runAuto(page: Page, url: string, timeout: number): Promise<Record<string, unknown>> {
    await this.navigate(page, url, timeout)
    await this.sleep(1500)
    const content = await this.autoScraper.autoScrape(page)
    return {
      title: content.title,
      sections: content.sections,
      links: content.links,
      text: content.text,
    }
  }

  private async runExtract(
    page: Page,
    url: string,
    selectors: SelectorMap,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    await this.navigate(page, url, timeout)
    return this.extract(page, selectors)
  }

  private async runSearch(
    page: Page,
    url: string,
    search: SearchConfig,
    selectors: SelectorMap,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    await this.navigate(page, url, timeout)
    await this.performSearch(page, search, timeout)
    return this.extract(page, selectors)
  }

  private async runLoginExtract(
    page: Page,
    url: string,
    login: LoginConfig,
    selectors: SelectorMap,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    await this.ensureLoggedIn(page, url, login, timeout)
    return this.extract(page, selectors)
  }

  private async runLoginSearch(
    page: Page,
    url: string,
    login: LoginConfig,
    search: SearchConfig,
    selectors: SelectorMap,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    await this.ensureLoggedIn(page, url, login, timeout)
    await this.performSearch(page, search, timeout)
    return this.extract(page, selectors)
  }

  private async runFlow(
    page: Page,
    url: string,
    flow: FlowStep[],
    timeout: number,
  ): Promise<Record<string, unknown>> {
    await this.navigate(page, url, timeout)
    const result: Record<string, unknown> = {}
    for (const step of flow) {
      await this.runStep(page, step, timeout)
      if (step.type === 'extract') {
        Object.assign(result, await this.extract(page, step.selectors))
      }
    }
    return result
  }

  private async runStep(page: Page, step: FlowStep, timeout: number): Promise<void> {
    switch (step.type) {
      case 'navigate':
        await this.navigate(page, step.url, timeout)
        break
      case 'click':
        await page.waitForSelector(step.selector, { timeout })
        await page.click(step.selector)
        break
      case 'type':
        await page.waitForSelector(step.selector, { timeout })
        await page.type(step.selector, step.text, { delay: step.delayMs ?? 50 })
        break
      case 'wait':
        if (step.selector) {
          await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? timeout })
        } else {
          await this.sleep(step.sleepMs ?? 1000)
        }
        break
      case 'scroll':
        if (step.toBottom) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        } else if (step.px) {
          await page.evaluate((px) => window.scrollBy(0, px), step.px)
        }
        break
      case 'extract':
        // Aggregated in runFlow loop
        break
    }
  }

  // ─────────────────────────── Login + sessions ───────────────────────────

  private async ensureLoggedIn(
    page: Page,
    url: string,
    login: LoginConfig,
    timeout: number,
  ): Promise<void> {
    if (login.sessionKey) {
      const restored = await this.sessions.load(page, url, login.sessionKey)
      if (restored) {
        if (login.successSelector) {
          try {
            await page.waitForSelector(login.successSelector, { timeout: 5000 })
            this.logger.log(`✅ Session valid, skipping login for ${login.sessionKey}`)
            return
          } catch {
            this.logger.log(`Restored session is stale, re-logging in for ${login.sessionKey}`)
          }
        } else {
          this.logger.log(`✅ Session restored (no validation selector configured)`)
          return
        }
      }
    }

    await this.navigate(page, url, timeout)
    await this.performLogin(page, login, timeout)

    if (login.sessionKey) {
      await this.sessions.save(page, url, login.sessionKey)
    }
  }

  private async performLogin(page: Page, login: LoginConfig, timeout: number): Promise<void> {
    await page.waitForSelector(login.usernameSelector, { timeout })
    await page.type(login.usernameSelector, login.username, { delay: 50 })
    await this.sleep(300)
    await page.type(login.passwordSelector, login.password, { delay: 50 })
    await this.sleep(300)
    await page.click(login.submitSelector)

    if (login.successSelector) {
      await page.waitForSelector(login.successSelector, { timeout })
    } else {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout }).catch(() => {}),
        this.sleep(5000),
      ])
    }
  }

  private async performSearch(page: Page, search: SearchConfig, timeout: number): Promise<void> {
    await page.waitForSelector(search.inputSelector, { timeout })
    await page.type(search.inputSelector, search.query, { delay: 30 })
    await this.sleep(300)
    await page.click(search.submitSelector)

    if (search.waitForSelector) {
      await page.waitForSelector(search.waitForSelector, { timeout })
    } else {
      await this.sleep(search.waitMs ?? 2000)
    }
  }

  // ─────────────────────────── Helpers ───────────────────────────

  private async navigate(page: Page, url: string, timeout: number): Promise<void> {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout })
    } catch {
      this.logger.warn(`Navigation timeout, retrying with networkidle0...`)
      await page
        .goto(url, { waitUntil: 'networkidle0', timeout: Math.floor(timeout / 2) })
        .catch(() => {})
    }
  }

  private async extract(page: Page, selectors: SelectorMap): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(selectors)) {
      try {
        result[key] = await this.extractOne(page, value)
      } catch (err) {
        this.logger.warn(`Failed to extract "${key}": ${(err as Error).message}`)
        result[key] = null
      }
    }
    return result
  }

  private async extractOne(page: Page, selector: SelectorValue): Promise<unknown> {
    if (typeof selector === 'string') {
      const values = await page.$$eval(selector, (els) =>
        els.map((el) => el.textContent?.trim() ?? ''),
      )
      return values.length === 1 ? values[0] : values
    }

    if ('css' in selector) {
      const attr = selector.attr
      const values = await page.$$eval(
        selector.css,
        (els, a) => els.map((el) => (a ? el.getAttribute(a) : el.textContent?.trim()) ?? ''),
        attr,
      )
      return values.length === 1 ? values[0] : values
    }

    if ('xpath' in selector) {
      const handles = await page.$x(selector.xpath)
      const attr = selector.attr
      const values = await Promise.all(
        handles.map(async (h) => {
          const el = h.asElement()
          if (!el) return ''
          if (attr) {
            return await page.evaluate(
              (node, a) => (node as Element).getAttribute(a) ?? '',
              el,
              attr,
            )
          }
          return await page.evaluate((node) => (node as Element).textContent?.trim() ?? '', el)
        }),
      )
      return values.length === 1 ? values[0] : values
    }

    if ('text' in selector) {
      return await page.evaluate((searchText) => {
        const xpath = `//*[contains(text(), "${searchText.replace(/"/g, '\\"')}")]`
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        )
        const node = result.singleNodeValue as Element | null
        return node?.textContent?.trim() ?? ''
      }, selector.text)
    }

    return null
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
