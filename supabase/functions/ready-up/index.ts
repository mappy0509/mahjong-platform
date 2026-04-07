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

    const { roomId } = await req.json();
    if (!roomId) return errorResponse("roomId is required");

    const admin = getSupabaseAdmin();

    // Mark this player as ready
    const { error: readyError } = await admin
      .from("game_participants")
      .update({ is_ready: true })
      .eq("room_id", roomId)
      .eq("user_id", user.id);
    if (readyError) return errorResponse(readyError.message, 500);

    // Check if all 4 players are ready
    const { data: participants } = await admin
      .from("game_participants")
      .select("user_id, seat, is_ready")
      .eq("room_id", roomId)
      .order("seat");

    if (!participants || participants.length < 4) {
      return jsonResponse({ ready: true, allReady: false, playersReady: participants?.filter((p: any) => p.is_ready).length ?? 0 });
    }

    const allReady = participants.every((p: any) => p.is_ready);
    if (!allReady) {
      return jsonResponse({ ready: true, allReady: false, playersReady: participants.filter((p: any) => p.is_ready).length });
    }

    // All ready — start the game!
    // Get room rules
    const { data: room } = await admin
      .from("game_rooms")
      .select("rules")
      .eq("id", roomId)
      .single();

    // Get player display names
    const userIds = participants.map((p: any) => p.user_id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    const nameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));

    // Create game machine and start game
    const machine = new GameMachine();
    const seed = Date.now();
    machine.startGame(seed, room?.rules ?? {});

    const state = machine.getState();

    // Save game session
    await admin.from("game_sessions").insert({
      room_id: roomId,
      state: JSON.parse(JSON.stringify(state)),
      version: 1,
    });

    // Create player views for each seat
    for (const p of participants) {
      const playerView = machine.getPlayerView(
        p.seat as 0 | 1 | 2 | 3,
        (profiles ?? []).map((pr: any) => ({
          name: pr.display_name,
          isConnected: true,
        })),
      );

      // Map player names correctly by seat
      const viewWithNames = {
        ...playerView,
        players: playerView.players.map((pv: any, idx: number) => ({
          ...pv,
          name: nameMap.get(participants[idx]?.user_id) ?? `Player ${idx + 1}`,
        })),
      };

      await admin.from("player_views").insert({
        room_id: roomId,
        seat_index: p.seat,
        user_id: p.user_id,
        view: JSON.parse(JSON.stringify(viewWithNames)),
        version: 1,
      });
    }

    // Update room status to playing
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
