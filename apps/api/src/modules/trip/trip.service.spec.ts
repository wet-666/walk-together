import { Test } from '@nestjs/testing';
import { ErrorCode, MemberStatus } from '@walk-together/shared-types';
import { DatabaseService } from '../../common/database/database.service';
import { AmapService } from './amap.service';
import { TripEventHub } from './trip-event.hub';
import { TripService } from './trip.service';

describe('TripService.apply', () => {
  const amap = { fillPlace: jest.fn(async (place: { name: string }) => place) };
  const db = {
    query: jest.fn(),
    exec: jest.fn(),
    withTransaction: jest.fn(),
  };
  const events = { emit: jest.fn() };

  let trips: TripService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TripService,
        { provide: DatabaseService, useValue: db },
        { provide: AmapService, useValue: amap },
        { provide: TripEventHub, useValue: events },
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

  it('notifies the captain when someone applies', async () => {
    db.query
      .mockResolvedValueOnce([tripRow()])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([]);
    db.exec.mockResolvedValueOnce({});
    jest.spyOn(trips, 'detail').mockResolvedValue({
      id: 9,
      applications: [],
    } as never);

    await trips.apply(2, 9, { message: '一起走' });

    expect(events.emit).toHaveBeenCalledWith({ type: 'updated', tripId: 9, userIds: [1] });
    expect(db.exec).toHaveBeenCalled();
  });
});

describe('TripService.listMine', () => {
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
        { provide: TripEventHub, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    trips = module.get(TripService);
  });

  function mineRow() {
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
      depart_at: new Date('2026-09-20T08:00:00.000Z'),
      estimated_days: 3,
      daily_mileage: null,
      companion_depth: 'medium',
      along_plans: null,
      max_vehicles: 2,
      vehicle_count: 1,
      privacy: 'public',
      allow_copy: 1,
      cover_url: null,
      fee_note: null,
      tags: null,
      announcement: null,
      invite_code: 'ABC234',
      status: 'ended',
      created_at: new Date(),
      my_status: 'left',
      my_role: 'member',
    };
  }

  it('keeps active memberships for the trip tab', async () => {
    db.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await trips.listMine(2);
    expect(String(db.query.mock.calls[0][0])).toContain("mine.status IN ('approved', 'pending', 'leave_pending')");
  });

  it('returns joined history when scope is all', async () => {
    db.query.mockResolvedValueOnce([mineRow()]).mockResolvedValueOnce([
      { trip_id: 9, status: 'left', role: 'member' },
    ]);
    const rows = await trips.listMine(2, 'all');
    expect(String(db.query.mock.calls[0][0])).not.toContain(
      "mine.status IN ('approved', 'pending', 'leave_pending')",
    );
    expect(rows[0]).toMatchObject({
      id: 9,
      myStatus: 'left',
      myRole: 'member',
    });
  });
});

describe('TripService.listPlaza', () => {
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
        { provide: TripEventHub, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    trips = module.get(TripService);
  });

  it('filters recruiting trips by destination and depart day', async () => {
    db.query.mockResolvedValueOnce([]);
    await trips.listPlaza({
      dest: '康定',
      departFrom: '2026-09-20',
      departTo: '2026-09-20',
    });
    const sql = String(db.query.mock.calls[0][0]);
    const params = db.query.mock.calls[0][1] as string[];
    expect(sql).toContain('t.dest_name LIKE ?');
    expect(sql).toContain('t.depart_at >= ?');
    expect(sql).toContain('t.depart_at < ?');
    expect(params[0]).toBe('%康定%');
    expect(params[1]).toContain('2026-09-20 00:00:00');
    expect(params[2]).toContain('2026-09-21 00:00:00');
  });
});
