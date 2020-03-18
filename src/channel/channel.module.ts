import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './channel.entity';
import { ChannelsUser } from './channels_user.entity';
import { User } from '../user/user.entity';
import { ChannelService } from './channel.service';
import { MessageModule } from '../message/message.module';
import { SystemMessage } from '../system_message/system_message.entity';
import { Complaint } from '../complaint/complaint.entity';
import { ChannelController } from './channel.controller';
import { ClientModule } from '../client/client.module';
import { EmitModule } from '../common/emitter/emit.module';
import { UserModule } from '../user/user.module';
import { PreferenceModule } from '../preference/preference.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Channel,
      ChannelsUser,
      User,
      Complaint,
      SystemMessage,
    ]),
    MessageModule,
    PreferenceModule,
    forwardRef(() => UserModule),
    forwardRef(() => ClientModule),
    EmitModule,
  ],
  providers: [ChannelService],
  exports: [ChannelService],
  controllers: [ChannelController],
})
export class ChannelModule {}
