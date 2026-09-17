import { Test } from '@nestjs/testing';
import { ErrorCode } from '@walk-together/shared-types';
import { DatabaseService } from '../../common/database/database.service';
import { TripEventHub } from '../trip/trip-event.hub';
import { ImHub } from './im.hub';
import { ImService } from './im.service';
import { TencentImService } from './tencent-im.service';

describe('ImService', () => {
  const db = {
    query: jest.fn(),
    exec: jest.fn(),
  };
  const events = {
    on: jest.fn(() => () => undefined),
  };
  const hub = {
    emit: jest.fn(),
  };
  const tencent = {
    isEnabled: jest.fn(() => false),
    credentials: jest.fn(() => ({
      enabled: false,
      sdkAppId: null,
      userId: null,
      userSig: null,
      expireAt: null,
    })),
    ensureGroup: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
  };

  let im: ImService;

  beforeEach(async () => {
    jest.resetAllMocks();
    events.on.mockReturnValue(() => undefined);
    tencent.isEnabled.mockReturnValue(false);
    tencent.credentials.mockReturnValue({
      enabled: false,
      sdkAppId: null,
      userId: null,
      userSig: null,
      expireAt: null,
    });
    const module = await Test.createTestingModule({
      providers: [
        ImService,
        { provide: DatabaseService, useValue: db },
        { provide: TripEventHub, useValue: events },
        { provide: ImHub, useValue: hub },
        { provide: TencentImService, useValue: tencent },
      ],
    }).compile();
    im = module.get(ImService);
  });

  function tripRow() {
    return {
      id: 9,
      title: '川西',
      status: 'recruiting',
      im_group_id: null,
      updated_at: new Date(),
    };
  }

  it('returns disabled credentials when IM keys are empty', () => {
    expect(im.credentials(2)).toEqual({
      enabled: false,
      sdkAppId: null,
      userId: null,
      userSig: null,
      expireAt: null,
    });
  });

  it('rejects chat from a non-member', async () => {
    db.query.mockResolvedValueOnce([tripRow()]).mockResolvedValueOnce([]);
    await expect(im.sendText(2, 9, { content: '你好' })).rejects.toMatchObject({
      errorCode: ErrorCode.IM_FORBIDDEN,
    });
    expect(db.exec).not.toHaveBeenCalled();
  });

  it('stores a text message and broadcasts it', async () => {
    db.query
      .mockResolvedValueOnce([tripRow()])
      .mockResolvedValueOnce([
        {
          user_id: 2,
          nickname: '队员',
          avatar_url: null,
          status: 'approved',
        },
      ])
      .mockResolvedValueOnce([{ nickname: '队员', avatar_url: null }]);
    db.exec.mockResolvedValueOnce({ insertId: 17 });

    const message = await im.sendText(2, 9, { content: '  到服务区了  ' });
    expect(message).toMatchObject({
      id: 17,
      tripId: 9,
      senderId: 2,
      type: 'text',
      content: '到服务区了',
      mine: true,
      readCount: 0,
    });
    expect(hub.emit).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ id: 17, content: '到服务区了', mine: false, readCount: 0 }),
    );
  });
});
