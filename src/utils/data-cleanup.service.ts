import { Injectable, Logger } from '@nestjs/common';

export interface CleanedScrapingData {
  title?: string;
  sections?: string[];
  links?: Array<{ href: string; text: string }>;
}

@Injectable()
export class DataCleanupService {
  private readonly logger = new Logger(DataCleanupService.name);

  /**
   * Cleans scraped data by removing trash, duplicates, and redundant content
   * Removes: text field (too long), empty fields, duplicate sections
   * Keeps: title, sections, links (cleaned and deduplicated)
   */
  cleanup(data: any): CleanedScrapingData {
    if (!data) {
      this.logger.warn('Empty data received for cleanup');
      return {};
    }

    try {
      const cleaned: CleanedScrapingData = {
        title: this.cleanTitle(data.title),
        sections: this.deduplicateSections(data.sections),
        links: this.cleanLinks(data.links),
      };

      this.logger.log(
        `Data cleaned: title=${cleaned.title}, sections=${cleaned.sections?.length || 0}, links=${cleaned.links?.length || 0}`,
      );

      return cleaned;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : '';
      this.logger.error(`Error during data cleanup: ${errorMessage}`, stackTrace);
      // Retornar datos mínimos si hay error
      return {
        title: data.title || 'Scraping Result',
      };
    }
  }

  /**
   * Clean and validate title
   */
  private cleanTitle(title: any): string {
    if (!title) return 'Scraping Result';
    const cleaned = String(title).trim();
    return cleaned.length > 0 ? cleaned : 'Scraping Result';
  }

  /**
   * Deduplicate sections and remove empty values
   * - Remove exact duplicates
   * - Remove empty strings
   * - Remove single-word duplicates like "Magnet" appearing alone
   * - Limit to 20 sections max
   */
  private deduplicateSections(sections: any[]): string[] {
    if (!Array.isArray(sections)) return [];

    try {
      // Normalize and filter
      const normalized = sections
        .filter((s) => s !== null && s !== undefined)
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0);

      // Remove exact duplicates while preserving order
      const seen = new Set<string>();
      const deduplicated = normalized.filter((section) => {
        if (seen.has(section)) return false;
        seen.add(section);
        return true;
      });

      // Limit to 20 sections
      return deduplicated.slice(0, 20);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error deduplicating sections: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Clean links by:
   * - Removing entries without href or text
   * - Deduplicating by URL
   * - Limiting to 20 links max
   */
  private cleanLinks(links: any[]): Array<{ href: string; text: string }> {
    if (!Array.isArray(links)) return [];

    try {
      const seen = new Set<string>();
      const cleaned = links
        .filter((link) => link && link.href && link.text)
        .filter((link) => {
          // Validate that href is a valid URL
          try {
            new URL(link.href);
          } catch {
            return false;
          }
          return true;
        })
        .filter((link) => {
          // Deduplicate by URL
          if (seen.has(link.href)) return false;
          seen.add(link.href);
          return true;
        })
        .map((link) => ({
          href: link.href,
          text: String(link.text).trim().slice(0, 200), // Limit text to 200 chars
        }))
        .slice(0, 20); // Limit to 20 links

      return cleaned;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error cleaning links: ${errorMessage}`);
      return [];
    }
  }
}
