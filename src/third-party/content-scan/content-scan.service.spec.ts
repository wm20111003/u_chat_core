import { Test, TestingModule } from '@nestjs/testing';
import { ContentScanService } from './content-scan.service';

describe('ContentScannerService', () => {
  let service: ContentScanService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentScanService],
    }).compile();

    service = module.get<ContentScanService>(ContentScanService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
