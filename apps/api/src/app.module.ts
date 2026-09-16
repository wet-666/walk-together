import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TokenModule } from './common/auth/token.module';
import { DatabaseModule } from './common/database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';
import { LocationModule } from './modules/location/location.module';
import { TripModule } from './modules/trip/trip.module';
import { UserModule } from './modules/user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    DatabaseModule,
    RedisModule,
    TokenModule,
    HealthModule,
    UserModule,
    TripModule,
    LocationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
