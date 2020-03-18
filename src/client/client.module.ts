import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { ClientService } from './client.service';
import { EmitModule } from '../common/emitter/emit.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
    EmitModule,
    forwardRef(() => ChannelModule),
  ],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
