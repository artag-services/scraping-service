/**
 * Public DTO + internal types for the scraping service.
 *
 * The DTO (`ScrapingTaskRequest`) is what the gateway publishes; the service
 * adds a `jobId` to make it a `ScrapingTaskMessage` before processing.
 */

export type ScrapingStrategy =
  | 'auto'
  | 'extract'
  | 'search'
  | 'login_then_extract'
  | 'login_then_search'
  | 'custom_flow'

export interface ScrapingTaskRequest {
  url: string
  userId?: string
  strategy: ScrapingStrategy

  selectors?: SelectorMap
  search?: SearchConfig
  login?: LoginConfig
  flow?: FlowStep[]

  output?: OutputConfig
  performance?: PerformanceConfig
  lifecycle?: LifecycleConfig
}

export interface ScrapingTaskMessage extends ScrapingTaskRequest {
  jobId: string
}

/**
 * A selector for extracting data. Supports plain CSS, CSS+attribute, XPath,
 * or text-content lookup.
 */
export type SelectorValue =
  | string                                          // plain CSS, returns textContent
  | { css: string; attr?: string }                  // CSS + optional attribute (e.g. href)
  | { xpath: string; attr?: string }                // XPath + optional attribute
  | { text: string }                                // first element containing this text

export type SelectorMap = Record<string, SelectorValue>

export interface SearchConfig {
  query: string
  inputSelector: string
  submitSelector: string
  waitForSelector?: string                          // wait for this after submit
  waitMs?: number                                   // OR sleep this long
}

export interface LoginConfig {
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
  username: string
  password: string
  /**
   * If set, the session (cookies + localStorage) is cached in Redis under
   * `<domain>:<sessionKey>`. Subsequent jobs with the same key reuse the
   * session and skip the login step.
   */
  sessionKey?: string
  /**
   * Selector that appears only when login succeeded. Used to verify a
   * restored session is still valid; if the selector is not found the
   * service falls back to a fresh login.
   */
  successSelector?: string
}

export type FlowStep =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string; delayMs?: number }
  | { type: 'wait'; selector?: string; timeoutMs?: number; sleepMs?: number }
  | { type: 'scroll'; toBottom?: boolean; px?: number }
  | { type: 'extract'; selectors: SelectorMap }

export type OutputTarget = 'event' | 'notion' | 'whatsapp' | 'email'

export interface OutputConfig {
  /**
   * Where to send the result. `event` is always-on (publishes to
   * channels.scraping.events.completed for SSE). The others trigger the
   * corresponding microservice via RabbitMQ when scraping succeeds.
   */
  targets?: OutputTarget[]
  notion?: { parentPageId: string; title?: string; icon?: string }
  whatsapp?: { to: string }
  email?: { to: string[]; subject?: string }
}

export interface PerformanceConfig {
  /**
   * Block image/font/css/media network requests. Default: true (3-5x speedup
   * for data-only scraping). Set false if you need to render real visuals.
   */
  blockResources?: boolean
  /**
   * If set, identical (url+strategy+selectors) requests within this window
   * return the cached result. Default: 0 (disabled).
   */
  cacheTtlMs?: number
  /**
   * Navigation/wait timeout per page operation in ms. Default: 60_000.
   */
  timeoutMs?: number
}

export interface LifecycleConfig {
  /**
   * Auto-delete the job from the DB after this many ms. Default: 86_400_000 (24h).
   */
  expiresAfterMs?: number
  /**
   * Free-form tags persisted with the job for analytics/audit.
   */
  metadata?: Record<string, unknown>
}

export interface ScrapingResult {
  jobId: string
  userId?: string
  url: string
  success: boolean
  data?: Record<string, unknown>
  error?: string
  startedAt: string
  completedAt: string
  durationMs: number
}

export interface RpcEnvelope {
  correlationId?: string
  [k: string]: unknown
}

export const DEFAULT_EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000  // 24 hours

// ─── Legacy: kept so RateLimiter (in-memory, not yet migrated) compiles ───
export interface RateLimitStatus {
  userId: string
  used: number
  limit: number
  resetTime: Date
  isExceeded: boolean
}
