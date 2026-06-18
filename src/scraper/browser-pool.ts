import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import puppeteer, { Browser, Page } from 'puppeteer'
import { configureStealth, BROWSER_LAUNCH_OPTIONS } from './stealth.config'

/**
 * Page-level pool: launches N browsers but tracks PAGES (not browsers) as
 * the unit of concurrency. A single browser hosts many pages cheaply, so
 * 4 browsers × 5 pages = 20 concurrent scrapes with the memory of 4 browsers.
 *
 * Compare with the old impl which acquired a whole browser per scrape and
 * crashed silently on timeout via uncaught throw.
 */
@Injectable()
export class BrowserPool implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name)
  private browsers: Browser[] = []
  private currentPages = 0
  private waiters: Array<() => void> = []
  private maxPages = 20
  private waitTimeoutMs = 30_000
  private rrIndex = 0

  constructor(private readonly config: ConfigService) {
    this.maxPages = Number(this.config.get('PUPPETEER_MAX_POOL_SIZE', 20))
  }

  async onModuleInit(): Promise<void> {
    const pagesPerBrowser = Number(this.config.get('PUPPETEER_PAGES_PER_BROWSER', 5))
    const browsersNeeded = Math.max(1, Math.ceil(this.maxPages / pagesPerBrowser))
    const browserlessEndpoint = this.config.get<string>('BROWSERLESS_WS_ENDPOINT')

    for (let i = 0; i < browsersNeeded; i++) {
      let browser: Browser
      if (browserlessEndpoint) {
        browser = await puppeteer.connect({ browserWSEndpoint: browserlessEndpoint })
      } else {
        const stealth = configureStealth()
        browser = await stealth.launch(BROWSER_LAUNCH_OPTIONS)
      }
      this.browsers.push(browser)
    }

    this.logger.log(
      `Browser pool ready — ${browsersNeeded} browsers, max ${this.maxPages} concurrent pages` +
        (browserlessEndpoint ? ` (browserless @ ${browserlessEndpoint})` : ' (local)'),
    )
  }

  async onModuleDestroy(): Promise<void> {
    for (const b of this.browsers) {
      try {
        await b.close()
      } catch {
        // ignore
      }
    }
    this.browsers = []
  }

  /**
   * Acquire a fresh page. Blocks (with timeout) when at max concurrency.
   * Caller MUST call releasePage(page) when done.
   */
  async acquirePage(): Promise<Page> {
    if (this.currentPages >= this.maxPages) {
      await this.waitForSlot()
    }
    this.currentPages++

    try {
      const browser = this.browsers[this.rrIndex % this.browsers.length]
      this.rrIndex = (this.rrIndex + 1) % Math.max(1, this.browsers.length)

      return await browser.newPage()
    } catch (err) {
      this.currentPages--
      this.releaseSlot()
      throw err
    }
  }

  async releasePage(page: Page): Promise<void> {
    try {
      await page.close()
    } catch (err) {
      this.logger.warn(`Error closing page: ${(err as Error).message}`)
    } finally {
      this.currentPages--
      this.releaseSlot()
    }
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(waiter)
        if (idx >= 0) this.waiters.splice(idx, 1)
        reject(new Error(`Browser page acquisition timeout after ${this.waitTimeoutMs}ms`))
      }, this.waitTimeoutMs)
      this.waiters.push(waiter)
    })
  }

  private releaseSlot(): void {
    const next = this.waiters.shift()
    if (next) next()
  }

  getStats() {
    return {
      browsers: this.browsers.length,
      maxPages: this.maxPages,
      currentPages: this.currentPages,
      waiting: this.waiters.length,
    }
  }
}
