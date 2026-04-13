# Guía de Extensión: Agregar Nuevos Adaptadores de Notificación

El servicio de scraping usa el **Adapter Pattern** para permitir notificaciones flexibles a múltiples canales. Aquí te mostramos cómo agregar nuevos adaptadores (Email, Slack, Notion, Discord, Telegram, etc.).

## 1. Crear un Nuevo Adaptador

### Paso 1: Implementar la Interfaz

Todos los adaptadores deben implementar `NotificationAdapter`:

```typescript
// src/notifications/adapters/slack.adapter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class SlackAdapter implements NotificationAdapter {
  private readonly logger = new Logger(SlackAdapter.name)
  private webhookUrl: string

  constructor(private configService: ConfigService) {
    this.webhookUrl = this.configService.get('SLACK_WEBHOOK_URL', '')
  }

  // Método 1: Identificador único
  getName(): string {
    return 'slack'
  }

  // Método 2: Enviar mensaje
  async send(userId: string, message: string, options?: Record<string, any>): Promise<void> {
    if (!this.webhookUrl) {
      throw new Error('Slack webhook URL not configured')
    }

    const payload = {
      text: message,
      channel: options?.channel || '#scraping-results',
      username: 'Scraping Bot',
      mrkdwn: true,
    }

    const response = await axios.post(this.webhookUrl, payload)
    if (response.status !== 200) {
      throw new Error(`Slack API error: ${response.statusText}`)
    }

    this.logger.log(`Message sent to Slack channel: ${options?.channel || '#scraping-results'}`)
  }

  // Método 3: Verificar disponibilidad
  async isAvailable(userId: string): Promise<boolean> {
    return !!this.webhookUrl
  }

  // Método 4: Validar configuración
  async validate(): Promise<boolean> {
    if (!this.webhookUrl) {
      this.logger.warn('SLACK_WEBHOOK_URL not configured')
      return false
    }

    try {
      const response = await axios.post(this.webhookUrl, { text: 'Test message' })
      return response.status === 200
    } catch (error) {
      this.logger.error(`Slack validation failed: ${error.message}`)
      return false
    }
  }
}
```

### Paso 2: Registrar en el Módulo

Edita `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NotificationService } from './notifications/notification.service'
import { WhatsAppAdapter } from './notifications/adapters/whatsapp.adapter'
import { EmailAdapter } from './notifications/adapters/email.adapter'
import { SlackAdapter } from './notifications/adapters/slack.adapter'  // NUEVO
// ... otros imports

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' })],
  providers: [
    NotificationService,
    WhatsAppAdapter,
    EmailAdapter,
    SlackAdapter,  // NUEVO
    // ... otros providers
    {
      provide: 'NOTIFICATION_SERVICE',
      useFactory: (
        notificationService: NotificationService,
        whatsappAdapter: WhatsAppAdapter,
        emailAdapter: EmailAdapter,
        slackAdapter: SlackAdapter,  // NUEVO
      ) => {
        notificationService.registerAdapter(whatsappAdapter)
        notificationService.registerAdapter(emailAdapter)
        notificationService.registerAdapter(slackAdapter)  // NUEVO
        return notificationService
      },
      inject: [
        NotificationService,
        WhatsAppAdapter,
        EmailAdapter,
        SlackAdapter,  // NUEVO
      ],
    },
  ],
})
export class AppModule {}
```

### Paso 3: Configurar Variables de Entorno

Agrega a `.env`:

```bash
# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### Paso 4: ¡Listo!

El adaptador se registra automáticamente y está disponible.

---

## 2. Usar el Nuevo Adaptador

### Opción A: Desde el RabbitMQ Consumer

Modifica `src/queue/rabbitmq.consumer.ts` para que el usuario pueda elegir el canal:

```typescript
// En processMessage(), después del scraping exitoso:
const channel = scrapingMessage.channel || 'whatsapp' // Default: WhatsApp

await this.notificationService.send(
  channel,
  scrapingMessage.userId,
  summary,
  { emailTo: 'user@example.com' } // Opciones específicas del adaptador
)
```

### Opción B: Fallback a Múltiples Canales

```typescript
// Intentar Slack primero, luego fallback a WhatsApp
const sent = await this.notificationService.sendMultiple(
  ['slack', 'whatsapp'],
  userId,
  message,
  { channel: '#scraping' }
)

