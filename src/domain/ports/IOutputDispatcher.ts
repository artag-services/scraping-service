import { ScrapingTaskMessage } from '../value-objects/scraping-task';
import { ScrapingResult } from '../value-objects/scraping-result';

export interface IOutputDispatcher {
  dispatch(task: ScrapingTaskMessage, result: ScrapingResult): Promise<void>;
}
