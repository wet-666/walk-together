import { ConfigService } from '@nestjs/config';
import { AmapService } from './amap.service';

function mockFetch(payload: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  (globalThis as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

describe('AmapService.searchPlaces', () => {
  const config = { get: jest.fn() };
  let amap: AmapService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((_key: string, fallback = '') => fallback);
    amap = new AmapService(config as unknown as ConfigService);
  });

  it('returns empty when the web key is missing', async () => {
    await expect(amap.searchPlaces('成都')).resolves.toEqual([]);
  });

  it('maps input tips to place suggestions', async () => {
    config.get.mockReturnValue('web-key');
    mockFetch({
      status: '1',
      tips: [
        {
          name: '成都站',
          district: '四川省成都市',
          address: '火车北站',
          location: '104.073,30.697',
        },
        { name: '', location: '104,30' },
      ],
    });

    await expect(amap.searchPlaces('成都')).resolves.toEqual([
      {
        name: '成都站',
        address: '火车北站',
        district: '四川省成都市',
        lng: 104.073,
        lat: 30.697,
      },
    ]);
  });
});

describe('AmapService.drivePolyline', () => {
  const config = { get: jest.fn() };
  let amap: AmapService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue('web-key');
    amap = new AmapService(config as unknown as ConfigService);
  });

  it('returns the original points when gaode rejects the driving request', async () => {
    mockFetch({ status: '0', info: 'DAILY_QUERY_OVER_LIMIT' });
    const points = [
      { lng: 104.06, lat: 30.67 },
      { lng: 101.96, lat: 30.05 },
    ];
    await expect(amap.drivePolyline(points)).resolves.toEqual(points);
  });

  it('flattens driving steps into a simplified polyline', async () => {
    mockFetch({
      status: '1',
      route: {
        paths: [
          {
            steps: [
              { polyline: '104.06,30.67;103.8,30.5' },
              { polyline: '103.8,30.5;101.96,30.05' },
            ],
          },
        ],
      },
    });
    await expect(
      amap.drivePolyline([
        { lng: 104.06, lat: 30.67 },
        { lng: 101.96, lat: 30.05 },
      ]),
    ).resolves.toEqual([
      { lng: 104.06, lat: 30.67 },
      { lng: 103.8, lat: 30.5 },
      { lng: 103.8, lat: 30.5 },
      { lng: 101.96, lat: 30.05 },
    ]);
  });
});

describe('AmapService.reverseGeocode', () => {
  const config = { get: jest.fn() };
  let amap: AmapService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue('web-key');
    amap = new AmapService(config as unknown as ConfigService);
  });

  it('uses the formatted address as the place name', async () => {
    mockFetch({
      status: '1',
      regeocode: {
        formatted_address: '四川省成都市锦江区春熙路',
        addressComponent: { district: '锦江区' },
      },
    });

    await expect(amap.reverseGeocode(104.08, 30.66)).resolves.toMatchObject({
      name: '四川省成都市锦江区春熙路',
      district: '锦江区',
      lng: 104.08,
      lat: 30.66,
    });
  });
});
