import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

const logger = new Logger('Scraping Service');

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
});

process.on('exit', (code) => {
  logger.log(`Process exiting with code ${code}`);
});

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    const port = process.env.PORT ?? '3000';
    const nodeEnv = process.env.NODE_ENV ?? 'development';

    logger.log(`Starting Scraping Service on port ${port} (${nodeEnv})`);

    // Trigger OnModuleInit lifecycle hooks (RabbitMQ, consumers)
    await app.init();

    if (process.env.ENABLE_HTTP_SERVER === 'true') {
      await app.listen(Number(port));
      logger.log(`HTTP server listening on port ${port}`);
    }

    // Keep process alive even if all external connections drop
    setInterval(() => {}, 24 * 60 * 60 * 1000);

    logger.log('Scraping Service is ready');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to start application: ${errorMessage}`);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  logger.error(`Bootstrap crashed: ${msg}`);
});
