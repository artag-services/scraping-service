export interface BrowserCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
}

export interface IBrowserAutomation {
  navigate(url: string, timeout?: number): Promise<void>;
  waitForSelector(selector: string, timeout?: number): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string, delay?: number): Promise<void>;
  scrollToBottom(): Promise<void>;
  scrollBy(px: number): Promise<void>;
  extractText(selector: string): Promise<string[]>;
  extractAttribute(selector: string, attr: string): Promise<string[]>;
  extractAllText(selector: string): Promise<string[]>;
  extractXPath(xpath: string, attr?: string): Promise<string[]>;
  extractByText(text: string): Promise<string>;
  extractLinks(): Promise<Array<{ href: string; text: string }>>;
  extractTitle(): Promise<string>;
  extractBodyText(): Promise<string>;
  extractSections(): Promise<string[]>;
  getCookies(): Promise<BrowserCookie[]>;
  setCookies(cookies: BrowserCookie[]): Promise<void>;
  getLocalStorage(): Promise<Record<string, string>>;
  setLocalStorage(items: Record<string, string>): Promise<void>;
  executeScript<T>(fn: string): Promise<T>;
  setUserAgent(userAgent: string): Promise<void>;
  setExtraHeaders(headers: Record<string, string>): Promise<void>;
  sleep(ms: number): Promise<void>;
  goto(url: string, timeout?: number): Promise<void>;
  reload(timeout?: number): Promise<void>;
}
