import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClerkAuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(ClerkAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async listMyWorkspaces(@ClerkUserId() clerkId: string) {
    return this.workspacesService.listMyWorkspaces(clerkId);
  }

  @Post()
  async createWorkspace(
    @ClerkUserId() clerkId: string,
    @Body('name') name: string,
  ) {
    if (!name?.trim()) throw new BadRequestException('Name is required');
    return this.workspacesService.createWorkspace(clerkId, name.trim());
  }

  @Get(':id')
  async getWorkspace(@ClerkUserId() clerkId: string, @Param('id') id: string) {
    return this.workspacesService.getWorkspace(clerkId, id);
  }
}
