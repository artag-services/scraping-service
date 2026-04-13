// src/scraper/puppeteer.scraper.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Page, Browser } from 'puppeteer'
import { BrowserPool } from './browser-pool'
import { AutoScraper } from './auto-scraper'
import { getRandomUserAgent } from './stealth.config'
import {
  ScrapingInstructions,
  ScrapingResult,
  LoginConfig,
  SearchConfig,
  ScrapingErrorType,
} from '../common/types'

@Injectable()
export class PuppeteerScraper {
  private readonly logger = new Logger(PuppeteerScraper.name)
  private readonly timeout: number
  private readonly retryDelays = [1000, 2000, 4000]

  constructor(
    private browserPool: BrowserPool,
    private configService: ConfigService,
    private autoScraper: AutoScraper,
  ) {
    // Default 60 segundos, puede ser override con PUPPETEER_TIMEOUT env var
    this.timeout = this.configService.get('PUPPETEER_TIMEOUT', 60000)
  }

  /**
   * Ejecuta un scraping
   */
  async scrape(
    requestId: string,
    url: string,
    instructions: ScrapingInstructions,
    userId?: string,
  ): Promise<ScrapingResult> {
    let browser: Browser | null = null
    let page: Page | null = null

    try {
      this.logger.log(`🚀 Starting scrape for request ${requestId}`)
      console.log(`🚀 Scraping ${url}...`)
      
      browser = await this.browserPool.acquireBrowser()
      this.logger.debug(`✓ Browser acquired from pool`)
      
      page = await browser.newPage()
      this.logger.debug(`✓ New page created`)

      // Configurar user-agent y headers
      await page.setUserAgent(getRandomUserAgent())
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      })

      const timeout = instructions.timeout || this.timeout
      this.logger.log(`⏱️  Using timeout: ${timeout}ms`)

      // Ejecutar instrucciones
      const data = await this.executeInstructions(page, url, instructions, timeout)

