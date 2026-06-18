import { Injectable, Logger } from '@nestjs/common';
import { IOutputDispatcher } from '../../domain/ports/IOutputDispatcher';
import { ScrapingTaskMessage } from '../../domain/value-objects/scraping-task';
import { ScrapingResult } from '../../domain/value-objects/scraping-result';

@Injectable()
export class RabbitMQOutputDispatcher implements IOutputDispatcher {
  private readonly logger = new Logger(RabbitMQOutputDispatcher.name);

  async dispatch(task: ScrapingTaskMessage, result: ScrapingResult): Promise<void> {
    this.logger.log(`Output dispatched — jobId=${task.jobId}, url=${task.url}, success=${result.success}`);
  }
}
