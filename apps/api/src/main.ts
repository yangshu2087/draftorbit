import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppExceptionFilter } from './common/app-exception.filter';
import { assertApiEnv, assertAuthModeSafety, assertBillingEnvSafety } from './common/env';
import { ensureRequestId } from './common/request-id';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  assertApiEnv();
  assertAuthModeSafety();
  assertBillingEnvSafety();
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

  app.use((req: any, res: any, next: () => void) => {
    ensureRequestId(req, res);
    next();
  });

  app.enableCors({
    origin: [appUrl],
    credentials: true
  });

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`DraftOrbit API running at http://localhost:${port}`);
}

bootstrap();
