import { IBrowserAutomation } from './IBrowserAutomation';

export interface IBrowserPool {
  acquire(): Promise<IBrowserAutomation>;
  release(browser: IBrowserAutomation): Promise<void>;
  getStats(): { browsers: number; maxPages: number; currentPages: number; waiting: number };
}
