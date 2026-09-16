import { Module } from '@nestjs/common';
import { TripModule } from '../trip/trip.module';
import { LocationController } from './location.controller';
import { LocationGateway } from './location.gateway';
import { LocationHub } from './location.hub';
import { LocationService } from './location.service';

@Module({
  imports: [TripModule],
  controllers: [LocationController],
  providers: [LocationService, LocationHub, LocationGateway],
  exports: [LocationGateway],
})
export class LocationModule {}
