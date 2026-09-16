import { ErrorCode } from '@walk-together/shared-types';
import { BusinessException } from '../../common/exceptions/business.exception';
import { buildStaticMapQuery, parseReport, staticMapZoom } from './location.util';

describe('location.util', () => {
  it('accepts a valid report', () => {
    expect(parseReport({ lng: 104.066541, lat: 30.572269, speed: 12.3, heading: 90 })).toEqual({
      lng: 104.066541,
      lat: 30.572269,
      speed: 12.3,
      heading: 90,
      accuracy: null,
    });
  });

  it('rejects an out-of-range longitude', () => {
    try {
      parseReport({ lng: 200, lat: 30 });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.LOCATION_INVALID);
    }
  });

  it('drops an invalid optional heading instead of rejecting the report', () => {
    expect(parseReport({ lng: 104.06, lat: 30.67, heading: -1 })).toEqual({
      lng: 104.06,
      lat: 30.67,
      speed: null,
      heading: null,
      accuracy: null,
    });
  });

  it('rejects a missing latitude', () => {
    try {
      parseReport({ lng: 104 } as { lng: number; lat: number });
      throw new Error('expected throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BusinessException);
      expect((error as BusinessException).errorCode).toBe(ErrorCode.LOCATION_INVALID);
    }
  });

  it('builds a gaode static map query from a route', () => {
    const query = buildStaticMapQuery({
      route: [
        { lng: 104.06, lat: 30.67 },
        { lng: 103.0, lat: 30.2 },
        { lng: 101.96, lat: 30.05 },
      ],
      markers: [{ lng: 104.06, lat: 30.67, label: 'ME', color: '0x2563EB' }],
    });
    expect(query).toContain('paths=');
    expect(query).not.toContain('markers=');
    expect(staticMapZoom([{ lng: 104, lat: 30 }, { lng: 101, lat: 29 }])).toBeLessThan(9);
  });
});
