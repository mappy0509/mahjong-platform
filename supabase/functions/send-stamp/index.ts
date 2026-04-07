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

    const { roomId, stampId } = await req.json();
    if (!roomId || !stampId) return errorResponse("roomId and stampId are required");

    const admin = getSupabaseAdmin();

    // Find player's seat and name
    const { data: participant } = await admin
      .from("game_participants")
      .select("seat")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();
    if (!participant) return errorResponse("Not a participant", 403);

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    // Broadcast stamp via Supabase Realtime channel
    const channel = admin.channel(`room:${roomId}`);
    await channel.send({
      type: "broadcast",
      event: "stamp",
      payload: {
        seat: participant.seat,
        stampId,
        playerName: profile?.display_name ?? "Unknown",
      },
    });

    return jsonResponse({ success: true });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
