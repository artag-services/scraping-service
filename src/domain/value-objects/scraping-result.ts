export interface ScrapingResult {
  jobId: string;
  userId?: string;
  url: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
}
