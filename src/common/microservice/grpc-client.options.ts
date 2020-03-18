import { ClientOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

export const grpcClientOptions: ClientOptions = {
  transport: Transport.GRPC,
  options: {
    url: '0.0.0.0:50000',
    package: 'chat',
    protoPath: join(__dirname, './protos/chat.proto'),
    loader: {
      includeDirs: [join(__dirname, './protos')],
      keepCase: true,
    },
  },
};
