import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Feedback } from './feedback.entity';
import { FeedbackService } from './feedback.service';
import { ClientModule } from '../client/client.module';
import { SystemMessageModule } from '../system_message/system_message.module';
import { FeedbackController } from './feedback.controller';
import { User } from '../user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Feedback, User]),
    ClientModule,
    SystemMessageModule,
  ],
  providers: [FeedbackService],
  exports: [FeedbackService],
  controllers: [FeedbackController],
})
export class FeedbackModule {}
