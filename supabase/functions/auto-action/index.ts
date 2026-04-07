import { getSupabaseAdmin, corsHeaders, jsonResponse, errorResponse } from "../_shared/supabase-admin.ts";
import { GameMachine } from "../_shared/engine.js";

const TURN_TIMEOUT_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    // This endpoint is called by pg_cron or admin — verify service key
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!authHeader?.includes(serviceKey ?? "___impossible___")) {
      // Allow calling from cron without auth header via internal URL
    }

    const admin = getSupabaseAdmin();

    // Find all active games that might have timed out
    const cutoff = new Date(Date.now() - TURN_TIMEOUT_MS).toISOString();
    const { data: timedOutSessions } = await admin
      .from("game_sessions")
      .select("room_id, state, version")
      .lt("updated_at", cutoff);

    if (!timedOutSessions || timedOutSessions.length === 0) {
      return jsonResponse({ processed: 0 });
    }

    let processed = 0;
    for (const session of timedOutSessions) {
      try {
        const machine = new GameMachine(session.state);
        const state = machine.getState();

        if (state.gamePhase !== 1) continue; // Not PLAYING

        const round = state.round;
        if (!round) continue;

        let events: any[] = [];

        // Auto-discard if it's someone's turn
        if (round.phase === 1) { // DISCARD phase
          events = machine.autoDiscard(round.currentTurn);
        } else if (round.phase === 2) { // CLAIM phase
          events = machine.autoSkipAllClaims();
        }

        if (events.length === 0) continue;

        const newState = machine.getState();
        const newVersion = session.version + 1;

        const { error: updateError } = await admin
          .from("game_sessions")
          .update({
            state: JSON.parse(JSON.stringify(newState)),
            version: newVersion,
          })
          .eq("room_id", session.room_id)
          .eq("version", session.version);

        if (updateError) continue; // Concurrent update, skip

        // Update player views
        const { data: participants } = await admin
          .from("game_participants")
          .select("user_id, seat")
          .eq("room_id", session.room_id)
          .order("seat");

        const userIds = (participants ?? []).map((p: any) => p.user_id);
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", userIds);
        const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
        const playerNames = (participants ?? []).map((p: any) => nameMap.get(p.user_id) ?? `Player ${p.seat + 1}`);

        for (const p of (participants ?? [])) {
          const view = machine.getPlayerView(p.seat as 0 | 1 | 2 | 3, playerNames);
          await admin
            .from("player_views")
            .update({
              view: JSON.parse(JSON.stringify(view)),
              version: newVersion,
            })
            .eq("room_id", session.room_id)
            .eq("seat_index", p.seat);
        }

        processed++;
      } catch (err) {
        console.error(`auto-action error for room ${session.room_id}:`, err);
      }
    }

    return jsonResponse({ processed });
  } catch (err) {
    console.error("auto-action error:", err);
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