      return {
        requestId,
        userId: userId || 'unknown',
        url,
        success: true,
        data,
        timestamp: new Date(),
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Scraping failed for ${url}: ${errorMessage}`)

      return {
        requestId,
        userId: userId || 'unknown',
        url,
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      }
    } finally {
      if (page) {
        try {
          await page.close()
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          this.logger.warn(`Error closing page: ${errorMessage}`)
        }
      }

      if (browser) {
        this.browserPool.releaseBrowser(browser)
      }
    }
  }

  /**
   * Ejecuta las instrucciones de scraping según el tipo
   */
  private async executeInstructions(
    page: Page,
    url: string,
    instructions: ScrapingInstructions,
    timeout: number,
  ): Promise<Record<string, any>> {
    const actionType = instructions.type

    // If no type specified or type is 'auto', use auto-scraping
    if (!actionType || actionType === 'auto') {
      return this.scrapeAuto(page, url, timeout)
    }

    switch (actionType) {
      case 'simple':
        return this.scrapeSimple(page, url, instructions, timeout)

      case 'login':
        return this.scrapeAfterLogin(page, url, instructions, timeout)

      case 'login_and_search':
        return this.scrapeLoginAndSearch(page, url, instructions, timeout)

      case 'search':
        return this.scrapeSearch(page, url, instructions, timeout)

      case 'extract':
        return this.scrapeExtract(page, url, instructions, timeout)

      default:
        throw new Error(`Unknown action type: ${actionType}`)
    }
  }

  /**
   * Scraping automático: extrae contenido inteligentemente sin selectores
   */
  private async scrapeAuto(
    page: Page,
    url: string,
    timeout: number,
  ): Promise<Record<string, any>> {
    this.logger.log(`🌐 Auto-scraping: Navigating to ${url} with timeout ${timeout}ms`)
    console.log(`🌐 Auto-scraping ${url}...`)

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout })
      this.logger.log(`✅ Navigation successful for ${url}`)
      console.log(`✅ Page loaded successfully`)
    } catch (error) {
      this.logger.warn(`⚠️ Navigation timeout/error, trying with networkidle0...`)
      console.log(`⚠️ Retrying with less strict waiting...`)
      // Reintentar con networkidle0 (menos estricto)
      await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout / 2 }).catch(() => {
        // Si falla, al menos cargó algo
      })
    }

    this.logger.log(`⏳ Waiting for JavaScript to execute...`)
    await page.waitForTimeout(2000)

    this.logger.log(`🤖 Executing auto-scraping...`)
    const scrapedContent = await this.autoScraper.autoScrape(page)

    // Convert to Record<string, any> for consistency
    const data: Record<string, any> = {
      title: scrapedContent.title,
      sections: scrapedContent.sections,
      links: scrapedContent.links,
      text: scrapedContent.text,
    }

    this.logger.log(`✅ Auto-scraping complete, extracted ${scrapedContent.links.length} links and ${scrapedContent.sections.length} sections`)
    console.log(`✅ Auto-scraping complete`)

    return data
  }

  /**
   * Scraping simple: solo navegar y extraer
   */
  private async scrapeSimple(
    page: Page,
    url: string,
    instructions: ScrapingInstructions,
    timeout: number,
  ): Promise<Record<string, any>> {
    this.logger.log(`🌐 Navigating to ${url} with timeout ${timeout}ms`)
    console.log(`🌐 Navigating to ${url}...`)
    
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout })
      this.logger.log(`✅ Navigation successful for ${url}`)
      console.log(`✅ Page loaded successfully`)
    } catch (error) {
      this.logger.warn(`⚠️ Navigation timeout/error, trying with networkidle0...`)
      console.log(`⚠️ Retrying with less strict waiting...`)
      // Reintentar con networkidle0 (menos estricto)
      await page.goto(url, { waitUntil: 'networkidle0', timeout: timeout / 2 }).catch(() => {
        // Si falla, al menos cargó algo
      })
    }
    
    this.logger.log(`⏳ Waiting for JavaScript to execute...`)
    await page.waitForTimeout(2000)
    
    this.logger.log(`📊 Extracting data from page...`)
    const data = await this.extractData(page, instructions.selectors || {})
    
    this.logger.log(`✅ Data extraction complete, found ${Object.keys(data).length} fields`)
    console.log(`✅ Extraction complete:`, JSON.stringify(data).substring(0, 100))
    
    return data
  }

  /**
   * Scraping después de login
   */
  private async scrapeAfterLogin(
    page: Page,
    url: string,
    instructions: ScrapingInstructions,
    timeout: number,
  ): Promise<Record<string, any>> {
    if (!instructions.login) {
      throw new Error('Login instructions required for login action')
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout })

    // Ejecutar login
    await this.performLogin(page, instructions.login, timeout)

    // Extraer datos
    return this.extractData(page, instructions.selectors || {})
  }

  /**
   * Scraping con login y búsqueda
   */
  private async scrapeLoginAndSearch(
    page: Page,
    url: string,
    instructions: ScrapingInstructions,
    timeout: number,
  ): Promise<Record<string, any>> {
    if (!instructions.login || !instructions.search) {
      throw new Error('Login and search instructions required')
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout })

    // Login
    await this.performLogin(page, instructions.login, timeout)

    // Search
    await this.performSearch(page, instructions.search, timeout)

    // Extraer datos
    return this.extractData(page, instructions.extract || instructions.selectors || {})
  }

  /**
   * Scraping con búsqueda
   */
  private async scrapeSearch(
    page: Page,
    url: string,
    instructions: ScrapingInstructions,
    timeout: number,
  ): Promise<Record<string, any>> {
    if (!instructions.search) {
      throw new Error('Search instructions required')
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout })

    await this.performSearch(page, instructions.search, timeout)

    return this.extractData(page, instructions.selectors || {})
  }

  /**
   * Scraping con extracción específica
   */
  private async scrapeExtract(
    page: Page,
    url: string,
    instructions: ScrapingInstructions,
    timeout: number,
  ): Promise<Record<string, any>> {
    await page.goto(url, { waitUntil: 'networkidle2', timeout })

    return this.extractData(page, instructions.extract || instructions.selectors || {})
  }

  /**
   * Realiza login en una página
   */
  private async performLogin(page: Page, login: LoginConfig, timeout: number): Promise<void> {
    this.logger.debug(`Performing login with username selector: ${login.usernameSelector}`)

    // Rellenar usuario
    await page.type(login.usernameSelector, login.username, { delay: 50 })
    await page.waitForTimeout(500)

    // Rellenar contraseña
    await page.type(login.passwordSelector, login.password, { delay: 50 })
    await page.waitForTimeout(500)

    // Enviar formulario
    await page.click(login.submitSelector)

    // Esperar a navegación o cambio de página
    if (login.waitForNavigation !== false) {
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout }),
        page.waitForTimeout(5000),
      ]).catch(() => {
        // Ignorar timeout aquí, algunas páginas no redirigen
      })
    }

    this.logger.debug('Login completed')
  }

  /**
   * Realiza una búsqueda en una página
   */
  private async performSearch(page: Page, search: SearchConfig, timeout: number): Promise<void> {
    this.logger.debug(`Performing search for: ${search.query}`)

    // Rellenar búsqueda
    await page.type(search.searchSelector, search.query, { delay: 30 })
    await page.waitForTimeout(500)

    // Enviar búsqueda
    await page.click(search.submitSelector)

    // Esperar a resultados
    await page.waitForTimeout(search.waitTime || 3000)

    this.logger.debug('Search completed')
  }

  /**
   * Extrae datos según los selectores CSS
   */
  private async extractData(
    page: Page,
    selectors: Record<string, string>,
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {}

    for (const [key, selector] of Object.entries(selectors)) {
      try {
        const values = await page.$$eval(selector, (elements) =>
          elements.map((el) => el.textContent?.trim() || el.getAttribute('href') || ''),
        )

        if (values.length === 1) {
          data[key] = values[0]
        } else if (values.length > 1) {
          data[key] = values
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.logger.warn(`Failed to extract selector ${selector}: ${errorMessage}`)
        data[key] = null
      }
    }

    return data
  }
}
