import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IAutoScraper, AutoScrapedContent } from '../domain/ports/IAutoScraper'
import { IBrowserAutomation } from '../domain/ports/IBrowserAutomation'
import { Timed } from '../utils/timing'

@Injectable()
export class AutoScraper implements IAutoScraper {
  private readonly logger = new Logger(AutoScraper.name)
  private readonly maxContentLength: number

  constructor(configService: ConfigService) {
    this.maxContentLength = configService.get(
      'SCRAPING_MAX_CONTENT_LENGTH',
      5000,
    )
  }

  @Timed()
  async autoScrape(browser: IBrowserAutomation): Promise<AutoScrapedContent> {
    this.logger.log('Auto-scraping via Rust scraper...')

    const title = await browser.extractTitle()
    const sections = await browser.extractSections()
    const links = await browser.extractLinks()
    const bodyText = await browser.extractBodyText()

    const text = this.truncateText(bodyText)

    return {
      title: title || 'No title found',
      sections,
      links,
      text,
    }
  }

  private truncateText(text: string): string {
    if (!text) return ''

    const cleaned = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n')

    if (cleaned.length <= this.maxContentLength) return cleaned

    const truncated = cleaned.substring(0, this.maxContentLength - 15)
    return truncated + '\n\n[TRUNCADO]'
  }
}
