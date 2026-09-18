import { Test } from '@nestjs/testing';
import { ErrorCode, MemberRole } from '@walk-together/shared-types';
import { RedisService } from '../../common/redis/redis.service';
import { AmapService } from '../trip/amap.service';
import { TripService } from '../trip/trip.service';
import { LocationHub } from './location.hub';
import { LocationService } from './location.service';

describe('LocationService', () => {
  const trips = {
    getLiveMapContext: jest.fn(),
    saveNodeCoordinates: jest.fn(),
  };
  const redis = {
    hset: jest.fn(),
    expire: jest.fn(),
    hgetall: jest.fn(),
    get: jest.fn(),
    setEx: jest.fn(),
  };
  const amap = {
    geocode: jest.fn(),
    drivePolyline: jest.fn(),
  };
  const hub = {
    emit: jest.fn(),
  };

  let locations: LocationService;

  beforeEach(async () => {
    jest.resetAllMocks();
    redis.hgetall.mockResolvedValue({});
    redis.get.mockResolvedValue(null);
    amap.drivePolyline.mockImplementation(async (points: Array<{ lng: number; lat: number }>) => points);
    const module = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: TripService, useValue: trips },
        { provide: RedisService, useValue: redis },
        { provide: AmapService, useValue: amap },
        { provide: LocationHub, useValue: hub },
      ],
    }).compile();
    locations = module.get(LocationService);
  });

  function context() {
    return {
      tripId: 9,
      title: '川西',
      status: 'recruiting' as const,
      originName: '成都',
      destName: '康定',
      nodes: [
        { id: 1, seq: 1, kind: 'origin' as const, name: '成都', lng: 104.06, lat: 30.67 },
        { id: 2, seq: 2, kind: 'dest' as const, name: '康定', lng: 101.96, lat: 30.05 },
      ],
      members: [
        {
          userId: 1,
          nickname: '队长',
          avatarUrl: null,
          vehicleModel: null,
          plateNumber: null,
          role: MemberRole.CAPTAIN,
          status: 'approved' as const,
          applyMessage: null,
          joinedAt: new Date().toISOString(),
        },
        {
          userId: 2,
          nickname: '队员',
          avatarUrl: null,
          vehicleModel: null,
          plateNumber: null,
          role: MemberRole.MEMBER,
          status: 'approved' as const,
          applyMessage: null,
          joinedAt: new Date().toISOString(),
        },
      ],
    };
  }

  it('returns null when the user has no live trip', async () => {
    trips.getLiveMapContext.mockResolvedValueOnce(null);
    await expect(locations.snapshot(2)).resolves.toBeNull();
  });

  it('stores a report and broadcasts it', async () => {
    trips.getLiveMapContext.mockResolvedValueOnce(context());
    const point = await locations.report(2, 9, { lng: 104.1, lat: 30.6, speed: 8 });
    expect(point.userId).toBe(2);
    expect(point.nickname).toBe('队员');
    expect(point.online).toBe(true);
    expect(redis.hset).toHaveBeenCalled();
    expect(hub.emit).toHaveBeenCalledWith(9, expect.objectContaining({ userId: 2, lng: 104.1 }));
  });

  it('rejects a report from a non-member', async () => {
    trips.getLiveMapContext.mockResolvedValueOnce({ ...context(), members: [context().members[0]] });
    await expect(locations.report(2, 9, { lng: 104.1, lat: 30.6 })).rejects.toMatchObject({
      errorCode: ErrorCode.TRIP_FORBIDDEN,
    });
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it('includes fresh teammate points in the snapshot', async () => {
    trips.getLiveMapContext.mockResolvedValueOnce(context());
    redis.hgetall.mockResolvedValueOnce({
      '2': JSON.stringify({
        userId: 2,
        nickname: '旧名',
        avatarUrl: null,
        role: 'member',
        lng: 104.2,
        lat: 30.5,
        speed: null,
        heading: null,
        accuracy: null,
        reportedAt: new Date().toISOString(),
        online: true,
      }),
    });
    const snapshot = await locations.snapshot(1, 9);
    expect(snapshot?.members).toEqual([
      expect.objectContaining({ userId: 2, nickname: '队员', lng: 104.2, online: true }),
    ]);
    expect(snapshot?.roster).toHaveLength(2);
    expect(snapshot?.polyline.length).toBeGreaterThanOrEqual(2);
  });

  it('geocodes missing trip nodes so the map can follow the route', async () => {
    trips.getLiveMapContext.mockResolvedValueOnce({
      ...context(),
      nodes: [
        { id: 1, seq: 1, kind: 'origin' as const, name: '成都', lng: 104.06, lat: 30.67 },
        { id: 2, seq: 2, kind: 'dest' as const, name: '康定', lng: null, lat: null },
      ],
    });
    amap.geocode.mockResolvedValueOnce({ lng: 101.96, lat: 30.05 });

    const snapshot = await locations.snapshot(1, 9);

    expect(snapshot?.nodes[1]).toMatchObject({ name: '康定', lng: 101.96, lat: 30.05 });
    expect(trips.saveNodeCoordinates).toHaveBeenCalledWith(
      9,
      expect.arrayContaining([expect.objectContaining({ id: 2, lng: 101.96, lat: 30.05 })]),
    );
    expect(snapshot?.polyline.length).toBeGreaterThanOrEqual(2);
  });
});
