import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ErrorCode, type ApiResult } from '@walk-together/shared-types';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (this.isApiResult(raw)) {
        response.status(status).json(raw);
        return;
      }

      const message =
        typeof raw === 'string'
          ? raw
          : exception.message || '请求失败';
      response.status(status).json({
        code:
          status === HttpStatus.UNAUTHORIZED
            ? ErrorCode.UNAUTHORIZED
            : status === HttpStatus.INTERNAL_SERVER_ERROR
              ? ErrorCode.FAILED
              : status,
        message,
        data: null,
      } satisfies ApiResult);
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ErrorCode.FAILED,
      message: '服务异常',
      data: null,
    } satisfies ApiResult);
  }

  private isApiResult(value: unknown): value is ApiResult {
    return (
      typeof value === 'object' &&
      value !== null &&
      'code' in value &&
      'message' in value
    );
  }
}
