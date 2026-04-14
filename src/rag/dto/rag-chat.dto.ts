import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

function trimString({ value }: { value: unknown }): string {
  return typeof value === 'string' ? value.trim() : '';
}

export class RagChatMessageDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  content: string;
}

export class RagChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  workspaceId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  message: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RagChatMessageDto)
  history?: RagChatMessageDto[];
}
