import { Body, Controller, Post, Req } from '@nestjs/common';
import type { LoginBySmsDto, LoginByWxDto, SendSmsDto } from '@walk-together/shared-types';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthedRequest } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('sms/send')
  async sendSms(@Body() dto: SendSmsDto) {
    await this.auth.sendSms(dto);
    return null;
  }

  @Public()
  @Post('login/sms')
  loginBySms(@Body() dto: LoginBySmsDto) {
    return this.auth.loginBySms(dto);
  }

  @Public()
  @Post('login/wechat')
  loginByWechat(@Body() dto: LoginByWxDto) {
    return this.auth.loginByWechat(dto);
  }

  @Post('logout')
  async logout(@Req() request: AuthedRequest) {
    await this.auth.logout(request.tokenJti, request.tokenExp);
    return null;
  }
}
