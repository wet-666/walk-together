import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { RedisService } from '../redis/redis.service';
import { BusinessException } from '../exceptions/business.exception';

export type AccessTokenPayload = {
  userId: number;
  jti: string;
  exp: number;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  sign(userId: number): { token: string; expiresIn: number; jti: string } {
    const jti = randomUUID();
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN', '7d');
    const token = jwt.sign(
      { sub: String(userId) },
      this.secret(),
      { expiresIn, jwtid: jti } as SignOptions,
    );
    const decoded = jwt.decode(token) as JwtPayload;
    const exp = Number(decoded.exp ?? 0);
    const iat = Number(decoded.iat ?? Math.floor(Date.now() / 1000));

    return {
      token,
      jti,
      expiresIn: Math.max(exp - iat, 0),
    };
  }

  verify(token: string): AccessTokenPayload {
    try {
      const payload = jwt.verify(token, this.secret()) as JwtPayload;
      const userId = Number(payload.sub);
      const jti = payload.jti;
      if (!userId || !jti) {
        throw BusinessException.unauthorized();
      }
      return { userId, jti, exp: Number(payload.exp ?? 0) };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }
      throw BusinessException.unauthorized();
    }
  }

  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }
    await this.redis.setEx(this.blockKey(jti), ttlSeconds, '1');
  }

  async isRevoked(jti: string): Promise<boolean> {
    const blocked = await this.redis.get(this.blockKey(jti));
    return blocked === '1';
  }

  remainingTtl(exp: number): number {
    return Math.max(exp - Math.floor(Date.now() / 1000), 0);
  }

  private secret(): string {
    return this.config.get<string>('JWT_SECRET', 'walk-together-dev-jwt-secret-change-me');
  }

  private blockKey(jti: string): string {
    return `auth:block:${jti}`;
  }
}
