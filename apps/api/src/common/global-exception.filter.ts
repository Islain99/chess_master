import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Filtre d'exceptions global.
 * Normalise toutes les réponses d'erreur au format :
 * { statusCode, error, message, timestamp, path }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx   = host.switchToHttp();
    const req   = ctx.getRequest<Request>();
    const res   = ctx.getResponse<Response>();

    let status:  number;
    let error:   string;
    let message: string | string[];

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        error   = (body as any).error   ?? exception.name;
        message = (body as any).message ?? exception.message;
      } else {
        error   = exception.name;
        message = String(body);
      }
    } else if (exception instanceof Error) {
      status  = HttpStatus.INTERNAL_SERVER_ERROR;
      error   = 'INTERNAL_ERROR';
      message = 'Une erreur interne est survenue.';
      this.logger.error(
        `${req.method} ${req.url} — ${exception.message}`,
        exception.stack,
      );
    } else {
      status  = HttpStatus.INTERNAL_SERVER_ERROR;
      error   = 'UNKNOWN_ERROR';
      message = 'Erreur inconnue.';
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path:      req.url,
    });
  }
}
