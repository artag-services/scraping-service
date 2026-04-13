// src/main.ts

import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from './app.module'
import { ScrapingListener } from './queue/scraping.listener'
import { BrowserPool } from './scraper/browser-pool'

const logger = new Logger('Scraping Service')

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule)

    const port = process.env.PORT || 3000
    const nodeEnv = process.env.NODE_ENV || 'development'

    logger.log(`Starting Scraping Service on port ${port} (${nodeEnv})`)

    // Initialize BrowserPool first before other components
    const browserPool = app.get(BrowserPool)
    logger.log('🚀 Initializing Browser Pool...')
    await browserPool.onModuleInit()
    logger.log('✅ Browser Pool initialized successfully')

    // Manually initialize ScrapingListener (RabbitMQ subscriptions)
    const scrapingListener = app.get(ScrapingListener)
    logger.log('🚀 Initializing Scraping Listener (RabbitMQ subscriptions)...')
    await scrapingListener.onModuleInit()
    logger.log('✅ Scraping Listener initialized successfully')

    // No necesitamos listen porque el servicio funciona principalmente con RabbitMQ
    // Pero dejamos un endpoint de health check disponible
    if (process.env.ENABLE_HTTP_SERVER === 'true') {
      await app.listen(port)
      logger.log(`HTTP server listening on port ${port}`)
    }

    logger.log('Scraping Service is ready')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Failed to start application: ${errorMessage}`)
    process.exit(1)
  }
}

bootstrap()
