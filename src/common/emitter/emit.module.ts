import { Module, Global, CacheModule } from '@nestjs/common';
import { EmitService } from './emit.service';
import { EmitController } from './emit.controller';

@Global()
@Module({
  providers: [EmitService],
  exports: [EmitService],
  controllers: [EmitController],
})
export class EmitModule {}
