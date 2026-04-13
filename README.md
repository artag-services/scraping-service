# Scraping Service

High-performance web scraping microservice with Puppeteer, anti-bot detection, and extensible notification adapters.

## Features

- **Puppeteer with Stealth**: Bypass anti-bot detection using puppeteer-extra plugins
- **Browser Pool**: Reusable browser instances for performance optimization
- **Flexible Scraping**: Simple inline instructions or complex JSON payloads
- **Intelligent Summaries**: Auto-trim long results to WhatsApp limits
- **Rate Limiting**: Configurable daily limits with adapter-based notifications
- **Adapter Pattern**: Easy to extend with Email, Slack, Notion, Discord, etc.
- **RabbitMQ Integration**: Async processing with configurable retries

## Architecture

```
User Message → Gateway → RabbitMQ (scraping_tasks)
                          ↓
                   Scraping Service
                   ├─ Puppeteer Scraper
                   ├─ Browser Pool
                   ├─ Rate Limiter
                   └─ Notification Adapters
                          ↓
            RabbitMQ (whatsapp_direct_messages)
                          ↓
                    Gateway → WhatsApp User
```

## Environment Variables

```bash
# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=microservices
RABBITMQ_QUEUE_SCRAPING=scraping_tasks
RABBITMQ_QUEUE_NOTIFICATIONS=whatsapp_direct_messages

# Gateway
GATEWAY_URL=http://gateway:3000
GATEWAY_WEBHOOK_TOKEN=your-secure-token

# Puppeteer
PUPPETEER_TIMEOUT=30000
PUPPETEER_MAX_POOL_SIZE=5
PUPPETEER_HEADLESS=true

# Rate Limiting
RATE_LIMIT_DAILY=10
RATE_LIMIT_WINDOW_HOURS=24

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

## Adding New Notification Adapters

The adapter pattern makes it easy to extend to new channels:

### 1. Create Adapter Class

```typescript
// src/notifications/adapters/email.adapter.ts
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class EmailAdapter implements NotificationAdapter {
  getName(): string {
    return 'email'
  }

  async send(userId: string, message: string, options?: any): Promise<void> {
    // Your email sending logic
  }

  async isAvailable(userId: string): Promise<boolean> {
    // Check if user has email configured
    return true
  }
}
```

### 2. Register in Module

```typescript
// src/notifications/notifications.module.ts
@Module({
  providers: [
    WhatsAppAdapter,
    EmailAdapter,      // NEW
    SlackAdapter,
    NotificationService,
  ],
})
export class NotificationsModule {}
```

### 3. Use It

```typescript
await this.notificationService.send('email', userId, message)
```

That's it! The adapter will be automatically discovered and used.

## Usage

### Simple Scraping (Inline)

```
scrappea https://amazon.com/s?k=laptop buscando "precio" y "disponibilidad"
```

### Complex Scraping (JSON)

```json
{
  "url": "https://shop.com/products",
  "action": "login_and_search",
  "login": {
    "username": "user@email.com",
    "password": "password",
    "selectors": {
      "username": "#email",
      "password": "#pass",
      "submit": "button[type=submit]"
    }
  },
  "search": {
    "query": "laptop gaming",
    "selectors": {
      "searchInput": "input.search",
      "submitBtn": "button.search-btn"
    }
  },
  "extract": {
    "title": "h1.product-title",
    "price": ".price",
    "rating": ".stars"
  },
  "timeout": 30000
}
```

## Performance Tips

- Browser pool size: Start with 3-5, adjust based on server capacity
- Timeout: 30s for complex flows, 10s for simple scraping
- Rate limit: 10-15 daily for production to avoid server load
- Disable images/CSS in resource blocking to improve speed

## License

MIT
