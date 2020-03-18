import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentScanModule } from '../third-party/content-scan/content-scan.module';
import { EmitModule } from '../common/emitter/emit.module';
import { ChannelModule } from '../channel/channel.module';
import { Message } from './message.entity';
import { MessageService } from './message.service';
import { Channel } from '../channel/channel.entity';
import { ChannelsUser } from '../channel/channels_user.entity';
import { MessageController } from './message.controller';
import { User } from '../user/user.entity';
import { ClientModule } from '../client/client.module';
import { SystemMessageModule } from '../system_message/system_message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, ChannelsUser, User, Channel]),
    forwardRef(() => ChannelModule),
    forwardRef(() => ClientModule),
    ContentScanModule,
    EmitModule,
    SystemMessageModule,
  ],
  providers: [MessageService],
  exports: [MessageService],
  controllers: [MessageController],
})
export class MessageModule {}
