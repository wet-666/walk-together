import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 标记为公开接口。M0 全部放行，M1 起未标记的才校验 JWT。 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
