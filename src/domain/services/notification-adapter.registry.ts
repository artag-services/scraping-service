import { INotificationAdapter } from '../ports/INotificationAdapter';
import { OutputTarget } from '../value-objects/output-config';

export class NotificationAdapterRegistry {
  private readonly adapters = new Map<string, INotificationAdapter>();

  constructor(adapters: INotificationAdapter[]) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.name, adapter);
    }
  }

  get(target: OutputTarget | string): INotificationAdapter | undefined {
    return this.adapters.get(target);
  }

  getAll(): INotificationAdapter[] {
    return Array.from(this.adapters.values());
  }
}
