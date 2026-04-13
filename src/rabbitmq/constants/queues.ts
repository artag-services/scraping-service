/**
 * Centralized RabbitMQ queue and routing key constants for Scrapping Service
 * Matches standard pattern used in Notion, WhatsApp, Identity services
 *
 * IMPORTANT: These constants ensure consistency across all inter-service communication
 */

export const RABBITMQ_EXCHANGE = 'channels'

/**
 * Routing keys for publishing messages to the exchange
 */
export const ROUTING_KEYS = {
  // Scraping tasks from external sources (gateway, scheduler, etc)
  SCRAPING_TASK: 'channels.scraping.task',

  // Notion integration
  NOTION_SEND: 'channels.notion.send',
  SCRAPPING_NOTION_RESPONSE: 'channels.scrapping.notion-response',
} as const

/**
 * Queue names that this service consumes from
 */
export const QUEUES = {
  // Scraping service consumes scraping tasks from this queue
  SCRAPING_TASK: 'scraping.task',

  // Scraping service consumes Notion responses from this queue
  SCRAPPING_NOTION_RESPONSE: 'scrapping.notion-response',
} as const
