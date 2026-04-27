import { Injectable, Logger } from '@nestjs/common'
import { Page, Protocol } from 'puppeteer'
import { RedisService } from '../redis/redis.service'

interface CachedSession {
  cookies: Protocol.Network.CookieParam[]
  localStorage: Record<string, string>
  domain: string
  savedAt: string
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60  // 7 days

/**
 * Session persistence for login-based scraping.
 *
 * Flow:
 *  - After a successful login, `save()` snapshots cookies + localStorage to
 *    Redis under `scraping:session:<domain>:<sessionKey>` with 7-day TTL.
 *  - Before logging in next time, `load()` restores them. Caller still
 *    navigates and (optionally) verifies the session is valid via a
 *    `successSelector`.
 *
 * We never store passwords here — only the resulting authenticated state.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name)

  constructor(private readonly redis: RedisService) {}

  private key(domain: string, sessionKey: string): string {
    return `scraping:session:${domain}:${sessionKey}`
  }

  private domainOf(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return 'unknown'
    }
  }

  /**
   * Restore a previously saved session into a fresh page. Caller must
   * navigate to the protected URL after this returns true.
   * Returns false if no session was found (caller should do a normal login).
   */
  async load(page: Page, url: string, sessionKey: string): Promise<boolean> {
    const domain = this.domainOf(url)
    const cached = await this.redis.getJson<CachedSession>(this.key(domain, sessionKey))
    if (!cached) {
      this.logger.debug(`No session found for ${domain}/${sessionKey}`)
      return false
    }

    try {
      // Cookies must be set BEFORE navigation
      if (cached.cookies?.length) {
        await page.setCookie(...cached.cookies)
      }

      // Navigate to apply cookies + access localStorage
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      if (cached.localStorage && Object.keys(cached.localStorage).length > 0) {
        await page.evaluate((items) => {
          Object.entries(items).forEach(([k, v]) => {
            try {
              localStorage.setItem(k, v as string)
            } catch {
              // localStorage may be blocked on some pages; ignore
            }
          })
        }, cached.localStorage)
        // Reload so localStorage takes effect
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {})
      }

      this.logger.log(`✅ Session restored for ${domain}/${sessionKey}`)
      return true
    } catch (err) {
      this.logger.warn(`Session restore failed for ${domain}/${sessionKey}: ${(err as Error).message}`)
      return false
    }
  }

  /**
   * Snapshot the current page's cookies + localStorage for future reuse.
   * Call this AFTER a successful login.
   */
  async save(page: Page, url: string, sessionKey: string): Promise<void> {
    const domain = this.domainOf(url)
    try {
      const cookies = await page.cookies()
      const localStorageItems = await page.evaluate(() => {
        const items: Record<string, string> = {}
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i)
            if (k) items[k] = localStorage.getItem(k) ?? ''
          }
        } catch {
          // localStorage may be blocked
        }
        return items
      })

      await this.redis.setJson(
        this.key(domain, sessionKey),
        {
          cookies,
          localStorage: localStorageItems,
          domain,
          savedAt: new Date().toISOString(),
        } satisfies CachedSession,
        SESSION_TTL_SECONDS,
      )

      this.logger.log(
        `💾 Session saved for ${domain}/${sessionKey} (${cookies.length} cookies, ${Object.keys(localStorageItems).length} localStorage entries)`,
      )
    } catch (err) {
      this.logger.warn(`Failed to save session: ${(err as Error).message}`)
    }
  }

  async clear(domain: string, sessionKey: string): Promise<void> {
    await this.redis.del(this.key(domain, sessionKey))
    this.logger.log(`Session cleared for ${domain}/${sessionKey}`)
  }
}
