import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { EventsModule } from './events/events.module';
import { UserModule } from './user/user.module';
import { ClientModule } from './client/client.module';
import { ChannelModule } from './channel/channel.module';
import { ComplaintModule } from './complaint/complaint.module';
import { FriendRequestModule } from './friend_request/friend_request.module';
import { OSSModule } from './third-party/oss/oss.module';
import { SystemMessageModule } from './system_message/system_message.module';
import { RedisCacheModule } from './common/redis-cache/redis-cache.module';
import { ContentScanModule } from './third-party/content-scan/content-scan.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WinstonOptions } from './common/logger/winston-options';
import { StickerModule } from './sticker/sticker.module';

@Module({
  imports: [
    WinstonModule.forRoot(WinstonOptions),
    TypeOrmModule.forRoot(),
    EventsModule,
    UserModule,
    ClientModule,
    ChannelModule,
    ComplaintModule,
    FriendRequestModule,
    OSSModule,
    SystemMessageModule,
    RedisCacheModule,
    ContentScanModule,
    StickerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class ApplicationModule {}
