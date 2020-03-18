import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushService } from './push.service';
import { ChannelModule } from '../../channel/channel.module';
import { User } from '../../user/user.entity';
import { MessageModule } from '../../message/message.module';

@Global()
@Module({
  providers: [PushService],
  imports: [ChannelModule, TypeOrmModule.forFeature([User]), MessageModule],
  exports: [PushService],
})
export class PushModule {}
