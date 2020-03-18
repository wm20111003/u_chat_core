import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemMessage } from './system_message.entity';
import { User } from '../user/user.entity';
import { SystemMessageService } from './system_message.service';
import { ClientModule } from '../client/client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemMessage, User]),
    forwardRef(() => ClientModule),
  ],
  providers: [SystemMessageService],
  exports: [SystemMessageService],
})
export class SystemMessageModule {}
