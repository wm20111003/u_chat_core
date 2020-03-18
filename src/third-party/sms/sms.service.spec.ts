import { Test, TestingModule } from '@nestjs/testing';
import { SMSService } from './sms.service';

describe('SmsService', () => {
  let service: SMSService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SMSService],
    }).compile();

    service = module.get<SMSService>(SMSService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
