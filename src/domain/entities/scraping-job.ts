export type ScrapingStatus =
  | 'QUEUED'
  | 'STARTED'
  | 'COMPLETED'
  | 'FAILED';

export class ScrapingJob {
  constructor(
    public readonly id: string,
    public readonly userId: string | null,
    public readonly url: string,
    public readonly strategy: string,
    public readonly request: Record<string, unknown>,
    public status: ScrapingStatus,
    public readonly result: Record<string, unknown> | null,
    public readonly error: string | null,
    public readonly startedAt: Date | null,
    public readonly completedAt: Date | null,
    public readonly durationMs: number | null,
    public readonly expiresAt: Date,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  is(status: ScrapingStatus): boolean {
    return this.status === status;
  }
}
