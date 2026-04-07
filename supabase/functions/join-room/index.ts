import { getSupabaseAdmin, getSupabaseUser, corsHeaders, jsonResponse, errorResponse } from "../_shared/supabase-admin.ts";

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

    // Check room exists and is waiting
    const { data: room } = await admin
      .from("game_rooms")
      .select("id, club_id, status, rules")
      .eq("id", roomId)
      .single();
    if (!room) return errorResponse("Room not found", 404);
    if (room.status !== "waiting") return errorResponse("Room is not accepting players");

    const playerCount = (room.rules?.playerCount === 3 ? 3 : 4) as 3 | 4;

    // Verify membership
    const { data: membership } = await admin
      .from("club_memberships")
      .select("id")
      .eq("club_id", room.club_id)
      .eq("user_id", user.id)
      .single();
    if (!membership) return errorResponse("Not a member of this club", 403);

    // Check if already joined
    const { data: existing } = await admin
      .from("game_participants")
      .select("id, seat")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();
    if (existing) return jsonResponse({ seat: existing.seat, alreadyJoined: true });

    // Find next available seat
    const { data: participants } = await admin
      .from("game_participants")
      .select("seat")
      .eq("room_id", roomId)
      .order("seat");

    const takenSeats = new Set((participants ?? []).map((p: { seat: number }) => p.seat));
    let nextSeat = -1;
    for (let i = 0; i < playerCount; i++) {
      if (!takenSeats.has(i)) {
        nextSeat = i;
        break;
      }
    }
    if (nextSeat === -1) return errorResponse("Room is full");

    const { error: joinError } = await admin
      .from("game_participants")
      .insert({
        room_id: roomId,
        user_id: user.id,
        seat: nextSeat,
      });
    if (joinError) return errorResponse(joinError.message, 500);

    return jsonResponse({ seat: nextSeat });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
