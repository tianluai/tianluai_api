import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import {
  Organization,
  OrganizationSchema,
} from './schemas/organization.schema';
import {
  OrganizationMember,
  OrganizationMemberSchema,
} from './schemas/organization-member.schema';
import {
  WorkspaceSyncState,
  WorkspaceSyncStateSchema,
} from './schemas/workspace-sync-state.schema';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { WorkspaceSyncStateService } from './workspace-sync-state.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Organization.name, schema: OrganizationSchema },
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: WorkspaceSyncState.name, schema: WorkspaceSyncStateSchema },
    ]),
    UsersModule,
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceSyncStateService],
  exports: [WorkspacesService, WorkspaceSyncStateService],
})
export class WorkspacesModule {}
