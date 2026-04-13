declare module 'amqplib' {
  export interface Connection {
    createChannel(): Promise<Channel>
    close(): Promise<void>
  }

  export interface Channel {
    assertExchange(exchange: string, type: string, options: any): Promise<void>
    assertQueue(queue: string, options: any): Promise<any>
    bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>
    publish(exchange: string, routingKey: string, content: Buffer, options: any): boolean
    sendToQueue(queue: string, content: Buffer, options: any): boolean
    consume(queue: string, handler: (msg: any | null) => void, options: any): Promise<void>
    ack(msg: any): void
    nack(msg: any, allUpTo: boolean, requeue: boolean): void
    prefetch(count: number): Promise<void>
    close(): Promise<void>
  }

  export function connect(url: string): Promise<Connection>
}
