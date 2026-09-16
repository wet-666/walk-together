import { Test } from '@nestjs/testing';
import { ErrorCode, MemberStatus } from '@walk-together/shared-types';
import { DatabaseService } from '../../common/database/database.service';
import { AmapService } from './amap.service';
import { TripService } from './trip.service';

describe('TripService.apply', () => {
  const amap = { fillPlace: jest.fn(async (place: { name: string }) => place) };
  const db = {
    query: jest.fn(),
    exec: jest.fn(),
    withTransaction: jest.fn(),
  };

  let trips: TripService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TripService,
        { provide: DatabaseService, useValue: db },
        { provide: AmapService, useValue: amap },
      ],
    }).compile();
    trips = module.get(TripService);
  });

  function tripRow() {
    return {
      id: 9,
      captain_id: 1,
      captain_nickname: '队长',
      title: '川西',
      origin_name: '成都',
      origin_lng: null,
      origin_lat: null,
      dest_name: '康定',
      dest_lng: null,
      dest_lat: null,
      depart_at: new Date(Date.now() + 86400000),
      estimated_days: 3,
      daily_mileage: null,
      companion_depth: 'medium',
      along_plans: null,
      max_vehicles: 2,
      privacy: 'public',
      allow_copy: 1,
      cover_url: null,
      fee_note: null,
      tags: null,
      announcement: null,
      invite_code: 'ABC234',
      status: 'recruiting',
      created_at: new Date(),
    };
  }

  it('does not let the captain apply to their own trip', async () => {
    db.query.mockResolvedValueOnce([tripRow()]);
    await expect(trips.apply(1, 9, {})).rejects.toMatchObject({
      errorCode: ErrorCode.TRIP_ALREADY_MEMBER,
    });
  });

  it('rejects a second pending apply', async () => {
    db.query
      .mockResolvedValueOnce([tripRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          user_id: 2,
          nickname: '队员',
          avatar_url: null,
          vehicle_model: null,
          plate_number: null,
          role: 'member',
          status: MemberStatus.PENDING,
          apply_message: null,
          created_at: new Date(),
        },
      ]);

    await expect(trips.apply(2, 9, { message: '一起走' })).rejects.toMatchObject({
      errorCode: ErrorCode.TRIP_APPLY_INVALID,
    });
  });
});
