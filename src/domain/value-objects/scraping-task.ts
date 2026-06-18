import { SelectorMap } from './selector';
import { SearchConfig } from './search-config';
import { LoginConfig } from './login-config';
import { FlowStep } from './flow-step';
import { OutputConfig } from './output-config';

export type ScrapingStrategy =
  | 'auto'
  | 'extract'
  | 'search'
  | 'login_then_extract'
  | 'login_then_search'
  | 'custom_flow';

export interface PerformanceConfig {
  blockResources?: boolean;
  cacheTtlMs?: number;
  timeoutMs?: number;
}

export interface LifecycleConfig {
  expiresAfterMs?: number;
  metadata?: Record<string, unknown>;
}

export class ScrapingTaskRequest {
  constructor(
    public readonly url: string,
    public readonly userId?: string,
    public readonly strategy: ScrapingStrategy = 'auto',
    public readonly selectors?: SelectorMap,
    public readonly search?: SearchConfig,
    public readonly login?: LoginConfig,
    public readonly flow?: FlowStep[],
    public readonly output?: OutputConfig,
    public readonly performance?: PerformanceConfig,
    public readonly lifecycle?: LifecycleConfig,
  ) {}
}

export class ScrapingTaskMessage {
  constructor(
    public readonly jobId: string,
    public readonly url: string,
    public readonly userId?: string,
    public readonly strategy: ScrapingStrategy = 'auto',
    public readonly selectors?: SelectorMap,
    public readonly search?: SearchConfig,
    public readonly login?: LoginConfig,
    public readonly flow?: FlowStep[],
    public readonly output?: OutputConfig,
    public readonly performance?: PerformanceConfig,
    public readonly lifecycle?: LifecycleConfig,
  ) {}
}
