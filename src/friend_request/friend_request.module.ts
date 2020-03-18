import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendRequest } from './friend_request.entity';
import { FriendRequestService } from './friend_request.service';
import { User } from '../user/user.entity';
import { ChannelsUser } from '../channel/channels_user.entity';
import { ChannelModule } from '../channel/channel.module';
import { ClientModule } from '../client/client.module';
import { EmitModule } from '../common/emitter/emit.module';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FriendRequest, User, ChannelsUser]),
    ChannelModule,
    ClientModule,
    EmitModule,
    MessageModule,
  ],
  providers: [FriendRequestService],
  exports: [FriendRequestService],
})
export class FriendRequestModule {}
