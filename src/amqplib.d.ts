declare module 'amqplib' {
  export interface Connection {
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'close', listener: () => void): this;
    createChannel(): Promise<Channel>;
    close(): Promise<void>;
  }

  export interface Channel {
    on(event: 'error', listener: (err: Error) => void): this;
    assertExchange(exchange: string, type: string, options: Record<string, unknown>): Promise<void>;
    assertQueue(queue: string, options: Record<string, unknown>): Promise<{ queue: string }>;
    bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
    publish(exchange: string, routingKey: string, content: Buffer, options: Record<string, unknown>): boolean;
    sendToQueue(queue: string, content: Buffer, options: Record<string, unknown>): boolean;
    consume(queue: string, handler: (msg: Record<string, unknown> | null) => void, options: Record<string, unknown>): Promise<{ consumerTag: string }>;
    ack(msg: Record<string, unknown>): void;
    nack(msg: Record<string, unknown>, allUpTo: boolean, requeue: boolean): void;
    prefetch(count: number): Promise<void>;
    close(): Promise<void>;
  }

  export function connect(url: string): Promise<Connection>;
}
