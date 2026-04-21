import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { DriveModule } from '../drive/drive.module';
import { RagModule } from '../rag/rag.module';
import { QueueController } from './queue.controller';
import { DocumentIndexJobProcessor } from './document-index-job.processor';
import { QueueService } from './queue.service';

@Module({
  imports: [
    WorkspacesModule,
    DriveModule,
    RagModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        return {
          connection: redisUrl
            ? { url: redisUrl }
            : {
                host: config.get('REDIS_HOST', 'localhost'),
                port: config.get('REDIS_PORT', 6379),
              },
        };
      },
    }),
    BullModule.registerQueue({ name: 'document-index' }),
  ],
  controllers: [QueueController],
  providers: [DocumentIndexJobProcessor, QueueService],
  exports: [QueueService],
})
export class QueueModule {}
