import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { AuthUserId } from '../auth/auth-user.decorator';
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

  @Post('chat')
  async chat(
    @AuthUserId() authUserId: string,
    @Body() body: RagChatRequestDto,
  ) {
    await this.workspacesService.assertWorkspaceMembership(
      authUserId,
      body.workspaceId,
    );

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
