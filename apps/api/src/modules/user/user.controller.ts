import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  BindPhoneDto,
  UpdateProfileDto,
} from '@walk-together/shared-types';
import { ErrorCode } from '@walk-together/shared-types';
import type { AuthedRequest } from '../../common/decorators/current-user.decorator';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

type UploadedAvatar = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

@Controller('users')
export class UserController {
  constructor(
    private readonly users: UserService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  me(@CurrentUserId() userId: number) {
    return this.users.getProfile(userId);
  }

  @Patch('me')
  updateMe(@CurrentUserId() userId: number, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Post('me/phone')
  bindPhone(@CurrentUserId() userId: number, @Body() dto: BindPhoneDto) {
    return this.auth.bindPhone(userId, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadAvatar(
    @CurrentUserId() userId: number,
    @UploadedFile() file?: UploadedAvatar,
  ) {
    if (!file?.buffer) {
      throw new BusinessException(ErrorCode.PROFILE_INVALID, '请选择头像图片');
    }
    return this.users.saveAvatarFile(userId, file);
  }

  @Post('me/cancel')
  async cancel(@CurrentUserId() userId: number, @Req() request: AuthedRequest) {
    await this.auth.cancel(userId, request.tokenJti, request.tokenExp);
    return null;
  }
}
