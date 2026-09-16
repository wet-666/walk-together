import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { TokenService } from '../auth/token.service';
import type { AuthedRequest } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { BusinessException } from '../exceptions/business.exception';

type GuardRequest = Request & AuthedRequest;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    const token = this.readBearer(request.headers.authorization);
    if (!token) {
      throw BusinessException.unauthorized();
    }

    const payload = this.tokens.verify(token);
    if (await this.tokens.isRevoked(payload.jti)) {
      throw BusinessException.unauthorized();
    }

    request.userId = payload.userId;
    request.tokenJti = payload.jti;
    request.tokenExp = payload.exp;
    return true;
  }

  private readBearer(header: unknown): string | null {
    if (typeof header !== 'string') {
      return null;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1]?.trim() || null;
  }
}
