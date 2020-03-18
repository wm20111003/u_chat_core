import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { AuthModule } from '../auth/auth.module';
import { SMSModule } from '../third-party/sms/sms.module';
import { ChannelsUser } from '../channel/channels_user.entity';
import { UserController } from './user.controller';
import { ClientModule } from '../client/client.module';
import { EmitModule } from '../common/emitter/emit.module';
import { Channel } from '../channel/channel.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, ChannelsUser, Channel]),
    AuthModule,
    SMSModule,
    EmitModule,
    forwardRef(() => ClientModule),
  ],
  providers: [UserService],
  exports: [UserService],
  controllers: [UserController],
})
export class UserModule {}
