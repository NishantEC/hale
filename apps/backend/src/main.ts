// Sentry must be imported and initialized BEFORE any other module so its
// instrumentation can patch core libraries (http, express, postgres, etc.).
// Init is a no-op when SENTRY_DSN is unset so local dev stays quiet.
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 0.1),
  });
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.SENTRY_DSN) {
    // Hook into Express's error layer. Sentry's setupExpressErrorHandler
    // registers a global error middleware that captures unhandled
    // exceptions thrown from controllers and emits them with stack +
    // request context.
    Sentry.setupExpressErrorHandler(app.getHttpAdapter().getInstance());
  }
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
    credentials: false,
    optionsSuccessStatus: 204,
  });
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT || 3009);
}
bootstrap();
