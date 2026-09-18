import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode, type ApiResult } from '@walk-together/shared-types';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (this.isApiResult(raw)) {
        response.status(status).json(raw);
        return;
      }

      const message = typeof raw === 'string' ? raw : exception.message || '请求失败';
      let code: number = status;
      if (status === HttpStatus.UNAUTHORIZED) {
        code = ErrorCode.UNAUTHORIZED;
      } else if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
        code = ErrorCode.FAILED;
      }
      response.status(status).json({
        code,
        message,
        data: null,
      } satisfies ApiResult);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack || exception.message : String(exception),
    );
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
