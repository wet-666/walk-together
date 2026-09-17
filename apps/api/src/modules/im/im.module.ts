import { Module } from '@nestjs/common';
import { TripModule } from '../trip/trip.module';
import { ImController } from './im.controller';
import { ImHub } from './im.hub';
import { ImService } from './im.service';
import { TencentImService } from './tencent-im.service';

@Module({
  imports: [TripModule],
  controllers: [ImController],
  providers: [ImService, ImHub, TencentImService],
  exports: [ImService, ImHub],
})
export class ImModule {}
