import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

/** M0 空位：默认放行。M1 再校验 JWT。 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    return true;
  }
}
