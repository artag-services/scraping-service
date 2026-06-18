import { IBrowserAutomation } from './IBrowserAutomation';

export interface AutoScrapedContent {
  title: string;
  sections: string[];
  links: Array<{ href: string; text: string }>;
  text: string;
}

export interface IAutoScraper {
  autoScrape(browser: IBrowserAutomation): Promise<AutoScrapedContent>;
}
