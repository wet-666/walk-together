import { Controller, Get } from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  me(@CurrentUserId() userId: number) {
    return this.users.getProfile(userId);
  }
}
