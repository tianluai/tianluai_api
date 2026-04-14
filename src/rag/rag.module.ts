import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OpenAIService } from './openai.service';
import { PineconeService } from './pinecone.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [RagController],
  providers: [OpenAIService, PineconeService, RagService],
  exports: [RagService, OpenAIService, PineconeService],
})
export class RagModule {}
