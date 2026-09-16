import { CompanionDepth, ErrorCode, TripPrivacy } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  assertMaxVehicles,
  assertTitle,
  assertWaypoints,
  createInviteCode,
  haversineKm,
  normalizeCreate,
} from './trip.util';

function future(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

describe('trip.util', () => {
  it('creates a 6-char invite code', () => {
    expect(createInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('rejects a short title', () => {
    try {
      assertTitle('啊');
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.TRIP_INVALID);
    }
  });

  it('caps waypoints at 5', () => {
    try {
      assertWaypoints(Array.from({ length: 6 }, (_, i) => ({ name: `点${i + 1}号` })));
      throw new Error('expected throw');
    } catch (error) {
      expect((error as BusinessException).errorCode).toBe(ErrorCode.TRIP_INVALID);
    }
  });

  it('limits vehicles to 1–20', () => {
    expect(assertMaxVehicles(8)).toBe(8);
    try {
      assertMaxVehicles(21);
      throw new Error('expected throw');
    } catch (error) {
      expect((error as BusinessException).errorCode).toBe(ErrorCode.TRIP_INVALID);
    }
  });

  it('normalizes a publish payload', () => {
    const input = normalizeCreate({
      title: '川西小环线',
      origin: { name: '成都' },
      destination: { name: '康定' },
      waypoints: [{ name: '雅安' }],
      departAt: future(),
      maxVehicles: 4,
      companionDepth: CompanionDepth.DEEP,
      privacy: TripPrivacy.PUBLIC,
    });
    expect(input.origin.name).toBe('成都');
    expect(input.waypoints).toHaveLength(1);
    expect(input.allowCopy).toBe(true);
  });

  it('computes distance in kilometers', () => {
    expect(haversineKm(104.06, 30.67, 101.96, 30.05)).toBeGreaterThan(100);
  });
});
