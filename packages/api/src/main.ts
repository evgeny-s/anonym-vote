import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { FaucetConfig } from './config/faucet.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(FaucetConfig);

  // Behind Heroku / any reverse proxy, Express collapses every
  // request's `ip` to the proxy's address unless we trust
  // X-Forwarded-For. Without this, the rate limiter would apply one
  // shared bucket to every caller — i.e. globally throttle all users
  // together, which is obviously wrong.
  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(config.port);
  new Logger('bootstrap').log(`anon-vote faucet listening on :${config.port}`);
}

void bootstrap();
