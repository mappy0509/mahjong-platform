import { getSupabaseAdmin, getSupabaseUser, corsHeaders, jsonResponse, errorResponse } from "../_shared/supabase-admin.ts";
import { GameMachine, SanmaGameMachine } from "../_shared/engine.js";

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

    const { roomId } = await req.json();
    if (!roomId) return errorResponse("roomId is required");

    const admin = getSupabaseAdmin();

    // Look up room rules to determine player count
    const { data: roomRow } = await admin
      .from("game_rooms")
      .select("rules")
      .eq("id", roomId)
      .single();
    const requiredPlayers = (roomRow?.rules?.playerCount === 3 ? 3 : 4) as 3 | 4;
    const isSanma = requiredPlayers === 3;

    // Mark this player as ready
    const { error: readyError } = await admin
      .from("game_participants")
      .update({ is_ready: true })
      .eq("room_id", roomId)
      .eq("user_id", user.id);
    if (readyError) return errorResponse(readyError.message, 500);

    // Check if all required players are ready
    const { data: participants } = await admin
      .from("game_participants")
      .select("user_id, seat, is_ready")
      .eq("room_id", roomId)
      .order("seat");

    if (!participants || participants.length < requiredPlayers) {
      return jsonResponse({ ready: true, allReady: false, playersReady: participants?.filter((p: any) => p.is_ready).length ?? 0 });
    }

    const allReady = participants.every((p: any) => p.is_ready);
    if (!allReady) {
      return jsonResponse({ ready: true, allReady: false, playersReady: participants.filter((p: any) => p.is_ready).length });
    }

    // Guard: don't double-start if a session already exists
    const { data: existingSession } = await admin
      .from("game_sessions")
      .select("room_id")
      .eq("room_id", roomId)
      .maybeSingle();
    if (existingSession) {
      return jsonResponse({ ready: true, allReady: true, gameStarted: true, alreadyStarted: true });
    }

    // All ready — start the game!
    // Get player display names
    const userIds = participants.map((p: any) => p.user_id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    // Build playerNames array indexed by seat
    const playerNames: string[] = participants.map(
      (p: any) => nameMap.get(p.user_id) ?? `Player ${p.seat + 1}`,
    );

    // Create game machine and start game (sanma vs 4p)
    const machine: any = isSanma ? new SanmaGameMachine() : new GameMachine();
    const seed = Date.now();
    machine.startGame(seed, roomRow?.rules ?? {});

    const state = machine.getState();

    // Save game session FIRST so concurrent ready-up calls hit the guard
    const { error: sessionInsertError } = await admin.from("game_sessions").insert({
      room_id: roomId,
      state: JSON.parse(JSON.stringify(state)),
      version: 1,
    });
    if (sessionInsertError) {
      // Most likely concurrent insert — treat as already started
      return jsonResponse({ ready: true, allReady: true, gameStarted: true, alreadyStarted: true });
    }

    // Create player views for each seat (upsert to be safe on retries)
    for (const p of participants) {
      const playerView = machine.getPlayerView(p.seat as 0 | 1 | 2 | 3, playerNames);

      await admin.from("player_views").upsert({
        room_id: roomId,
        seat_index: p.seat,
        user_id: p.user_id,
        view: JSON.parse(JSON.stringify(playerView)),
        round_result: null,
        final_result: null,
        version: 1,
      });
    }

    // Log GAME_START / ROUND_START / DRAW_TILE events for replay
    const startEvents = machine.getEventLog();
    for (let i = 0; i < startEvents.length; i++) {
      try {
        await admin.from("game_event_logs").insert({
          room_id: roomId,
          sequence: i + 1,
          event_type: startEvents[i].type,
          payload: JSON.parse(JSON.stringify(startEvents[i])),
        });
      } catch {
        // best-effort
      }
    }

    // Update room status to playing — this is what the lobby subscribes to
    await admin
      .from("game_rooms")
      .update({ status: "playing" })
      .eq("id", roomId);

    return jsonResponse({ ready: true, allReady: true, gameStarted: true });
  } catch (err) {
    console.error("ready-up error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
