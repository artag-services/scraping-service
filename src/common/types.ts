// src/common/types.ts

/**
 * Tipos compartidos para el servicio de scraping
 */

export interface ScrapingMessage {
  requestId: string
  userId: string
  url: string
  instructions: ScrapingInstructions
  timestamp?: Date
}

export interface ScrapingInstructions {
  type?: 'simple' | 'login' | 'search' | 'extract' | 'login_and_search' | 'auto'
  action?: string
  selectors?: Record<string, string>
  login?: LoginConfig
  search?: SearchConfig
  extract?: Record<string, string>
  timeout?: number
}

export interface LoginConfig {
  username: string
  password: string
  usernameSelector: string
  passwordSelector: string
  submitSelector: string
  waitForNavigation?: boolean
}

export interface SearchConfig {
  query: string
  searchSelector: string
  submitSelector: string
  waitTime?: number
}

export interface ScrapingResult {
  requestId: string
  userId: string
  url: string
  success: boolean
  data?: Record<string, any>
  error?: string
  timestamp: Date
}

export interface NotificationMessage {
  requestId: string
  userId: string
  channel: 'whatsapp' | 'email' | 'slack' | 'notion'
  message: string
  retries?: number
  timeout?: number
}

export interface RateLimitStatus {
  userId: string
  used: number
  limit: number
  resetTime: Date
  isExceeded: boolean
}

export enum ScrapingErrorType {
  TIMEOUT = 'TIMEOUT',
  ANTI_BOT = 'ANTI_BOT',
  NETWORK = 'NETWORK',
  INVALID_SELECTOR = 'INVALID_SELECTOR',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  UNKNOWN = 'UNKNOWN',
}
