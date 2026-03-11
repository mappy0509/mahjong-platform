// WebSocket event names
export const WS_EVENTS = {
  // Client -> Server
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_READY: "room:ready",
  GAME_ACTION: "game:action",
  STAMP_SEND: "stamp:send",

  // Server -> Client
  ROOM_UPDATED: "room:updated",
  GAME_STARTED: "game:started",
  GAME_SEAT_DRAW: "game:seat_draw",
  GAME_DICE_ROLL: "game:dice_roll",
  GAME_DEALING: "game:dealing",
  GAME_STATE: "game:state",
  GAME_ACTION_RESULT: "game:action_result",
  GAME_ROUND_RESULT: "game:round_result",
  GAME_FINAL_RESULT: "game:final_result",
  GAME_ERROR: "game:error",
  PLAYER_DISCONNECTED: "player:disconnected",
  PLAYER_RECONNECTED: "player:reconnected",
  TURN_TIMER: "game:turn_timer",
  STAMP_RECEIVED: "stamp:received",
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
