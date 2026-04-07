import {
  Wind,
  MeldType,
  ActionType,
  RoundEndReason,
  PointTransactionType,
  RoomStatus,
  GamePhase,
  RoundPhase,
  ClubMemberRole,
  InvitationStatus,
} from "./enums";

// ===== Tile Types =====

/** TileKind: 0-33 representing 34 unique tile kinds */
export type TileKind = number;

/** TileId: 0-135 representing 136 individual tiles */
export type TileId = number;

/** Seat index: 0=East, 1=South, 2=West, 3=North */
export type SeatIndex = 0 | 1 | 2 | 3;

// ===== Meld =====

export interface Meld {
  type: MeldType;
  tiles: TileId[];
  fromPlayer?: SeatIndex;
  calledTile?: TileId;
}

// ===== Game Rule Settings =====

export interface GameRuleConfig {
  playerCount: 3 | 4;
  roundType: "east" | "south"; // 東風 or 半荘
  startPoints: number; // default 25000 (4p), 35000 (3p)
  returnPoints: number; // default 30000 (オカ計算用)
  /** 4要素 (4麻) または 3要素 (3麻). e.g. [+30, +10, -10, -30] / [+20, 0, -20] */
  uma: number[];
  hasRedDora: boolean; // 赤ドラ有無
  hasOpenTanyao: boolean; // 喰いタンあり
  /** 3麻のみ: 北抜きドラ */
  hasNukidora?: boolean;
}

// ===== WebSocket Event Payloads =====

export interface RoomJoinPayload {
  roomId: string;
  location?: { lat: number; lng: number };
}

export interface RoomReadyPayload {
  roomId: string;
}

export interface GameActionPayload {
  roomId: string;
  action: ActionType;
  tileId?: TileId;
  tiles?: TileId[]; // for chi/kan
  targetTile?: TileId;
}

// ===== Player Game View (filtered per player) =====

export interface PlayerGameView {
  gamePhase: GamePhase;
  roundPhase: RoundPhase;
  roundWind: Wind;
  roundNumber: number;
  honba: number;
  riichiSticks: number;
  tilesRemaining: number;
  doraIndicators: TileId[];
  myHand: TileId[];
  mySeat: SeatIndex;
  myScore: number;
  players: PlayerView[];
  currentTurn: SeatIndex;
  lastDiscard?: { seat: SeatIndex; tileId: TileId };
  availableActions: ActionType[];
  turnTimeRemaining?: number;
  /** Dice roll result for the current round [die1, die2] */
  diceResult?: [number, number];
  /** Seat assignment mapping (index=seat, value=wind) used during SEAT_DRAW */
  seatWinds?: Wind[];
  /** Wall break position (tile index) based on dice */
  wallBreakPosition?: number;
  /** Dealer seat index */
  dealerSeat?: SeatIndex;
}

export interface PlayerView {
  seat: SeatIndex;
  name: string;
  score: number;
  discards: TileId[];
  melds: Meld[];
  isRiichi: boolean;
  isConnected: boolean;
  handCount: number; // number of hidden tiles (not revealed)
}

// ===== Round Result =====

export interface RoundResult {
  reason: RoundEndReason;
  winners?: WinnerInfo[];
  scoreChanges: Record<SeatIndex, number>;
  tenpaiPlayers?: SeatIndex[];
}

export interface WinnerInfo {
  seat: SeatIndex;
  hand: TileId[];
  melds: Meld[];
  winTile: TileId;
  isTsumo: boolean;
  yaku: YakuResult[];
  han: number;
  fu: number;
  score: number;
}

export interface YakuResult {
  name: string;
  han: number;
  isYakuman?: boolean;
}

// ===== Game Final Result =====

export interface GameFinalResult {
  rankings: {
    seat: SeatIndex;
    userId: string;
    name: string;
    finalScore: number;
    umaScore: number;
    totalPoints: number;
  }[];
}

// ===== Room =====

export interface RoomInfo {
  id: string;
  clubId: string;
  name: string;
  status: RoomStatus;
  rules: GameRuleConfig;
  players: {
    userId: string;
    name: string;
    seat: SeatIndex | null;
    isReady: boolean;
  }[];
  createdAt: string;
}

// ===== Auth DTOs =====

export interface RegisterDto {
  username: string;
  password: string;
  displayName: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    displayName: string;
  };
}

// ===== Club DTOs =====

export interface CreateClubDto {
  name: string;
  description?: string;
}

export interface JoinClubDto {
  inviteCode: string;
}

// ===== Club Settings =====

export interface ClubSettings {
  isApprovalRequired: boolean;
  defaultRules: Partial<GameRuleConfig> | null;
  feePercent: number;
  gpsRestrictionKm: number; // 0 = disabled
}

export interface ClubInfo {
  id: string;
  name: string;
  description?: string;
  inviteCode: string;
  ownerId: string;
  isApprovalRequired: boolean;
  feePercent: number;
  memberCount: number;
}

export interface ClubMemberInfo {
  userId: string;
  username: string;
  displayName: string;
  role: ClubMemberRole;
  alias: string | null;
}

// ===== Invitation =====

export interface ClubInvitationInfo {
  id: string;
  clubId: string;
  clubName?: string;
  inviterId: string;
  inviteeId: string | null;
  targetRole: ClubMemberRole;
  status: InvitationStatus;
  message?: string;
  createdAt: string;
  expiresAt?: string;
}

// ===== Stamp =====

export interface StampSendPayload {
  roomId: string;
  stampId: StampId;
}

export interface StampReceivedPayload {
  seat: SeatIndex;
  stampId: StampId;
  playerName: string;
}

export type StampId =
  | "good"
  | "think"
  | "fast"
  | "sorry"
  | "nice"
  | "cry"
  | "angry"
  | "laugh"
  | "wow"
  | "gg";

export const STAMP_LIST: { id: StampId; emoji: string; label: string }[] = [
  { id: "good", emoji: "\ud83d\udc4d", label: "\u3044\u3044\u306d" },
  { id: "think", emoji: "\ud83e\udd14", label: "\u3046\u30fc\u3093" },
  { id: "fast", emoji: "\u23f0", label: "\u65e9\u304f\u3057\u3066" },
  { id: "sorry", emoji: "\ud83d\ude47", label: "\u3054\u3081\u3093" },
  { id: "nice", emoji: "\ud83c\udf89", label: "\u30ca\u30a4\u30b9" },
  { id: "cry", emoji: "\ud83d\ude2d", label: "\u6ce3" },
  { id: "angry", emoji: "\ud83d\ude24", label: "\u6012" },
  { id: "laugh", emoji: "\ud83d\ude02", label: "\u7b11" },
  { id: "wow", emoji: "\ud83d\ude32", label: "\u9a5a" },
  { id: "gg", emoji: "\ud83e\udd1d", label: "GG" },
];

// ===== Point =====

export interface PointBalance {
  userId: string;
  clubId: string;
  balance: number;
}

export interface PointTransactionRecord {
  id: string;
  userId: string;
  clubId: string;
  type: PointTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string;
  createdAt: string;
}
