import { Module } from '@nestjs/common';
import { OSSService } from './oss.service';

@Module({ providers: [OSSService], exports: [OSSService] })
export class OSSModule {}
