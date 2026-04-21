import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  QueueIndexJobResponseDto,
  QueueJobStatusQueryDto,
  QueueWorkspaceQueryDto,
} from './dto/document-index.dto';
import { QueueService } from './queue.service';

@Controller('queue')
@UseGuards(AuthGuard)
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  @Post('document-index')
  async enqueueDocumentIndex(
    @ClerkUserId() clerkId: string,
    @Query() query: QueueWorkspaceQueryDto,
  ): Promise<QueueIndexJobResponseDto> {
    await this.workspacesService.assertWorkspaceMembership(
      clerkId,
      query.workspaceId,
    );
    const queuedJob = await this.queueService.enqueueDocumentIndexJob({
      clerkId,
      workspaceId: query.workspaceId,
    });
    return { jobId: String(queuedJob.id) };
  }

  @Get('document-index')
  async getDocumentIndexStatus(
    @ClerkUserId() clerkId: string,
    @Query() query: QueueJobStatusQueryDto,
  ) {
    await this.workspacesService.assertWorkspaceMembership(
      clerkId,
      query.workspaceId,
    );
    const queuedJob = await this.queueService.getDocumentIndexJob(query.jobId);
    if (!queuedJob) {
      throw new NotFoundException('Index job not found.');
    }
    if (
      queuedJob.data.workspaceId !== query.workspaceId ||
      queuedJob.data.clerkId !== clerkId
    ) {
      throw new ForbiddenException('You do not have access to this index job.');
    }
    return queuedJob;
  }
}
