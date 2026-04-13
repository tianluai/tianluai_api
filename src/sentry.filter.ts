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

    // Nest does not log when a global filter handles the exception; Sentry still captures.
    // Log server-side failures in all environments (ops / log aggregation); avoid noisy 4xx in prod.
    const shouldLog = status >= 500 || !(exception instanceof HttpException);
    if (shouldLog) {
      console.error('[SentryExceptionFilter]', exception);
    }

    response.status(status).json(message);
  }
}
