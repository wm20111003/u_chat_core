import { Test, TestingModule } from '@nestjs/testing';
import { ContentScannerService } from './content-scanner.service';

describe('ContentScannerService', () => {
  let service: ContentScannerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentScannerService],
    }).compile();

    service = module.get<ContentScannerService>(ContentScannerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
