import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@walk-together/shared-types';

export class BusinessException extends HttpException {
  constructor(
    public readonly errorCode: number,
    message: string,
    status: HttpStatus = HttpStatus.OK,
  ) {
    super({ code: errorCode, message, data: null }, status);
  }

  static unauthorized(message = '登录已失效，请重新登录'): BusinessException {
    return new BusinessException(
      ErrorCode.UNAUTHORIZED,
      message,
      HttpStatus.UNAUTHORIZED,
    );
  }
}
