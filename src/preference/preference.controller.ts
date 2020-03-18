import { Controller } from '@nestjs/common';
import { PreferenceService } from './preference.service';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { errorFilter } from '../common/error';

@Controller()
export class PreferenceController {
  constructor(private readonly service: PreferenceService) {}

  @GrpcMethod('PreferenceService', 'Save')
  async save(params: any): Promise<any> {
    try {
      await this.service.save([params]);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(error.message);
    }
  }

  @GrpcMethod('PreferenceService', 'List')
  async list({ names }: { names: string[] }): Promise<any> {
    try {
      const data = await this.service.find(names);
      return { status: 'success', data };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }
}
