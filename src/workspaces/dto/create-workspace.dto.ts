import { Transform, type TransformFnParams } from 'class-transformer';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

function isStringDecorator(): PropertyDecorator {
  return IsString() as unknown as PropertyDecorator;
}

function isNotEmptyDecorator(): PropertyDecorator {
  return IsNotEmpty() as unknown as PropertyDecorator;
}

function minLengthDecorator(min: number, message: string): PropertyDecorator {
  return MinLength(min, { message }) as unknown as PropertyDecorator;
}

function transformDecorator(
  transformFn: (params: TransformFnParams) => unknown,
): PropertyDecorator {
  return Transform(transformFn) as unknown as PropertyDecorator;
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
