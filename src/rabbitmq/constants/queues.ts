/**
 * RabbitMQ contracts for the scrapping microservice.
 *
 * Pattern (per project skill):
 *  - Inbound from gateway: tasks (fire-and-forget) + RPC reads (with correlationId)
 *  - Outbound lifecycle events: queued/started/completed/failed broadcast to
 *    `channels.scraping.events.*` — the gateway's SSE bridge consumes these
 *    and forwards to subscribed frontend clients.
 *  - Outbound RPC responses: channels.scraping.response (correlationId echo)
 *  - Optional outbound dispatches: when output.targets includes notion / whatsapp / email,
 *    we publish to those services' standard inbound routing keys.
 */

export const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE ?? 'channels'

export const ROUTING_KEYS = {
  // Inbound: gateway → scrapping
  TASK: 'channels.scraping.task',
  LIST: 'channels.scraping.list',
  GET: 'channels.scraping.get',
  DELETE: 'channels.scraping.delete',
  CLEANUP_EXPIRED: 'channels.scraping.cleanup-expired',

  // Outbound: scrapping → gateway (RPC responses)
  RESPONSE: 'channels.scraping.response',

  // Outbound broadcast lifecycle events (consumed by gateway SSE bridge)
  EVENT_QUEUED: 'channels.scraping.events.queued',
  EVENT_STARTED: 'channels.scraping.events.started',
  EVENT_COMPLETED: 'channels.scraping.events.completed',
  EVENT_FAILED: 'channels.scraping.events.failed',

  // Outbound dispatches when output.targets includes these services
  NOTION_SEND: 'channels.notion.send',
  WHATSAPP_SEND: 'channels.whatsapp.send',
  EMAIL_SEND: 'channels.email.send',
} as const

export const QUEUES = {
  TASK: 'scraping.task',
  LIST: 'scraping.list',
  GET: 'scraping.get',
  DELETE: 'scraping.delete',
  CLEANUP_EXPIRED: 'scraping.cleanup-expired',
} as const
