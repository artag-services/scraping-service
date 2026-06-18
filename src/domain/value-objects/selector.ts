export type SelectorValue =
  | string
  | { css: string; attr?: string }
  | { xpath: string; attr?: string }
  | { text: string };

export type SelectorMap = Record<string, SelectorValue>;
