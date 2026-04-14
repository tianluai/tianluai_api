import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

function trimString({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Shared: `workspaceId` for Drive routes (user identity comes from the auth token). */
export class DriveWorkspaceQueryDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  workspaceId: string;
}

export class DriveFoldersQueryDto extends DriveWorkspaceQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return 'root';
    return typeof value === 'string' ? value.trim() : 'root';
  })
  parentId: string = 'root';
}
