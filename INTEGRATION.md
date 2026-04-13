# Integration Guide - Scraping Service + Gateway

## Flujo de Integración

```
WhatsApp User → Gateway → RabbitMQ → Scraping Service → RabbitMQ → Gateway → WhatsApp
   (573205711428)                       (procesamiento)
```

## Pasos de Integración

### 1. Agregar el Servicio al docker-compose.yml

En la raíz del proyecto (`docker-compose.yml`):

```yaml
version: '3.8'

services:
  rabbitmq:
    image: rabbitmq:3.12-management
    ports:
      - '5672:5672'
      - '15672:15672'
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 10s
      timeout: 5s
      retries: 5

  scraping:
    build: ./services/scraping
    depends_on:
      rabbitmq:
        condition: service_healthy
    environment:
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
      RABBITMQ_EXCHANGE: microservices
      RABBITMQ_QUEUE_SCRAPING: scraping_tasks
      RABBITMQ_QUEUE_NOTIFICATIONS: whatsapp_direct_messages
      GATEWAY_URL: http://gateway:3000
      GATEWAY_WEBHOOK_TOKEN: ${GATEWAY_WEBHOOK_TOKEN}
      PUPPETEER_TIMEOUT: 30000
      PUPPETEER_MAX_POOL_SIZE: 5
      RATE_LIMIT_DAILY: 10
      RATE_LIMIT_WINDOW_HOURS: 24
      LOG_LEVEL: info
      NODE_ENV: production
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'node', '-e', 'require("http").get("http://localhost:3000/health", (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})']
      interval: 30s
      timeout: 10s
      retries: 3

  gateway:
    # Tu configuración existente del gateway
    depends_on:
      - rabbitmq
    environment:
      RABBITMQ_URL: amqp://guest:guest@rabbitmq:5672
```

### 2. Variables de Entorno en `.env`

En la raíz, agrega o actualiza:

```bash
# RabbitMQ (compartido)
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=microservices
RABBITMQ_QUEUE_SCRAPING=scraping_tasks
RABBITMQ_QUEUE_NOTIFICATIONS=whatsapp_direct_messages

# Gateway
GATEWAY_URL=http://gateway:3000
GATEWAY_WEBHOOK_TOKEN=your-secure-token

# Scraping Service
PUPPETEER_TIMEOUT=30000
PUPPETEER_MAX_POOL_SIZE=5
RATE_LIMIT_DAILY=10
RATE_LIMIT_WINDOW_HOURS=24

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### 3. Configurar el Gateway para Recibir Solicitudes de Scraping

En tu Gateway, agrega una ruta que detecte palabras clave de scraping:

```typescript
// gateway/src/routes/scraping.route.ts

@Post('/scraping')
async scraping(@Body() body: ScrappingRequest) {
  const { userId, url, instructions } = body

  const message = {
    requestId: v4(),
    userId,
    url,
    instructions: instructions || this.parseInstructions(body.query),
  }

  await this.rabbitmqService.publish('scraping_tasks', message)
  return { success: true, message: 'Scraping request queued' }
}

private parseInstructions(query: string) {
  // Parsear instrucciones simples vs complejas
  // Si es JSON, parsearlo
  // Si es texto, generar instrucciones automáticas
  return {
    type: 'simple',
    action: 'scrape_text',
    selectors: {},
  }
}
```

### 4. Middleware del Gateway para Enrutar Mensajes de Scraping

El gateway debe detectar cuando un usuario quiere scraping y enrutarlo correctamente:

```typescript
// gateway/src/middleware/scraping.middleware.ts

@Middleware()
export class ScrappingMiddleware implements NestMiddleware {
  constructor(private rabbitmqService: RabbitmqService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const { message, userId } = req.body

    // Detectar palabras clave de scraping
    if (this.isScrappingRequest(message)) {
      const { url, instructions } = this.extractScrapingData(message)

      const scrapingMessage = {
        requestId: v4(),
        userId,
        url,
        instructions,
      }

      await this.rabbitmqService.publish('microservices', 'scraping.request', scrapingMessage)

      return res.json({ success: true, message: 'Scraping request sent' })
    }

    next()
  }

  private isScrappingRequest(message: string): boolean {
    return /^(scrappea|scrapea|scraping|scrape)/i.test(message)
  }

  private extractScrapingData(message: string) {
    // Extraer URL y posibles instrucciones del mensaje
    const urlMatch = message.match(/https?:\/\/\S+/i)
    const url = urlMatch ? urlMatch[0] : null

    if (!url) {
      throw new Error('No URL found in scraping request')
    }

    return {
      url,
      instructions: {
        type: 'simple',
        action: 'scrape_text',
        selectors: {},
      },
    }
  }
}
```

### 5. Consumer en el Gateway para Respuestas

El gateway debe escuchar la cola de notificaciones y enviar a WhatsApp:

```typescript
// gateway/src/services/scraping-response.consumer.ts

