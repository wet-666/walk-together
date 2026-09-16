export const TripStatus = {
  RECRUITING: 'recruiting',
  ONGOING: 'ongoing',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
} as const;

export type TripStatusValue = (typeof TripStatus)[keyof typeof TripStatus];

export const TripPrivacy = {
  PUBLIC: 'public',
  INVITE: 'invite',
} as const;

export type TripPrivacyValue = (typeof TripPrivacy)[keyof typeof TripPrivacy];

export const CompanionDepth = {
  SHALLOW: 'shallow',
  MEDIUM: 'medium',
  DEEP: 'deep',
} as const;

export type CompanionDepthValue = (typeof CompanionDepth)[keyof typeof CompanionDepth];

export const AlongPlan = {
  AA: 'aa',
  DINING: 'dining',
  SIGHTSEEING: 'sightseeing',
  HELP: 'help',
} as const;

export type AlongPlanValue = (typeof AlongPlan)[keyof typeof AlongPlan];

export const TripNodeKind = {
  ORIGIN: 'origin',
  WAYPOINT: 'waypoint',
  DEST: 'dest',
} as const;

export type TripNodeKindValue = (typeof TripNodeKind)[keyof typeof TripNodeKind];

export const MemberRole = {
  CAPTAIN: 'captain',
  MEMBER: 'member',
} as const;

export type MemberRoleValue = (typeof MemberRole)[keyof typeof MemberRole];

export const MemberStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  LEFT: 'left',
  REMOVED: 'removed',
  LEAVE_PENDING: 'leave_pending',
} as const;

export type MemberStatusValue = (typeof MemberStatus)[keyof typeof MemberStatus];

export const CopyVisibility = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;

export type CopyVisibilityValue = (typeof CopyVisibility)[keyof typeof CopyVisibility];

export interface TripPlaceInput {
  name: string;
  lng?: number | null;
  lat?: number | null;
}

export interface CreateTripDto {
  title: string;
  origin: TripPlaceInput;
  destination: TripPlaceInput;
  waypoints?: TripPlaceInput[];
  departAt: string;
  estimatedDays?: number;
  dailyMileage?: number | null;
  companionDepth?: CompanionDepthValue;
  alongPlans?: AlongPlanValue[];
  maxVehicles: number;
  privacy?: TripPrivacyValue;
  allowCopy?: boolean;
  feeNote?: string;
  tags?: string[];
  announcement?: string;
}

export interface UpdateTripDto {
  title?: string;
  origin?: TripPlaceInput;
  destination?: TripPlaceInput;
  waypoints?: TripPlaceInput[];
  departAt?: string;
  estimatedDays?: number;
  dailyMileage?: number | null;
  companionDepth?: CompanionDepthValue;
  alongPlans?: AlongPlanValue[];
  maxVehicles?: number;
  privacy?: TripPrivacyValue;
  allowCopy?: boolean;
  feeNote?: string;
  tags?: string[];
  announcement?: string;
}

export interface ApplyJoinDto {
  message?: string;
}

export interface UpdateCopyDto {
  visibility?: CopyVisibilityValue;
  waypoints?: TripPlaceInput[];
}

export interface TripNode {
  id: number;
  seq: number;
  kind: TripNodeKindValue;
  name: string;
  lng: number | null;
  lat: number | null;
}

export interface TripMember {
  userId: number;
  nickname: string;
  avatarUrl: string | null;
  vehicleModel: string | null;
  plateNumber: string | null;
  role: MemberRoleValue;
  status: MemberStatusValue;
  applyMessage: string | null;
  joinedAt: string;
}

export interface TripSummary {
  id: number;
  title: string;
  originName: string;
  destName: string;
  departAt: string;
  vehicleCount: number;
  maxVehicles: number;
  coverUrl: string | null;
  captainNickname: string;
  privacy: TripPrivacyValue;
  status: TripStatusValue;
  distanceKm: number | null;
  tags: string[];
  myStatus: MemberStatusValue | null;
}

export interface TripDetail {
  id: number;
  captainId: number;
  captainNickname: string;
  title: string;
  originName: string;
  originLng: number | null;
  originLat: number | null;
  destName: string;
  destLng: number | null;
  destLat: number | null;
  departAt: string;
  estimatedDays: number;
  dailyMileage: number | null;
  companionDepth: CompanionDepthValue;
  alongPlans: AlongPlanValue[];
  maxVehicles: number;
  vehicleCount: number;
  privacy: TripPrivacyValue;
  allowCopy: boolean;
  coverUrl: string | null;
  feeNote: string | null;
  tags: string[];
  announcement: string | null;
  inviteCode: string;
  status: TripStatusValue;
  createdAt: string;
  nodes: TripNode[];
  members: TripMember[];
  applications: TripMember[];
  myMember: TripMember | null;
  isFull: boolean;
}

export interface TripCopy {
  tripId: number;
  userId: number;
  visibility: CopyVisibilityValue;
  nodes: TripNode[];
}
