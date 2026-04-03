import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/app-exception.filter';
import { assertApiEnv, assertAuthModeSafety } from './common/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  assertApiEnv();
  assertAuthModeSafety();
  const port = Number(process.env.PORT ?? 4000);
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  app.useGlobalFilters(new AppExceptionFilter());

  app.enableCors({
    origin: [appUrl],
    credentials: true
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DraftOrbit API running at http://localhost:${port}`);
}

bootstrap();
