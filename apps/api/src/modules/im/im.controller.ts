import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { SendChatTextDto } from '@walk-together/shared-types';
import { ErrorCode } from '@walk-together/shared-types';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ImService } from './im.service';

type UploadedChatImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Controller('im')
export class ImController {
  constructor(private readonly im: ImService) {}

  @Get('credentials')
  credentials(@CurrentUserId() userId: number) {
    return this.im.credentials(userId);
  }

  @Get('unread')
  unread(@CurrentUserId() userId: number) {
    return this.im.unreadTotal(userId);
  }

  @Get('conversations')
  conversations(@CurrentUserId() userId: number) {
    return this.im.listConversations(userId);
  }

  @Get('trips/:tripId')
  conversation(@CurrentUserId() userId: number, @Param('tripId', ParseIntPipe) tripId: number) {
    return this.im.getConversation(userId, tripId);
  }

  @Get('trips/:tripId/messages')
  messages(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Query('beforeId') beforeId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.im.listMessages(
      userId,
      tripId,
      beforeId ? Number(beforeId) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Post('trips/:tripId/messages')
  sendText(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: SendChatTextDto,
  ) {
    return this.im.sendText(userId, tripId, dto);
  }

  @Post('trips/:tripId/images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  sendImage(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @UploadedFile() file?: UploadedChatImage,
  ) {
    if (!file?.buffer) {
      throw new BusinessException(ErrorCode.IM_INVALID, '请选择图片');
    }
    return this.im.sendImage(userId, tripId, file);
  }

  @Post('trips/:tripId/read')
  markRead(
    @CurrentUserId() userId: number,
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() body: { lastMessageId?: number },
  ) {
    return this.im.markRead(userId, tripId, body?.lastMessageId);
  }
}
