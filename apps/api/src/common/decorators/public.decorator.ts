import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 不校验登录 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
