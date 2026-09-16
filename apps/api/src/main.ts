import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

function corsOrigin(): boolean | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/v1/files/',
  });

  app.enableCors({ origin: corsOrigin() });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://0.0.0.0:${port}/api/v1/health`);
}

void bootstrap();
