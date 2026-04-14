import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

function trimString({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class DriveAuthBodyDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  workspaceId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  returnUrl: string;
}
