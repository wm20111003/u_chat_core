import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { ClientModule } from '../client/client.module';
import { UserModule } from '../user/user.module';
import { ChannelModule } from '../channel/channel.module';
import { MessageModule } from '../message/message.module';
import { FriendRequestModule } from '../friend_request/friend_request.module';
import { AuthGuard } from '../common/guards/auth.guard';
import { AuthModule } from '../auth/auth.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { ComplaintModule } from '../complaint/complaint.module';
import { SMSModule } from '../third-party/sms/sms.module';
import { OSSModule } from '../third-party/oss/oss.module';
import { PreferenceModule } from '../preference/preference.module';
import { SystemMessageModule } from '../system_message/system_message.module';
import { EmitModule } from '../common/emitter/emit.module';
import { PushModule } from '../common/pusher/push.module';
import { StickerModule } from '../sticker/sticker.module';

@Module({
  providers: [EventsGateway],
  imports: [
    ClientModule,
    UserModule,
    ChannelModule,
    MessageModule,
    FriendRequestModule,
    AuthGuard,
    AuthModule,
    FeedbackModule,
    ComplaintModule,
    SMSModule,
    OSSModule,
    PreferenceModule,
    SystemMessageModule,
    EmitModule,
    PushModule,
    StickerModule,
  ],
})
export class EventsModule {}
