import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Complaint } from './complaint.entity';
import { ComplaintService } from './complaint.service';
import { User } from '../user/user.entity';
import { Channel } from '../channel/channel.entity';
import { ClientModule } from '../client/client.module';
import { SystemMessageModule } from '../system_message/system_message.module';
import { ComplaintController } from './complaint.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Complaint, User, Channel]),
    ClientModule,
    SystemMessageModule,
  ],
  providers: [ComplaintService],
  exports: [ComplaintService],
  controllers: [ComplaintController],
})
export class ComplaintModule {}
