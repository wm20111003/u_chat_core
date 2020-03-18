import { config } from 'dotenv';
config({ debug: process.env.NODE_ENV !== 'production' });

import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import * as Sentry from '@sentry/node';
import { ApplicationModule } from './app.module';
import { RedisIoAdapter } from './adapters/redis-io.adapter';
import { grpcClientOptions } from './common/microservice/grpc-client.options';

async function bootstrap() {
  Sentry.init({
    dsn:
      'https://916ff113428d4fed92c1de4708b5fbe5@sentry-web.baifu-tech.net/49',
    environment: process.env.NODE_ENV,
    enabled: process.env.NODE_ENV === 'production',
  });
  process
    .on('unhandledRejection', error => {
      console.log(
        '!!!!!!!!!!!!!!!!!!!!!! unhandledRejection !!!!!!!!!!!!!!!!!!!!!!',
      );
      console.error(error);
    })
    .on('uncaughtException', error => {
      console.log(
        '!!!!!!!!!!!!!!!!!!!!!! uncaughtException !!!!!!!!!!!!!!!!!!!!!!',
      );
      console.error(error);
    });

  const app = await NestFactory.create<NestFastifyApplication>(
    ApplicationModule,
    new FastifyAdapter({
      logger: true,
    }),
  );
  app.connectMicroservice(grpcClientOptions);
  app.useWebSocketAdapter(new RedisIoAdapter(app));
  await app.startAllMicroservicesAsync();
  await app.listen(process.env.PORT || 3001, '0.0.0.0');
}
bootstrap();
