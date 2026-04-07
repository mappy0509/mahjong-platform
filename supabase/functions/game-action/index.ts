import { getSupabaseAdmin, getSupabaseUser, corsHeaders, jsonResponse, errorResponse } from "../_shared/supabase-admin.ts";
import { GameMachine, SanmaGameMachine } from "../_shared/engine.js";

// Special action handled outside the engine: advance from ROUND_RESULT to next round
const NEXT_ROUND = "NEXT_ROUND";

function isSanmaState(state: any): boolean {
  return Array.isArray(state?.scores) && state.scores.length === 3;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const supabaseUser = getSupabaseUser(authHeader);
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return errorResponse("Unauthorized", 401);

    const { roomId, action, tileId, tiles } = await req.json();
    if (!roomId || action === undefined) return errorResponse("roomId and action are required");

    const admin = getSupabaseAdmin();

    // Find player's seat
    const { data: participant } = await admin
      .from("game_participants")
      .select("seat")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();
    if (!participant) return errorResponse("Not a participant in this game", 403);

    // Read current session state
    const { data: session, error: sessionError } = await admin
      .from("game_sessions")
      .select("state, version")
      .eq("room_id", roomId)
      .single();
    if (sessionError || !session) return errorResponse("Game session not found", 404);

    // Strip our sidecar metadata before passing to engine
    const rawState = (session.state ?? {}) as Record<string, unknown>;
    const { _pendingAdvance, ...gameState } = rawState as { _pendingAdvance?: { dealerWon: boolean; isDraw: boolean } };

    const sanma = isSanmaState(gameState);
    const playerCount = sanma ? 3 : 4;
    const machine: any = sanma ? new SanmaGameMachine(gameState) : new GameMachine(gameState);

    let events: any[] = [];

    // ===== NEXT_ROUND special handling =====
    if (action === NEXT_ROUND) {
      const meta = _pendingAdvance;
      if (!meta) {
        // Nothing to advance — return current state
        return jsonResponse({ success: true, events: [], skipped: true });
      }
      // Sanma's advanceToNextRound only takes dealerWon (no isDraw param)
      events = sanma
        ? machine.advanceToNextRound(meta.dealerWon)
        : machine.advanceToNextRound(meta.dealerWon, meta.isDraw);
      if (events.length === 0) {
        return errorResponse("Cannot advance round in current state", 400);
      }
    } else {
      // ===== Normal action processing =====
      events = machine.processAction({
        seat: participant.seat as 0 | 1 | 2 | 3,
        action,
        tileId,
        tiles,
      });
      if (events.length === 0) {
        return errorResponse("Invalid action");
      }
    }

    const newState = machine.getState();
    const newVersion = session.version + 1;

    // Detect round result and store dealerWon/isDraw for next NEXT_ROUND
    let nextPendingAdvance: { dealerWon: boolean; isDraw: boolean } | null = null;
    let roundResult: any = null;
    let finalResult: any = null;

    const lastEvent: any = events[events.length - 1];

    if (lastEvent?.type === "TSUMO") {
      const winnerSeat = lastEvent.seat;
      const dealerWon = winnerSeat === newState.dealerSeat;
      nextPendingAdvance = { dealerWon, isDraw: false };
      roundResult = {
        type: "TSUMO",
        seat: lastEvent.seat,
        yaku: lastEvent.yaku,
        han: lastEvent.han,
        fu: lastEvent.fu,
        score: lastEvent.score,
        scoreChanges: lastEvent.scoreChanges,
        winners: [{ seat: lastEvent.seat, isTsumo: true, yaku: lastEvent.yaku, han: lastEvent.han, fu: lastEvent.fu, score: lastEvent.score }],
      };
    } else if (lastEvent?.type === "RON") {
      const winners = lastEvent.winners ?? [];
      const dealerWon = winners.some((w: any) => w.seat === newState.dealerSeat);
      nextPendingAdvance = { dealerWon, isDraw: false };
      roundResult = {
        type: "RON",
        winners: winners.map((w: any) => ({ ...w, isTsumo: false })),
        loserSeat: lastEvent.loserSeat,
        scoreChanges: lastEvent.scoreChanges,
      };
    } else if (lastEvent?.type === "DRAW_ROUND") {
      const dealerInTenpai = (lastEvent.tenpaiPlayers ?? []).includes(newState.dealerSeat);
      nextPendingAdvance = { dealerWon: dealerInTenpai, isDraw: true };
      roundResult = {
        type: "DRAW_ROUND",
        reason: lastEvent.reason,
        tenpaiPlayers: lastEvent.tenpaiPlayers,
        scoreChanges: lastEvent.scoreChanges,
      };
    } else if (lastEvent?.type === "GAME_END") {
      // Build final result with rankings (after NEXT_ROUND advanced into game end)
      const scores = newState.scores;
      const { data: gameEndParticipants } = await admin
        .from("game_participants")
        .select("user_id, seat")
        .eq("room_id", roomId)
        .order("seat");
      const userIdsForGameEnd = (gameEndParticipants ?? []).map((p: any) => p.user_id);
      const { data: gameEndProfiles } = await admin
        .from("profiles")
        .select("id, display_name")
        .in("id", userIdsForGameEnd);
      const gameEndNameMap = new Map((gameEndProfiles ?? []).map((p: any) => [p.id, p.display_name]));
      const rankings = (gameEndParticipants ?? []).map((p: any) => ({
        seat: p.seat,
        userId: p.user_id,
        name: gameEndNameMap.get(p.user_id) ?? `Player ${p.seat + 1}`,
        finalScore: scores[p.seat],
        umaScore: 0,
        totalPoints: 0,
      }));
      // Apply uma based on rules
      const defaultUma = sanma ? [20, 0, -20] : [30, 10, -10, -30];
      const startPoints = sanma ? 35000 : 25000;
      const uma = newState.rules?.uma ?? defaultUma;
      const sorted = [...rankings].sort((a: any, b: any) => b.finalScore - a.finalScore);
      sorted.forEach((r: any, i: number) => {
        r.umaScore = uma[i] ?? 0;
        r.totalPoints = Math.round((r.finalScore - startPoints) / 1000) + r.umaScore;
      });
      finalResult = { rankings: sorted };
    }

    // Build the state JSON to save (with sidecar metadata if needed)
    const stateToSave: any = JSON.parse(JSON.stringify(newState));
    if (nextPendingAdvance) {
      stateToSave._pendingAdvance = nextPendingAdvance;
    }
    // Note: when action === NEXT_ROUND, we don't add _pendingAdvance, so it gets cleared.

    // Save updated state (optimistic concurrency via version check)
    const { error: updateError } = await admin
      .from("game_sessions")
      .update({
        state: stateToSave,
        version: newVersion,
      })
      .eq("room_id", roomId)
      .eq("version", session.version);

    if (updateError) return errorResponse("Concurrent update conflict, retry", 409);

    // Get player names for views
    const { data: participants } = await admin
      .from("game_participants")
      .select("user_id, seat")
      .eq("room_id", roomId)
      .order("seat");

    const userIds = (participants ?? []).map((p: any) => p.user_id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
    const playerNames = (participants ?? []).map((p: any) => nameMap.get(p.user_id) ?? `Player ${p.seat + 1}`);

    // Update all 4 player views
    for (const p of (participants ?? [])) {
      const view = machine.getPlayerView(p.seat as 0 | 1 | 2 | 3, playerNames);

      const updateFields: any = {
        view: JSON.parse(JSON.stringify(view)),
        version: newVersion,
      };
      // On NEXT_ROUND, clear the previous round result and final result
      if (action === NEXT_ROUND) {
        updateFields.round_result = null;
        updateFields.final_result = finalResult ? JSON.parse(JSON.stringify(finalResult)) : null;
      } else {
        if (roundResult) updateFields.round_result = JSON.parse(JSON.stringify(roundResult));
        if (finalResult) updateFields.final_result = JSON.parse(JSON.stringify(finalResult));
      }

      await admin
        .from("player_views")
        .update(updateFields)
        .eq("room_id", roomId)
        .eq("seat_index", p.seat);
    }

    // Log events using state.eventSequence for unique sequence numbers
    const baseSeq = newState.eventSequence - events.length;
    for (let i = 0; i < events.length; i++) {
      try {
        await admin.from("game_event_logs").insert({
          room_id: roomId,
          sequence: baseSeq + i + 1,
          event_type: events[i].type,
          payload: JSON.parse(JSON.stringify(events[i])),
        });
      } catch {
        // Best-effort logging — ignore conflicts
      }
    }

    // If game ended, update room status
    if (finalResult) {
      await admin
        .from("game_rooms")
        .update({ status: "finished" })
        .eq("id", roomId);
    }

    return jsonResponse({ success: true, events: events.map((e: any) => e.type) });
  } catch (err) {
    console.error("game-action error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
