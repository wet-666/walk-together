import { Module } from '@nestjs/common';
import { AmapService } from './amap.service';
import { TripController } from './trip.controller';
import { TripService } from './trip.service';

@Module({
  controllers: [TripController],
  providers: [TripService, AmapService],
  exports: [TripService],
})
export class TripModule {}
