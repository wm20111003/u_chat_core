import { Module } from '@nestjs/common';
import { ContentScanService } from './content-scan.service';

@Module({
  providers: [ContentScanService],
  exports: [ContentScanService],
})
export class ContentScanModule {}
