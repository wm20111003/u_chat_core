import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  ComplaintService,
  FindComplaintParams,
  ReplyParams,
  FindUserComplaintParams,
} from './complaint.service';
import { errorFilter } from '../common/error';

@Controller()
export class ComplaintController {
  constructor(private readonly service: ComplaintService) {}

  @GrpcMethod('ComplaintService', 'GetList')
  async getList(params: FindComplaintParams): Promise<any> {
    try {
      return await this.service.getComplaintList(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ComplaintService', 'Reply')
  async reply(params: ReplyParams): Promise<any> {
    try {
      await this.service.reply(params);
      return {
        status: 'success',
      };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('ComplaintService', 'Delete')
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

  @GrpcMethod('ComplaintService', 'GetUserComplaintList')
  async getUserCompliantList(params: FindUserComplaintParams): Promise<any> {
    try {
      return await this.service.getUserComplaintList(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }
}
