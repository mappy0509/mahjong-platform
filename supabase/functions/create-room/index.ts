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

    const { clubId, name, rules, playerCount } = await req.json();
    if (!clubId || !name) return errorResponse("clubId and name are required");

    // Verify membership
    const admin = getSupabaseAdmin();
    const { data: membership } = await admin
      .from("club_memberships")
      .select("id")
      .eq("club_id", clubId)
      .eq("user_id", user.id)
      .single();
    if (!membership) return errorResponse("Not a member of this club", 403);

    // Default rules — sanma vs 4p
    const isSanma = playerCount === 3 || rules?.playerCount === 3;
    const defaultRules = isSanma
      ? {
          playerCount: 3,
          roundType: "south",
          startPoints: 35000,
          returnPoints: 40000,
          uma: [20, 0, -20],
          hasRedDora: true,
          hasOpenTanyao: true,
          hasNukidora: true,
          ...rules,
        }
      : {
          playerCount: 4,
          roundType: "south",
          startPoints: 25000,
          returnPoints: 30000,
          uma: [30, 10, -10, -30],
          hasRedDora: true,
          hasOpenTanyao: true,
          ...rules,
        };
    // Ensure playerCount in stored rules is authoritative
    defaultRules.playerCount = isSanma ? 3 : 4;

    // Create room
    const { data: room, error: roomError } = await admin
      .from("game_rooms")
      .insert({
        club_id: clubId,
        name,
        rules: defaultRules,
        created_by: user.id,
        status: "waiting",
      })
      .select()
      .single();
    if (roomError) return errorResponse(roomError.message, 500);

    // Auto-join creator as seat 0
    await admin.from("game_participants").insert({
      room_id: room.id,
      user_id: user.id,
      seat: 0,
    });

    return jsonResponse({ room });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Internal error", 500);
  }
});
