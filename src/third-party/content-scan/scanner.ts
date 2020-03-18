import * as http from 'http';
import * as crypto from 'crypto';
import nanoid = require('nanoid');
import { MessageType } from '../../message/message.entity';
import { Code } from '../../common/error/code';

export interface ScannerOptions {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
}

export interface MessageProps {
  cid?: string;
  type: MessageType;
  content?: string;
  file?: string;
}

export class Scanner {
  private defaultHeaders: any;

  constructor(private readonly options: ScannerOptions) {
    this.defaultHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-acs-version': '2018-05-09',
      'x-acs-signature-version': '1.0',
      'x-acs-signature-method': 'HMAC-SHA1',
    };
  }

  // 文字内容扫描
  async scanText(message: MessageProps): Promise<any> {
    const path = '/green/text/scan';
    const body = {
      scenes: ['antispam'],
      tasks: [
        {
          dataId: message.cid,
          content: message.content,
        },
      ],
    };
    const headers = {
      Date: new Date().toUTCString(),
      'x-acs-signature-nonce': nanoid(),
      'Content-MD5': crypto
        .createHash('md5')
        .update(JSON.stringify(body))
        .digest('base64'),
      ...this.defaultHeaders,
    };
    headers['Authorization'] = this.signature({ headers, path });
    return await this.fetch(path, { headers, body });
  }

  // 检测场景 scenes:
  // porn - 监黄
  // terrorism - 暴恐涉政识别
  // ad - 广告识别
  async scanImage(message: MessageProps): Promise<any> | never {
    throw new Error(Code.COMMON_FEATURE_WIP);
    // const path = '/green/image/scan';
    // const body = JSON.stringify({
    //   scenes: ['porn', 'terrorism', 'ad'],
    //   tasks: [
    //     {
    //       dataId: message.cid,
    //       url: message.file,
    //     },
    //   ],
    // });
    // const headers = {
    //   Date: new Date().toUTCString(),
    //   'x-acs-signature-nonce': nanoid(),
    //   'Content-MD5': md5
    //     .update(body)
    //     .digest()
    //     .toString('base64'),
    //   ...this.defaultHeaders,
    // };
    // headers['Authorization'] = this.signature(headers, path);

    // return await this.fetch(path, { headers, body });
  }

  private signature({ headers, path, clientInfo = { ip: '127.0.0.1' } }) {
    const { accessKeyId, accessKeySecret } = this.options;
    const signature = [
      'POST\n',
      `${headers['Accept']}\n`,
      `${headers['Content-MD5']}\n`,
      `${headers['Content-Type']}\n`,
      `${headers['Date']}\n`,
      `x-acs-signature-method:${headers['x-acs-signature-method']}\n`,
      `x-acs-signature-nonce:${headers['x-acs-signature-nonce']}\n`,
      `x-acs-signature-version:${headers['x-acs-signature-version']}\n`,
      `x-acs-version:${headers['x-acs-version']}\n`,
      `${path}`,
    ];

    const authorization = crypto
      .createHmac('sha1', accessKeySecret)
      .update(signature.join(''))
      .digest()
      .toString('base64');

    return `acs ${accessKeyId}:${authorization}`;
  }

  private async fetch(path, { headers, body }): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: `green.cn-${this.options.region}.aliyuncs.com`,
          port: 80,
          path,
          method: 'POST',
          headers,
        },
        res => {
          res.setEncoding('utf8');
          let rawData = '';
          res.on('data', chunk => {
            rawData += chunk;
          });
          res.on('end', () => {
            try {
              const result = JSON.parse(rawData);
              if (result.code === 200) {
                resolve(result.data[0]);
              } else {
                reject(result);
              }
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.write(JSON.stringify(body));
      req.on('error', reject);
      req.end();
    });
  }
}
