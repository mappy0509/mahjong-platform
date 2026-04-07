import { getSupabaseAdmin, getSupabaseUser, corsHeaders, jsonResponse, errorResponse } from "../_shared/supabase-admin.ts";
import { GameMachine } from "../_shared/engine.js";

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

    // Use PostgreSQL advisory lock via raw SQL for concurrency control
    // Lock, read state, apply action, write back, unlock — all in one transaction
    const { data: session, error: sessionError } = await admin
      .from("game_sessions")
      .select("state, version")
      .eq("room_id", roomId)
      .single();
    if (sessionError || !session) return errorResponse("Game session not found", 404);

    // Restore game machine from saved state
    const machine = new GameMachine(session.state);

    // Process the action
    const events = machine.processAction({
      seat: participant.seat as 0 | 1 | 2 | 3,
      action,
      tileId,
      tiles,
    });

    if (events.length === 0) {
      return errorResponse("Invalid action");
    }

    const newState = machine.getState();
    const newVersion = session.version + 1;

    // Save updated state (optimistic concurrency via version check)
    const { error: updateError } = await admin
      .from("game_sessions")
      .update({
        state: JSON.parse(JSON.stringify(newState)),
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

    // Check for round result or game end
    const gamePhase = newState.gamePhase;
    let roundResult = null;
    let finalResult = null;

    // Check if we need to handle round end or game end
    const lastEvent = events[events.length - 1];
    if (lastEvent?.type === "TSUMO" || lastEvent?.type === "RON" || lastEvent?.type === "DRAW_ROUND") {
      roundResult = {
        reason: lastEvent.type === "DRAW_ROUND" ? lastEvent.reason : lastEvent.type.toLowerCase(),
        scoreChanges: lastEvent.scoreChanges,
        ...(lastEvent.type === "TSUMO" ? {
          winners: [{ seat: lastEvent.seat, yaku: lastEvent.yaku, han: lastEvent.han, fu: lastEvent.fu, score: lastEvent.score }],
        } : {}),
        ...(lastEvent.type === "RON" ? { winners: lastEvent.winners } : {}),
        ...(lastEvent.type === "DRAW_ROUND" ? { tenpaiPlayers: lastEvent.tenpaiPlayers } : {}),
      };
    }

    if (lastEvent?.type === "GAME_END") {
      // Build final result with rankings
      const scores = newState.scores;
      const rankings = (participants ?? []).map((p: any, idx: number) => ({
        seat: p.seat,
        userId: p.user_id,
        name: playerNames[idx],
        finalScore: scores[p.seat],
        umaScore: 0,
        totalPoints: 0,
      }));
      rankings.sort((a: any, b: any) => b.finalScore - a.finalScore);
      finalResult = { rankings };
    }

    // Update all 4 player views
    for (const p of (participants ?? [])) {
      const view = machine.getPlayerView(p.seat as 0 | 1 | 2 | 3, playerNames);

      await admin
        .from("player_views")
        .update({
          view: JSON.parse(JSON.stringify(view)),
          round_result: roundResult ? JSON.parse(JSON.stringify(roundResult)) : null,
          final_result: finalResult ? JSON.parse(JSON.stringify(finalResult)) : null,
          version: newVersion,
        })
        .eq("room_id", roomId)
        .eq("seat_index", p.seat);
    }

    // Log events
    const eventLog = machine.getEventLog();
    const newEvents = eventLog.slice(eventLog.length - events.length);
    for (let i = 0; i < newEvents.length; i++) {
      await admin.from("game_event_logs").insert({
        room_id: roomId,
        sequence: session.version + i,
        event_type: newEvents[i].type,
        payload: JSON.parse(JSON.stringify(newEvents[i])),
      });
    }

    // If game ended, update room status
    if (lastEvent?.type === "GAME_END") {
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
