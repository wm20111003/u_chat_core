import { Test, TestingModule } from '@nestjs/testing';
import { OSSService } from './oss.service';

describe('OSSService', () => {
  let service: OSSService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OSSService],
    }).compile();

    service = module.get<OSSService>(OSSService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
