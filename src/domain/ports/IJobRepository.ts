import { ScrapingStatus } from '../entities/scraping-job';
import { ScrapingTaskRequest } from '../value-objects/scraping-task';
import { ScrapingResult } from '../value-objects/scraping-result';

export interface ScrapingJobRecord {
  id: string;
  userId: string | null;
  url: string;
  strategy: string;
  request: Record<string, unknown>;
  status: ScrapingStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJobRepository {
  createQueued(request: ScrapingTaskRequest & { jobId?: string }): Promise<ScrapingJobRecord>;
  markStarted(jobId: string): Promise<void>;
  markCompleted(jobId: string, result: ScrapingResult): Promise<void>;
  markFailed(jobId: string, result: ScrapingResult): Promise<void>;
  list(limit?: number, userId?: string): Promise<ScrapingJobRecord[]>;
  get(jobId: string): Promise<ScrapingJobRecord>;
  remove(jobId: string): Promise<void>;
  cleanupExpired(): Promise<number>;
}
