import { Body, Controller, Get, Param, ParseIntPipe, Post, Res } from '@nestjs/common';
import type { ReportLocationDto } from '@walk-together/shared-types';
import { ErrorCode } from '@walk-together/shared-types';
import type { Response } from 'express';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { LocationService } from './location.service';

@Controller('location')
export class LocationController {
  constructor(private readonly locations: LocationService) {}

  @Get('active')
  active(@CurrentUserId() userId: number) {
    return this.locations.snapshot(userId);
  }

  @Get(':tripId/basemap')
  async basemap(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Res() res: Response,
  ) {
    const png = await this.locations.basemapPng(userId, tripId);
    if (!png) {
      res.status(404).json({
        code: ErrorCode.FAILED,
        message: '暂时没有高德底图',
        data: null,
      });
      return;
    }
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=5');
    res.send(png);
  }

  @Get(':tripId')
  snapshot(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
  ) {
    return this.locations.snapshot(userId, tripId);
  }

  @Post(':tripId')
  report(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: ReportLocationDto,
  ) {
    return this.locations.report(userId, tripId, dto);
  }
}
