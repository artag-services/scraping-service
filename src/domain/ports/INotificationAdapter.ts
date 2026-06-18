export interface INotificationAdapter {
  readonly name: string;
  send(
    userId: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}
