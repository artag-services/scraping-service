# Scraping Service - Guía de Uso

## Inicio Rápido

### 1. Instalación

```bash
cd services/scraping
pnpm install
```

### 2. Configuración

Edita `.env`:

```bash
RABBITMQ_URL=amqp://guest:guest@localhost:5672
PUPPETEER_TIMEOUT=30000
RATE_LIMIT_DAILY=10
```

### 3. Iniciar el Servicio

```bash
pnpm start:dev
```

---

## Flujo de Trabajo

### Estructura del Mensaje

El usuario envía un mensaje de WhatsApp al gateway, que lo enruta a la cola RabbitMQ:

```json
{
  "requestId": "uuid-123",
  "userId": "573205711428",
  "url": "https://example.com/products",
  "instructions": {
    "type": "simple",
    "action": "scrape_text",
    "selectors": {
      "title": "h1.product-title",
      "price": ".price",
      "rating": ".stars"
    }
  }
}
```

### Flujo de Ejecución

```
1. Usuario envía: "scrappea https://amazon.com/s?k=laptop"
              ↓
2. Gateway recibe y envía a RabbitMQ (scraping_tasks)
              ↓
3. Scraping Service consume el mensaje
              ↓
4. Verifica rate limit del usuario
              ↓
5. Puppeteer abre browser y navega a URL
              ↓
6. Extrae datos según selectors
              ↓
7. SummaryService genera resumen inteligente
              ↓
8. Si es largo, divide en chunks
              ↓
9. Envía cada chunk a RabbitMQ (whatsapp_direct_messages)
              ↓
10. Gateway lee la cola y envía a WhatsApp
```

---

## Tipos de Scraping

### 1. Simple (Lectura Básica)

**Mensaje del usuario:**
```
scrappea https://example.com/products
```

**Instrucciones automáticas:**
```json
{
  "type": "simple",
  "action": "scrape_text",
  "selectors": {} // Se detecta automáticamente
}
```

---

### 2. Con Login

**Mensaje del usuario:**
```
scrappea https://shop.com/account con usuario admin@mail.com y password 123456
```

**JSON detallado:**
```json
{
  "type": "login",
  "login": {
    "username": "admin@mail.com",
    "password": "123456",
    "usernameSelector": "#email",
    "passwordSelector": "#password",
    "submitSelector": "button[type=submit]"
  },
  "selectors": {
    "account_name": ".account-name",
    "balance": ".balance"
  }
}
```

---

### 3. Con Login y Búsqueda

**JSON:**
```json
{
  "type": "login_and_search",
  "login": {
    "username": "user@example.com",
    "password": "pass123",
    "usernameSelector": "input#email",
    "passwordSelector": "input#pass",
    "submitSelector": "button.signin"
  },
  "search": {
    "query": "laptop gaming",
    "searchSelector": "input.search-box",
    "submitSelector": "button.search-btn",
    "waitTime": 3000
  },
  "extract": {
    "title": "h2.product-title",
    "price": ".product-price",
    "availability": ".availability"
  }
}
```

---

### 4. Solo Búsqueda

```json
{
  "type": "search",
  "search": {
    "query": "new products",
    "searchSelector": "input#q",
    "submitSelector": "button#search"
  },
  "selectors": {
    "products": ".product-item"
  }
}
```

---

## Ejemplos de Salida

### Respuesta Exitosa

```
📊 Resultados de Scraping
🔗 https://example.com/products
==================================================

📦 Title: Dell XPS 15 Laptop
💰 Price: $1,299.99
⭐ Rating: 4.8/5 (2,345 reseñas)
✅ Stock: En stock
🔗 [Link](https://example.com/product/123)

==================================================
⏰ 2025-04-11 10:30:45
```

### Error de Scraping

```
❌ Error en scraping: Timeout esperando elemento .product-title (30000ms)
```

### Rate Limit Excedido

```
⏰ Límite diario alcanzado (10/10). Reintentas el 2025-04-12 10:56:00
```

---

## Rate Limiting

### Configuración

Por defecto: **10 scrapings por día** (configurable en `.env`)

```bash
RATE_LIMIT_DAILY=10
RATE_LIMIT_WINDOW_HOURS=24
```

### Cómo Funciona

1. Primer scraping: `1/10`
2. Segundo scraping: `2/10`
3. ...
4. Décimo scraping: `10/10`
5. Undécimo scraping: ❌ `⏰ Límite excedido`

El contador se reinicia automáticamente cada 24 horas.

---

## Notificaciones

### Adaptadores Disponibles

1. **WhatsApp** (por defecto)
2. **Email** (opcional)

### Agregar Nuevos Adaptadores

Ver `EXTENSION_GUIDE.md` para:
- Slack
- Telegram
- Discord
- Notion

---

## Performance

### Browser Pool

Se usan 5 browsers reutilizables por defecto para optimizar recursos.

- Sin pool: ~500ms por instancia
- Con pool: ~50ms por reutilización

Configurar:

```bash
PUPPETEER_MAX_POOL_SIZE=5
```

### Timeouts

```bash
PUPPETEER_TIMEOUT=30000  # 30 segundos por scraping
```

Para sitios lentos, aumentar:

```bash
PUPPETEER_TIMEOUT=60000  # 60 segundos
```

---

## Troubleshooting

### Error: "Timeout esperando elemento"

**Causa:** El selector CSS no existe o la página tarda mucho en cargar

**Solución:**
1. Verificar que el selector es correcto (inspeccionar elemento en DevTools)
2. Aumentar timeout: `PUPPETEER_TIMEOUT=60000`
3. Aumentar wait time en búsqueda: `"waitTime": 5000`

### Error: "Anti-bot detectado"

**Causa:** El sitio bloqueó el navegador automatizado

**Solución:**
- El servicio usa stealth + rotación de User-Agents automáticamente
- Si persiste, agregar headers personalizados:

```json
{
  "headers": {
    "Referer": "https://google.com",
    "Accept-Language": "es-ES"
  }
}
```

### Error: "Pool exhausto esperando browser"

**Causa:** Más de 5 scrapings simultáneos

**Solución:**
- Aumentar `PUPPETEER_MAX_POOL_SIZE`
- Limitar concurrencia en gateway
- Aumentar reintentos: `RABBITMQ_RETRY_DELAY`

---

## Monitoreo

### Estadísticas del Servicio

Los logs muestran:

```
[Scraping Service] scraping_started { requestId: 'uuid-123', userId: '573205711428' }
[Scraping Service] Pool stats: { available: 4, inUse: 1, total: 5 }
[Scraping Service] User 573205711428 usage recorded: 5/10
```

### Health Check

```bash
curl http://localhost:3000/health
```

---

## Deployment

### Docker

```bash
docker build -t scraping-service .
docker run -e RABBITMQ_URL=amqp://rabbitmq:5672 scraping-service
```

### Docker Compose

```yaml
services:
  scraping:
    build: ./services/scraping
    environment:
      RABBITMQ_URL: amqp://rabbitmq:5672
      PUPPETEER_TIMEOUT: 30000
      RATE_LIMIT_DAILY: 10
    depends_on:
      - rabbitmq
```

---

## Siguientes Pasos

1. ✅ Integración con Gateway
2. ✅ Pruebas de scraping en sitios reales
3. ⬜ Agregar Slack adapter
4. ⬜ Agregar Notion adapter
5. ⬜ Dashboard de monitoreo
6. ⬜ Persistencia de resultados (opcional)

---

## Soporte

Para reportar bugs o sugerencias:
https://github.com/tu-repo/issues
