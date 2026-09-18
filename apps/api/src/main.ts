import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // rawBody: true — the GitHub webhook signature (Roadmap GAP-29) is an
  // HMAC over the exact request bytes; Nest exposes them as `req.rawBody`
  // only when this is set, without changing how any other route parses JSON.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
