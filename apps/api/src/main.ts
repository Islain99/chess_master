import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { assertProductionEnv } from './config/check-production-env';

async function bootstrap() {
  // Sprint 19 : refuse de démarrer en production avec un secret JWT d'exemple.
  assertProductionEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Sprint 20 : configuration partagée avec les tests end-to-end.
  await configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API demarree sur le port ${port}`);
}

bootstrap();
