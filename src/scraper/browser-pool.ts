// src/scraper/browser-pool.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import puppeteer from 'puppeteer'
import puppeteerExtra from 'puppeteer-extra'
import { Browser } from 'puppeteer'
import { configureStealth, BROWSER_LAUNCH_OPTIONS } from './stealth.config'

@Injectable()
export class BrowserPool implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name)
  private pool: Browser[] = []
  private inUse: Set<Browser> = new Set()
  private maxPoolSize: number = 5
  private readonly waitTimeout: number = 30000

  constructor(private configService: ConfigService) {
    this.maxPoolSize = this.configService.get('PUPPETEER_MAX_POOL_SIZE', 5)
  }

  async onModuleInit(): Promise<void> {
    await this.initializePool()
  }

  async onModuleDestroy(): Promise<void> {
    await this.closePool()
  }

  /**
   * Inicializa el pool de browsers
   */
  private async initializePool(): Promise<void> {
    const browserlessEndpoint = this.configService.get<string>('BROWSERLESS_WS_ENDPOINT')
    const isUsingBrowserless = !!browserlessEndpoint

    try {
      if (isUsingBrowserless) {
        this.logger.log(`Connecting to Browserless service at ${browserlessEndpoint}`)
        // Conexión a browserless para Docker
        for (let i = 0; i < this.maxPoolSize; i++) {
          const browser = await puppeteer.connect({
            browserWSEndpoint: browserlessEndpoint,
          })
          this.pool.push(browser)
        }
        this.logger.log(`Browser pool initialized with ${this.maxPoolSize} Browserless instances`)
      } else {
        this.logger.log(`Launching local Puppeteer browsers (BROWSERLESS_WS_ENDPOINT not set)`)
        // Lanzamiento local para desarrollo
        const stealthPuppeteer = configureStealth()
        for (let i = 0; i < this.maxPoolSize; i++) {
          const browser = await stealthPuppeteer.launch(BROWSER_LAUNCH_OPTIONS)
          this.pool.push(browser)
        }
        this.logger.log(`Browser pool initialized with ${this.maxPoolSize} local instances`)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Failed to initialize browser pool: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Obtiene un browser del pool
   */
  async acquireBrowser(): Promise<Browser> {
    // Si hay browsers disponibles, retorna uno
    if (this.pool.length > 0) {
      const browser = this.pool.pop()!
      this.inUse.add(browser)
      return browser
    }

    // Si todos están en uso, espera a que uno se libere
    this.logger.warn(`All browsers in use, waiting for available browser...`)
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.pool.length > 0) {
          clearInterval(checkInterval)
          const browser = this.pool.pop()!
          this.inUse.add(browser)
          resolve(browser)
        }
      }, 100)

      setTimeout(() => {
        clearInterval(checkInterval)
        throw new Error('Browser acquisition timeout')
      }, this.waitTimeout)
    })
  }

  /**
   * Devuelve un browser al pool
   */
  releaseBrowser(browser: Browser): void {
    this.inUse.delete(browser)
    this.pool.push(browser)
  }

  /**
   * Cierra el pool completamente
   */
  private async closePool(): Promise<void> {
    for (const browser of this.pool) {
      try {
        await browser.close()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`Error closing browser: ${errorMessage}`)
      }
    }

    for (const browser of this.inUse) {
      try {
        await browser.close()
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.error(`Error closing browser in use: ${errorMessage}`)
      }
    }

    this.pool = []
    this.inUse.clear()
    this.logger.log('Browser pool closed')
  }

  /**
   * Obtiene estadísticas del pool
   */
  getPoolStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.pool.length,
      inUse: this.inUse.size,
      total: this.pool.length + this.inUse.size,
    }
  }
}
