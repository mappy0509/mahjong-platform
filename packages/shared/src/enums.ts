// ===== User & Club Enums =====

export enum UserRole {
  PLATFORMER = "PLATFORMER",
  CLUB_OWNER = "CLUB_OWNER",
  AGENT = "AGENT",
  PLAYER = "PLAYER",
}

export enum ClubMemberRole {
  OWNER = "OWNER",
  AGENT = "AGENT",
  MEMBER = "MEMBER",
}

// ===== Tile Enums =====

export enum TileSuit {
  MAN = "man", // 萬子
  PIN = "pin", // 筒子
  SOU = "sou", // 索子
  WIND = "wind", // 風牌
  DRAGON = "dragon", // 三元牌
}

export enum Wind {
  EAST = 0,
  SOUTH = 1,
  WEST = 2,
  NORTH = 3,
}

// ===== Game Enums =====

export enum GamePhase {
  WAITING = "WAITING",
  SEAT_DRAW = "SEAT_DRAW",
  DICE_ROLL = "DICE_ROLL",
  DEALING = "DEALING",
  PLAYING = "PLAYING",
  ROUND_RESULT = "ROUND_RESULT",
  GAME_RESULT = "GAME_RESULT",
  FINISHED = "FINISHED",
}

export enum RoundPhase {
  DRAW = "DRAW",
  DISCARD = "DISCARD",
  CLAIM = "CLAIM",
  KAN = "KAN",
  ROUND_END = "ROUND_END",
}

export enum ActionType {
  DISCARD = "DISCARD",
  CHI = "CHI",
  PON = "PON",
  KAN_OPEN = "KAN_OPEN",
  KAN_CLOSED = "KAN_CLOSED",
  KAN_ADDED = "KAN_ADDED",
  RIICHI = "RIICHI",
  TSUMO = "TSUMO",
  RON = "RON",
  SKIP = "SKIP",
  DRAW_TILE = "DRAW_TILE",
}

export enum MeldType {
  CHI = "CHI",
  PON = "PON",
  KAN_OPEN = "KAN_OPEN",
  KAN_CLOSED = "KAN_CLOSED",
  KAN_ADDED = "KAN_ADDED",
}

export enum RoundEndReason {
  TSUMO = "TSUMO",
  RON = "RON",
  EXHAUSTIVE_DRAW = "EXHAUSTIVE_DRAW", // 荒牌流局
  FOUR_WINDS = "FOUR_WINDS", // 四風連打
  FOUR_RIICHI = "FOUR_RIICHI", // 四家立直
  FOUR_KANS = "FOUR_KANS", // 四槓散了
  NINE_TERMINALS = "NINE_TERMINALS", // 九種九牌
  TRIPLE_RON = "TRIPLE_RON", // 三家和
}

// ===== Point Enums =====

export enum PointTransactionType {
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  GAME_RESULT = "GAME_RESULT",
  GAME_FEE = "GAME_FEE",
  ADJUSTMENT = "ADJUSTMENT",
}

export enum DiamondTransactionType {
  PURCHASE = "PURCHASE",
  REFUND = "REFUND",
  CLUB_FEE = "CLUB_FEE",
  ADJUSTMENT = "ADJUSTMENT",
}

// ===== Room Enums =====

export enum RoomStatus {
  WAITING = "WAITING",
  PLAYING = "PLAYING",
  FINISHED = "FINISHED",
}

// ===== Invitation Enums =====

export enum InvitationStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}
