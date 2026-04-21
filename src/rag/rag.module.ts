import { Module } from '@nestjs/common';
import { VECTOR_INDEX_STORE } from '../indexing/indexing.tokens';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { OpenAIService } from './openai.service';
import { PineconeService } from './pinecone.service';
import { PineconeVectorIndexStore } from './pinecone-vector-index-store.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';

@Module({
  imports: [WorkspacesModule],
  controllers: [RagController],
  providers: [
    OpenAIService,
    PineconeService,
    PineconeVectorIndexStore,
    {
      provide: VECTOR_INDEX_STORE,
      useExisting: PineconeVectorIndexStore,
    },
    RagService,
  ],
  exports: [
    RagService,
    OpenAIService,
    PineconeService,
    PineconeVectorIndexStore,
    VECTOR_INDEX_STORE,
  ],
})
export class RagModule {}
