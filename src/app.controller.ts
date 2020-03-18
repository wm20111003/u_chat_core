import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // todo: implement health via:
  // https://docs.nestjs.com/recipes/terminus
  @Get('health')
  health(): string {
    return 'ok';
  }
}
