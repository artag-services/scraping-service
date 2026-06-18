export type OutputTarget = 'event' | 'notion' | 'whatsapp' | 'email';

export interface NotionOutputConfig {
  parentPageId?: string;
  title?: string;
  icon?: string;
}

export interface WhatsAppOutputConfig {
  to: string;
}

export interface EmailOutputConfig {
  to: string[];
  subject?: string;
}

export class OutputConfig {
  constructor(
    public readonly targets: OutputTarget[] = [],
    public readonly notion?: NotionOutputConfig,
    public readonly whatsapp?: WhatsAppOutputConfig,
    public readonly email?: EmailOutputConfig,
  ) {}
}
