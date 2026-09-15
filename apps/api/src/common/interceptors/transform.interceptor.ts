import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ErrorCode, type ApiResult } from '@walk-together/shared-types';
import { map, type Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResult> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (this.isApiResult(data)) {
          return data;
        }
        return {
          code: ErrorCode.OK,
          message: 'ok',
          data: data ?? null,
        };
      }),
    );
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
