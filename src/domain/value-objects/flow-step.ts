export type FlowStep =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string; delayMs?: number }
  | { type: 'wait'; selector?: string; timeoutMs?: number; sleepMs?: number }
  | { type: 'scroll'; toBottom?: boolean; px?: number }
  | { type: 'extract'; selectors: Record<string, string | { css: string; attr?: string } | { xpath: string; attr?: string } | { text: string }> };
