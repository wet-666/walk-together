import { Module } from '@nestjs/common';
import { AmapService } from './amap.service';
import { TripEventHub } from './trip-event.hub';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';

@Module({
  controllers: [TripController],
  providers: [TripService, AmapService, TripEventHub],
  exports: [TripService, AmapService, TripEventHub],
})
export class TripModule {}
