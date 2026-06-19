// src/scraper/auto-scraper.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Page } from 'puppeteer'
import { Timed } from '../utils/timing'

export interface AutoScrapedContent {
  title: string
  sections: string[]
  links: Array<{ href: string; text: string }>
  text: string
}

@Injectable()
export class AutoScraper {
  private readonly logger = new Logger(AutoScraper.name)
  private readonly maxContentLength: number
  private readonly maxLinks = 20
  private readonly maxSections = 10

  constructor(private configService: ConfigService) {
    this.maxContentLength = this.configService.get(
      'SCRAPING_MAX_CONTENT_LENGTH',
      5000,
    )
    this.logger.log(
      `AutoScraper initialized with maxContentLength=${this.maxContentLength}`,
    )
  }

  @Timed()
  async autoScrape(page: Page): Promise<AutoScrapedContent> {
    this.logger.log('🤖 Starting auto-scraping...')

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await page.evaluate((): any => {
        const titleElement =
          document.querySelector('h1') ||
          document.querySelector('h2') ||
          document.querySelector('title')
        const title = titleElement?.textContent?.trim() || ''

        const sections: string[] = []
        const headings = document.querySelectorAll('h2, h3')
        headings.forEach((heading: any) => {
          const text = heading.textContent?.trim()
          if (text && sections.length < 10) {
            sections.push(text)
          }
        })

        // Extract links
        const links: Array<{ href: string; text: string }> = []
        const linkElements = document.querySelectorAll('a[href]')
        linkElements.forEach((el: any) => {
          const href = (el as any).href
          const text = el.textContent?.trim() || ''

          if (href && links.length < 20) {
            // Skip empty links and fragment-only links
            if (href !== '#' && text) {
              links.push({ href, text })
            }
          }
        })

        const bodyText = document.body.innerText || ''

        return {
          title,
          sections,
          links,
          bodyText,
        }
      })

      // Process and truncate text
      const text = this.truncateText(content.bodyText)

      return {
        title: content.title || 'No title found',
        sections: content.sections,
        links: content.links,
        text,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error(`Auto-scraping failed: ${errorMessage}`)
      throw error
    }
  }

  /**
   * Truncates text to max content length, maintaining readability
   */
  private truncateText(text: string): string {
    if (!text) {
      return ''
    }

    // Remove excessive whitespace
    const cleaned = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')

    if (cleaned.length <= this.maxContentLength) {
      return cleaned
    }

    // Truncate and add indicator
    const truncated = cleaned.substring(0, this.maxContentLength - 15)
    return truncated + '\n\n[TRUNCADO]'
  }
}
