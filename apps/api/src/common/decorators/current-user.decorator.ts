import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthedRequest = {
  userId?: number;
  tokenJti?: string;
  tokenExp?: number;
};

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    return Number(request.userId);
  },
);