if (!sent) {
  this.logger.error(`Failed to notify user via all adapters`)
}
```

---

## 3. Ejemplos de Otros Adaptadores

### Telegram Adapter

```typescript
// src/notifications/adapters/telegram.adapter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class TelegramAdapter implements NotificationAdapter {
  private readonly logger = new Logger(TelegramAdapter.name)
  private botToken: string

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get('TELEGRAM_BOT_TOKEN', '')
  }

  getName(): string {
    return 'telegram'
  }

  async send(userId: string, message: string, options?: Record<string, any>): Promise<void> {
    const chatId = options?.chatId || userId

    const response = await axios.post(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }
    )

    if (!response.data.ok) {
      throw new Error(`Telegram API error: ${response.data.description}`)
    }

    this.logger.log(`Message sent to Telegram chat: ${chatId}`)
  }

  async isAvailable(userId: string): Promise<boolean> {
    return !!this.botToken
  }

  async validate(): Promise<boolean> {
    try {
      const response = await axios.get(
        `https://api.telegram.org/bot${this.botToken}/getMe`
      )
      return response.data.ok
    } catch {
      return false
    }
  }
}
```

### Discord Adapter

```typescript
// src/notifications/adapters/discord.adapter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class DiscordAdapter implements NotificationAdapter {
  private readonly logger = new Logger(DiscordAdapter.name)
  private webhookUrl: string

  constructor(private configService: ConfigService) {
    this.webhookUrl = this.configService.get('DISCORD_WEBHOOK_URL', '')
  }

  getName(): string {
    return 'discord'
  }

  async send(userId: string, message: string, options?: Record<string, any>): Promise<void> {
    const embed = {
      title: options?.title || 'Scraping Results',
      description: message,
      color: options?.color || 3447003, // Azul
      timestamp: new Date().toISOString(),
    }

    const response = await axios.post(this.webhookUrl, {
      embeds: [embed],
    })

    if (response.status !== 204) {
      throw new Error(`Discord API error: ${response.statusText}`)
    }

    this.logger.log('Message sent to Discord')
  }

  async isAvailable(userId: string): Promise<boolean> {
    return !!this.webhookUrl
  }

  async validate(): Promise<boolean> {
    try {
      await axios.post(this.webhookUrl, {
        content: 'Discord adapter test message',
      })
      return true
    } catch {
      return false
    }
  }
}
```

### Notion Adapter

```typescript
// src/notifications/adapters/notion.adapter.ts

import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import { NotificationAdapter } from '../interfaces/notification-adapter.interface'

@Injectable()
export class NotionAdapter implements NotificationAdapter {
  private readonly logger = new Logger(NotionAdapter.name)
  private databaseId: string
  private apiKey: string

  constructor(private configService: ConfigService) {
    this.databaseId = this.configService.get('NOTION_DATABASE_ID', '')
    this.apiKey = this.configService.get('NOTION_API_KEY', '')
  }

  getName(): string {
    return 'notion'
  }

  async send(userId: string, message: string, options?: Record<string, any>): Promise<void> {
    const response = await axios.post(
      'https://api.notion.com/v1/pages',
      {
        parent: { database_id: this.databaseId },
        properties: {
          Title: {
            title: [{ text: { content: options?.title || 'Scraping Result' } }],
          },
          Content: {
            rich_text: [{ text: { content: message } }],
          },
          Date: {
            date: { start: new Date().toISOString() },
          },
          User: {
            rich_text: [{ text: { content: userId } }],
          },
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Notion-Version': '2022-06-28',
        },
      }
    )

    if (!response.data.id) {
      throw new Error('Failed to create Notion page')
    }

    this.logger.log(`Page created in Notion: ${response.data.id}`)
  }

  async isAvailable(userId: string): Promise<boolean> {
    return !!this.databaseId && !!this.apiKey
  }

  async validate(): Promise<boolean> {
    try {
      const response = await axios.get(
        `https://api.notion.com/v1/databases/${this.databaseId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Notion-Version': '2022-06-28',
          },
        }
      )
      return response.status === 200
    } catch {
      return false
    }
  }
}
```

---

## 4. Variables de Entorno Sugeridas

Agrega a `.env` según los adaptadores que uses:

```bash
# WhatsApp (ya existe)
GATEWAY_URL=http://gateway:3000
GATEWAY_WEBHOOK_TOKEN=xxx

# Email
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@scraper.local

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Discord
DISCORD_WEBHOOK_URL=https://discordapp.com/api/webhooks/...

# Notion
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=abc123...
```

---

## 5. Pruebas

Para probar un adaptador:

```typescript
// Agregar en main.ts para debugging
async function validateAdapters() {
  const notificationService = app.get('NOTIFICATION_SERVICE')
  const results = await notificationService.validateAll()
  console.log('Adapter Validation Results:', results)
}
```

---

## Checklist para Agregar Nuevo Adaptador

- [ ] Crear clase que implemente `NotificationAdapter`
- [ ] Implementar 4 métodos: `getName()`, `send()`, `isAvailable()`, `validate()`
- [ ] Agregar `@Injectable()` y registrar en `app.module.ts`
- [ ] Agregar variables de entorno en `.env`
- [ ] Probar con `validateAll()` 
- [ ] Actualizar este documento si es necesario

---

¡Eso es todo! Con este patrón puedes agregar infinitos canales de notificación sin tocar la lógica principal de scraping. 🚀
