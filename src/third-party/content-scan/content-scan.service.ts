import { Injectable } from '@nestjs/common';
import { Scanner, MessageProps } from './scanner';
import { MessageType } from '../../message/message.entity';
import { Code } from '../../common/error/code';

export enum ScanResult {
  pass = 'normal',
  review = 'suspected',
  block = 'prohibited',
}
export enum Scene {
  ANISPAM = 'antispam',
  PORN = 'porn',
  TERRORISM = 'terrorism',
}

const scanner = new Scanner({
  accessKeyId: process.env.ALIYUN_AK_ID,
  accessKeySecret: process.env.ALIYUN_AK_SECRET,
  region: 'shanghai',
});

@Injectable()
export class ContentScanService {
  async scan(message: MessageProps): Promise<any> | never {
    const { content, file } = message;
    if (!content && !file) throw new Error(Code.COMMON_PARAMS_MISSING);
    switch (message.type) {
      case MessageType.TEXT:
        return await scanner.scanText(message);
      case MessageType.IMAGE:
        return await scanner.scanImage(message);
      default:
        return { code: 200, results: [{ suggestion: 'pass' }] };
    }
  }
}