@Injectable()
export class ScrappingResponseConsumer implements OnModuleInit {
  private channel: amqp.Channel

  constructor(
    private whatsappService: WhatsappService,
    private rabbitmqService: RabbitmqService,
  ) {}

  async onModuleInit() {
    this.channel = await this.rabbitmqService.getChannel()

    this.channel.consume('whatsapp_direct_messages', async (message) => {
      if (message) {
        const { userId, message: content } = JSON.parse(message.content.toString())

        await this.whatsappService.sendDirectMessage(userId, content)

        this.channel.ack(message)
      }
    })
  }
}
```

---

## Flujo de Mensajes RabbitMQ

### Cola: `scraping_tasks`

**Productor:** Gateway
**Consumidor:** Scraping Service

**Payload:**
```json
{
  "requestId": "uuid-123",
  "userId": "573205711428",
  "url": "https://example.com",
  "instructions": {
    "type": "simple",
    "action": "scrape_text",
    "selectors": {"title": "h1"}
  },
  "timestamp": "2025-04-11T10:56:00.000Z"
}
```

### Cola: `whatsapp_direct_messages`

**Productor:** Scraping Service
**Consumidor:** Gateway

**Payload:**
```json
{
  "requestId": "uuid-123",
  "userId": "573205711428",
  "message": "📊 Resultados...",
  "timestamp": "2025-04-11T10:57:00.000Z"
}
```

---

## Ejemplo de Conversación Completa

### 1️⃣ Usuario envía mensaje

```
Usuario WhatsApp: "scrappea https://amazon.com/s?k=laptop"
```

### 2️⃣ Gateway procesa

```javascript
// gateway/webhook-handler
{
  "userId": "573205711428",
  "message": "scrappea https://amazon.com/s?k=laptop"
}
```

### 3️⃣ Gateway publica a RabbitMQ

```javascript
// Cola: scraping_tasks
{
  "requestId": "abc-123",
  "userId": "573205711428",
  "url": "https://amazon.com/s?k=laptop",
  "instructions": {
    "type": "simple",
    "action": "scrape_text"
  }
}
```

### 4️⃣ Scraping Service procesa

```javascript
// Valida rate limit: 5/10 ✅
// Abre browser
// Navega a URL
// Espera carga
// Extrae datos
// Genera resumen inteligente
```

### 5️⃣ Scraping Service envía respuesta

```javascript
// Cola: whatsapp_direct_messages
{
  "requestId": "abc-123",
  "userId": "573205711428",
  "message": "📊 Resultados de Scraping\n🔗 https://amazon.com/s?k=laptop\n====================\n\n📦 Laptop Dell XPS 15\n💰 $1,299\n⭐ 4.8/5\n✅ En stock"
}
```

### 6️⃣ Gateway envía a WhatsApp

```
Usuario WhatsApp recibe: "📊 Resultados de Scraping..."
```

---

## Testing

### 1. Test Local sin Docker

```bash
# Terminal 1: RabbitMQ
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:3.12-management

# Terminal 2: Gateway
cd services/gateway
npm start

# Terminal 3: Scraping Service
cd services/scraping
npm start:dev
```

### 2. Simular Mensaje

```bash
curl -X POST http://localhost:3000/api/scraping \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "573205711428",
    "url": "https://example.com",
    "instructions": {"type": "simple"}
  }'
```

### 3. Monitorear RabbitMQ

```
http://localhost:15672
Username: guest
Password: guest
```

---

## Troubleshooting

### Problema: "Scraping Service no recibe mensajes"

```bash
# 1. Verificar que RabbitMQ está corriendo
curl http://localhost:15672/api/queues

# 2. Verificar conexión en logs
docker logs scraping

# 3. Verificar que RABBITMQ_URL es correcto
docker exec scraping env | grep RABBITMQ

# 4. Re-crear las queues
docker exec rabbitmq rabbitmqctl purge_queue scraping_tasks
```

### Problema: "WhatsApp no recibe respuesta"

```bash
# 1. Verificar que la respuesta está en la cola
docker exec rabbitmq rabbitmqctl list_queues

# 2. Verificar Gateway logs
docker logs gateway

# 3. Verificar credenciales de Meta Cloud API
```

---

## Próximas Mejoras

1. **Agregar Slack adapter** - Permitir notificaciones también por Slack
2. **Persistencia de resultados** - Guardar scrapings en BD para historial
3. **Dashboard** - UI para monitorear scrapings y limites
4. **Webhooks externos** - Permitir que otros servicios triggereen scrapings
5. **Caché de resultados** - Reutilizar si misma URL en corto tiempo

---

## Documentación de Referencia

- [RabbitMQ Docs](https://www.rabbitmq.com/documentation.html)
- [Puppeteer Docs](https://pptr.dev/)
- [NestJS Docs](https://docs.nestjs.com/)
