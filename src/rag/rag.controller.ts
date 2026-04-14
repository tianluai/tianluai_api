import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ClerkUserId } from '../auth/clerk-user.decorator';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { RagChatRequestDto } from './dto/rag-chat.dto';
import { RagService } from './rag.service';

@Controller('rag')
@UseGuards(AuthGuard)
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly workspacesService: WorkspacesService,
  ) {}

  private async ensureWorkspaceAccess(
    clerkId: string,
    workspaceId: string,
  ): Promise<void> {
    const workspace = await this.workspacesService.getWorkspace(
      clerkId,
      workspaceId,
    );
    if (!workspace) {
      throw new ForbiddenException('You do not have access to this workspace.');
    }
  }

  @Post('chat')
  async chat(@ClerkUserId() clerkId: string, @Body() body: RagChatRequestDto) {
    await this.ensureWorkspaceAccess(clerkId, body.workspaceId);

    const chunks: string[] = [];
    for await (const delta of this.ragService.streamChat(
      body.workspaceId,
      body.message,
      body.history ?? [],
    )) {
      chunks.push(delta);
    }

    return { answer: chunks.join('') };
  }
}
