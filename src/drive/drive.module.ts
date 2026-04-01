import { Module } from '@nestjs/common';
import { DriveAuthService } from './drive-auth.service';
import { DriveController } from './drive.controller';

@Module({
  controllers: [DriveController],
  providers: [DriveAuthService],
})
export class DriveModule {}
