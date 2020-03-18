import { JwtModule } from '@nestjs/jwt';
import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../user/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SMSModule } from '../third-party/sms/sms.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({ secret: 'chat' }),
    SMSModule,
  ],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
