import { IBrowserAutomation } from './IBrowserAutomation';

export interface ISessionManager {
  load(browser: IBrowserAutomation, url: string, sessionKey: string): Promise<boolean>;
  save(browser: IBrowserAutomation, url: string, sessionKey: string): Promise<void>;
  clear(domain: string, sessionKey: string): Promise<void>;
}
