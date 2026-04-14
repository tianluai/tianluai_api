import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

function trimString({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class DriveSaveFoldersBodyDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  workspaceId: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [],
  )
  folderIds: string[];
}
