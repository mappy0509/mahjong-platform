import type { GameSummary } from './game.ts';
import type { Rules } from './rules.ts';
import type { Action, Options, RoundEvent, RoundResult } from './round.ts';
import type { RoundView } from './view.ts';

/** 対局サーバーとクライアントの間のメッセージ（WebSocket・JSON）。 */

export interface SeatInfo {
  seat: number;
  userId: string | null;
  name: string;
  bot: boolean;
  connected: boolean;
  ready: boolean;
}

export interface TableInfo {
  id: string;
  rules: Rules;
  state: 'waiting' | 'playing' | 'finished';
  seats: SeatInfo[];
}

export interface GameInfo {
  roundWind: number;
  kyoku: number;
  honba: number;
  kyotaku: number;
  dealer: number;
  scores: number[];
  /** 東風 / 半荘の何局目か（表示用） */
  handsPlayed: number;
}

export interface Prompt {
  seq: number;
  options: Options;
  /** 締め切り（サーバー時計の ms） */
  deadline: number;
  /** 基本時間（ms）。これを超えた分が追加時間から引かれる */
  base: number;
  /** 残りの追加時間（ms） */
  bank: number;
}

export type ClientMsg =
  | { type: 'hello'; tableId: string; token?: string; name?: string }
  | { type: 'ready' }
  | { type: 'action'; seq: number; action: Action }
  | { type: 'next' }
  | { type: 'stamp'; id: string }
  | { type: 'ping'; t: number };

export type ServerMsg =
  | { type: 'welcome'; userId: string; seat: number; table: TableInfo; now: number }
  | { type: 'table'; table: TableInfo }
  | { type: 'sync'; view: RoundView; game: GameInfo; prompt: Prompt | null; now: number }
  | { type: 'events'; events: RoundEvent[]; view: RoundView; game: GameInfo; prompt: Prompt | null; now: number }
  | { type: 'roundEnd'; result: RoundResult; game: GameInfo; final: GameSummary | null; nextAt: number; now: number }
  | { type: 'stamp'; seat: number; id: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; t: number; now: number };
