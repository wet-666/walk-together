import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ErrorCode } from '@walk-together/shared-types';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            check: async () => ({
              code: ErrorCode.OK,
              message: 'ok',
              data: {
                mysql: 'ok',
                redis: 'ok',
                uptime: 1,
                version: '0.1.0-m0',
              },
            }),
          },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('returns wrapped health payload', async () => {
    await expect(controller.check()).resolves.toMatchObject({
      code: ErrorCode.OK,
      message: 'ok',
    });
  });
});
