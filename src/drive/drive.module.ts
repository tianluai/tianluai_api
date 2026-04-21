import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DriveAuthService } from './drive-auth.service';
import { DriveController } from './drive.controller';

@Module({
  imports: [WorkspacesModule],
  controllers: [DriveController],
  providers: [DriveAuthService],
  exports: [DriveAuthService],
})
export class DriveModule {}
