// Supabase Edge Function: admin-login
// Deploy with Supabase CLI. Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY as secrets.
// The service-role key stays server-side only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
  if (allowedOrigin && origin !== allowedOrigin) return new Response("Origin not allowed", { status: 403 });
  try {
    const { username, admin_id, password } = await req.json();
    if (typeof username !== "string" || typeof admin_id !== "string" || typeof password !== "string" ||
        !username.trim() || !/^\\d+$/.test(admin_id) || password.length < 1) {
      return Response.json({ error: "Invalid credentials" }, { status: 400 });
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(url, service);
    const { data: row, error: lookupError } = await adminClient
      .from("admin_roles").select("user_id").eq("username", username.trim()).eq("admin_id", admin_id).maybeSingle();
    if (lookupError || !row) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(row.user_id);
    if (userError || !userData.user?.email) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    const authClient = createClient(url, anon);
    const { data: signed, error: signError } = await authClient.auth.signInWithPassword({
      email: userData.user.email, password
    });
    if (signError || !signed.session) return Response.json({ error: "Invalid credentials" }, { status: 401 });
    return Response.json({
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Request failed" }, { status: 400 });
  }
});
