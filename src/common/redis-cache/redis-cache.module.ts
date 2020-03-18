import { Module, Global, CacheModule } from '@nestjs/common';
import * as redisStore from 'cache-manager-ioredis';

@Global()
@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      ttl: 60, // seconds
      max: 10000, // maximum number of items in cache
      db: 1,
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
