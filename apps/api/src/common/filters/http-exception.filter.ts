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
    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: ApiResult = {
      code: status === HttpStatus.INTERNAL_SERVER_ERROR ? ErrorCode.FAILED : status,
      message: isHttp ? exception.message : '服务异常',
      data: null,
    };
    response.status(status).json(body);
  }
}
