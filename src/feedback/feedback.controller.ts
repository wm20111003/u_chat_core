import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { FindParams, FeedbackService } from './feedback.service';
import { errorFilter } from '../common/error';

@Controller()
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @GrpcMethod('FeedbackService', 'GetList')
  async getList(params: FindParams): Promise<any> {
    try {
      return await this.service.getFeedbackList(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('FeedbackService', 'Reply')
  async reply(params: {
    id: number;
    reply: string;
    memo: string;
  }): Promise<any> {
    try {
      const { id, reply, memo } = params;
      await this.service.replyFeedback(id, reply, memo);
      return {
        status: 'success',
      };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('FeedbackService', 'Delete')
  async remove(params: { id: number }): Promise<any> {
    try {
      const { id } = params;
      await this.service.deleteOneById(id);
      return {
        status: 'success',
      };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }
}
