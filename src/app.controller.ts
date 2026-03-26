import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { version } from '../package.json';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  health() {
    return { status: 'ok', version, timestamp: new Date().toISOString() };
  }
}
