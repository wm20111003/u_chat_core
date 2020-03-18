import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  FindParams,
  CreateParams,
  EditParams,
  UserService,
} from './user.service';
import { errorFilter } from '../common/error';

@Controller()
export class UserController {
  constructor(private readonly service: UserService) {}

  @GrpcMethod('UserService', 'GetList')
  async getList(params: FindParams): Promise<any> {
    try {
      return await this.service.getUserList(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('UserService', 'GetDetail')
  async getDetail(params: any): Promise<any> {
    try {
      return await this.service.getDetail(params.id);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('UserService', 'Create')
  async create(params: CreateParams): Promise<any> {
    try {
      return await this.service.create(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('UserService', 'Edit')
  async edit(params: EditParams): Promise<any> {
    try {
      return await this.service.edit(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('UserService', 'Delete')
  async delete(params: any): Promise<any> {
    try {
      await this.service.delete(params.id);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('UserService', 'Statistics')
  async Statistics(params: any): Promise<any> {
    try {
      return await this.service.statistics(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('UserService', 'GetActiveCount')
  async GetActiveCount(params: any): Promise<any> {
    try {
      return await this.service.getActiveCount(params.intervalType);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }
}
