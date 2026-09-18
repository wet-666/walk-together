import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  ApplyJoinDto,
  CreateTripDto,
  UpdateCopyDto,
  UpdateTripDto,
} from '@walk-together/shared-types';
import { ErrorCode } from '@walk-together/shared-types';
import {
  CurrentUserId,
  OptionalUserId,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AmapService } from './amap.service';
import { TripService } from './trip.service';
import { toCoord } from './trip.util';

type UploadedCover = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Controller('trips')
export class TripController {
  constructor(
    private readonly trips: TripService,
    private readonly amap: AmapService,
  ) {}

  @Public()
  @Get()
  list(
    @OptionalUserId() userId: number | null,
    @Query('keyword') keyword?: string,
    @Query('dest') dest?: string,
    @Query('departFrom') departFrom?: string,
    @Query('departTo') departTo?: string,
    @Query('code') code?: string,
    @Query('lng') lng?: string,
    @Query('lat') lat?: string,
    @Query('sort') sort?: 'time' | 'distance',
    @Query('nearby') nearby?: string,
  ) {
    return this.trips.listPlaza({
      keyword,
      dest,
      departFrom,
      departTo,
      code,
      lng: toCoord(lng) ?? undefined,
      lat: toCoord(lat) ?? undefined,
      sort: sort === 'distance' ? 'distance' : 'time',
      nearby: nearby === '1' || nearby === 'true',
      userId,
    });
  }

  @Get('mine')
  mine(@CurrentUserId() userId: number, @Query('scope') scope?: string) {
    return this.trips.listMine(userId, scope === 'all' ? 'all' : 'active');
  }

  @Public()
  @Get('places')
  async places(
    @Query('keyword') keyword?: string,
    @Query('lng') lng?: string,
    @Query('lat') lat?: string,
  ) {
    const pointLng = toCoord(lng);
    const pointLat = toCoord(lat);
    if (pointLng != null && pointLat != null) {
      const place = await this.amap.reverseGeocode(pointLng, pointLat);
      return place ? [place] : [];
    }
    return this.amap.searchPlaces(keyword ?? '');
  }

  @Post()
  create(@CurrentUserId() userId: number, @Body() dto: CreateTripDto) {
    return this.trips.create(userId, dto);
  }

  @Public()
  @Get(':id')
  detail(
    @Param('id', ParseIntPipe) id: number,
    @OptionalUserId() userId: number | null,
    @Query('code') code?: string,
  ) {
    return this.trips.detail(id, userId, code);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserId() userId: number,
    @Body() dto: UpdateTripDto,
  ) {
    return this.trips.update(userId, id, dto);
  }

  @Post(':id/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadCover(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserId() userId: number,
    @UploadedFile() file?: UploadedCover,
  ) {
    if (!file?.buffer) {
      throw new BusinessException(ErrorCode.TRIP_INVALID, '请选择封面图片');
    }
    return this.trips.saveCover(userId, id, file);
  }

  @Post(':id/announcement')
  announcement(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserId() userId: number,
    @Body() body: { announcement?: string },
  ) {
    return this.trips.setAnnouncement(userId, id, body.announcement ?? '');
  }

  @Post(':id/start')
  start(@Param('id', ParseIntPipe) id: number, @CurrentUserId() userId: number) {
    return this.trips.start(userId, id);
  }

  @Post(':id/end')
  end(@Param('id', ParseIntPipe) id: number, @CurrentUserId() userId: number) {
    return this.trips.end(userId, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUserId() userId: number) {
    return this.trips.cancel(userId, id);
  }

  @Post(':id/apply')
  apply(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserId() userId: number,
    @Body() dto: ApplyJoinDto,
  ) {
    return this.trips.apply(userId, id, dto);
  }

  @Post(':id/leave')
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUserId() userId: number) {
    return this.trips.leave(userId, id);
  }

  @Post(':id/applications/:userId/approve')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @CurrentUserId() userId: number,
  ) {
    return this.trips.decide(userId, id, targetUserId, 'approve');
  }

  @Post(':id/applications/:userId/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @CurrentUserId() userId: number,
  ) {
    return this.trips.decide(userId, id, targetUserId, 'reject');
  }

  @Post(':id/members/:userId/remove')
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @CurrentUserId() userId: number,
  ) {
    return this.trips.removeMember(userId, id, targetUserId);
  }

  @Get(':id/copy')
  getCopy(@Param('id', ParseIntPipe) id: number, @CurrentUserId() userId: number) {
    return this.trips.getCopy(userId, id);
  }

  @Patch(':id/copy')
  updateCopy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUserId() userId: number,
    @Body() dto: UpdateCopyDto,
  ) {
    return this.trips.updateCopy(userId, id, dto);
  }
}
