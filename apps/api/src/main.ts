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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );

  app.useGlobalFilters(new AppExceptionFilter());

  app.enableCors({
    origin: [process.env.APP_URL ?? 'http://localhost:3000'],
    credentials: true
  });

  await app.listen(4000);
  // eslint-disable-next-line no-console
  console.log('DraftOrbit API running at http://localhost:4000');
}

bootstrap();
