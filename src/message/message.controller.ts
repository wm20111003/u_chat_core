import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { Not, In } from 'typeorm';
import { MessageService, FindParams, AuditOperator } from './message.service';
import { MessageStatus } from './message.entity';
import { errorFilter } from '../common/error';

@Controller()
export class MessageController {
  constructor(private readonly service: MessageService) {}

  // OSS违规检测结果回调
  // https://help.aliyun.com/document_detail/129946.html?spm=a2c4g.11186623.6.559.73a634beYoUymD
  @Post('/third-party/ossCallback')
  @HttpCode(200)
  async ossScanCallback(@Body() data): Promise<any> {
    // todo: verify data.checksum
    const {
      object: file,
      scanResult: { results },
    } = JSON.parse(data.content);
    if (file.startsWith('message/')) {
      const { suggestion, scene, label } = results.find(x =>
        ['block', 'review'].includes(x.suggestion),
      );
      this.service.markAuditStatus({
        query: {
          file,
          status: Not(In([MessageStatus.PROHIBITED, MessageStatus.DELETED])),
        },
        label,
        suggestion,
        operator: AuditOperator.SCANNER,
        scene,
      });
    }
  }

  @GrpcMethod('MessageService', 'GetList')
  async getList(params: FindParams): Promise<any> {
    try {
      return await this.service.getSuspectedMsgList(params);
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }

  @GrpcMethod('MessageService', 'Audit')
  async audit(params: { id: number; status: MessageStatus }): Promise<any> {
    try {
      const { id, status } = params;
      await this.service.audit(id, status);
      return { status: 'success' };
    } catch (error) {
      throw new RpcException(errorFilter(error));
    }
  }
}
