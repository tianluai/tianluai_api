import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Name is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;
}
