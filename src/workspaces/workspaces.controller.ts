import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceDto, WorkspaceListItemDto } from './dto/workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async listMyWorkspaces(
    @ClerkUserId() clerkId: string,
  ): Promise<WorkspaceListItemDto[]> {
    const list = await this.workspacesService.listMyWorkspaces(clerkId);
    return list.map(
      (item): WorkspaceListItemDto => ({
        id: item.id,
        name: item.name,
        role: item.role,
      }),
    );
  }

  @Post()
  async createWorkspace(
    @ClerkUserId() clerkId: string,
    @Body() body: CreateWorkspaceDto,
  ): Promise<WorkspaceDto> {
    const created = await this.workspacesService.createWorkspace(
      clerkId,
      body.name,
    );
    const dto: WorkspaceDto = { id: created.id, name: created.name };
    return dto;
  }

  @Get(':id')
  async getWorkspace(
    @ClerkUserId() clerkId: string,
    @Param('id') id: string,
  ): Promise<WorkspaceDto | null> {
    const workspace = await this.workspacesService.getWorkspace(clerkId, id);
    if (!workspace) return null;
    const dto: WorkspaceDto = { id: workspace.id, name: workspace.name };
    return dto;
  }
}
