import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

function trimString({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class QueueWorkspaceQueryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  workspaceId: string;
}

export class QueueIndexJobResponseDto {
  jobId: string;
}

export class QueueJobStatusQueryDto extends QueueWorkspaceQueryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  jobId: string;
}
