import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    Sentry.captureException(exception);

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    // Nest will not log exceptions when a global filter handles them.
    // Keep responses stable, but log in non-prod to aid debugging.
    if (process.env.NODE_ENV !== 'production') {
      const shouldLog = status >= 500 || !(exception instanceof HttpException);
      if (shouldLog) {
        console.error('[SentryExceptionFilter]', exception);
      }
    }

    response.status(status).json(message);
  }
}
