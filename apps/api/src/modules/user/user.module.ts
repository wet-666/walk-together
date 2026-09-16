import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { WechatService } from './wechat.service';

@Module({
  controllers: [AuthController, UserController],
  providers: [AuthService, SmsService, WechatService, UserService],
  exports: [UserService],
})
export class UserModule {}
