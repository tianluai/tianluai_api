import { Transform, type TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

function isStringDecorator(): PropertyDecorator {
  return IsString();
}

function isNotEmptyDecorator(): PropertyDecorator {
  return IsNotEmpty();
}

function minLengthDecorator(min: number, message: string): PropertyDecorator {
  return MinLength(min, { message });
}

function transformDecorator(
  transformFn: (params: TransformFnParams) => unknown,
): PropertyDecorator {
  return Transform(transformFn);
}

export class CreateWorkspaceDto {
  @isStringDecorator()
  @isNotEmptyDecorator()
  @minLengthDecorator(1, 'Name is required')
  @transformDecorator(({ value }: TransformFnParams): string =>
    typeof value === 'string' ? value.trim() : '',
  )
  name: string;
}
