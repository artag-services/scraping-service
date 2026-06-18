export class SearchConfig {
  constructor(
    public readonly query: string,
    public readonly inputSelector: string,
    public readonly submitSelector: string,
    public readonly waitForSelector?: string,
    public readonly waitMs?: number,
  ) {}
}
