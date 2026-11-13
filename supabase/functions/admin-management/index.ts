import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store"
};

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) {
    return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
  }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return reply({ error: "Server configuration error" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return reply({ error: "Unauthorized" }, 401);

    const authClient = createClient(url, anonKey);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Unauthorized" }, 401);

    const adminClient = createClient(url, serviceKey);
    const { data: actor, error: actorError } = await adminClient
      .from("admin_roles")
      .select("role,is_active")
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (actorError || !actor || actor.role !== "owner" || actor.is_active !== true) {
      return reply({ error: "ليس لديك صلاحية إدارة المشرفين" }, 403);
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await adminClient
        .from("admin_roles")
        .select("user_id,username,admin_code,role,is_active,created_at")
        .order("created_at", { ascending: false });
      if (error) return reply({ error: "تعذر تحميل قائمة المشرفين" }, 500);
      return reply({ admins: data ?? [] });
    }

    if (action === "create") {
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const adminCode = typeof body.admin_code === "string" ? body.admin_code.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";

      if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
        return reply({ error: "اسم المستخدم يجب أن يكون من 3 إلى 24 حرفاً إنجليزياً أو رقماً" }, 400);
      }
      if (!/^\d{5,20}$/.test(adminCode)) return reply({ error: "الكود التعريفي يجب أن يكون من 5 إلى 20 رقماً" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "البريد الإلكتروني غير صحيح" }, 400);
      if (password.length < 10) return reply({ error: "كلمة المرور يجب ألا تقل عن 10 أحرف" }, 400);

      const { data: duplicate, error: duplicateError } = await adminClient
        .from("admin_roles")
        .select("user_id")
        .or(`username.eq.${username},admin_code.eq.${adminCode}`)
        .limit(1);
      if (duplicateError) return reply({ error: "تعذر التحقق من بيانات المشرف" }, 500);
      if (duplicate?.length) return reply({ error: "اسم المستخدم أو الكود التعريفي مستخدم بالفعل" }, 409);

      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createError || !created.user) {
        return reply({ error: createError?.message || "تعذر إنشاء حساب الدخول" }, 400);
      }

      const { error: insertError } = await adminClient.from("admin_roles").insert({
        user_id: created.user.id,
        username,
        admin_code: adminCode,
        role: "admin",
        is_active: true
      });
      if (insertError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return reply({ error: "لم يتم حفظ بيانات المشرف، وتم التراجع عن إنشاء الحساب" }, 500);
      }
      return reply({ success: true, message: "تم إنشاء حساب المشرف" }, 201);
    }

    if (action === "set_active") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const isActive = body.is_active;
      if (!userId || typeof isActive !== "boolean") return reply({ error: "بيانات العملية غير مكتملة" }, 400);
      if (userId === authData.user.id) return reply({ error: "لا يمكن إيقاف حساب المالك الحالي" }, 400);

      const { data: target, error: targetError } = await adminClient
        .from("admin_roles")
        .select("user_id,role")
        .eq("user_id", userId)
        .maybeSingle();
      if (targetError || !target) return reply({ error: "المشرف غير موجود" }, 404);
      if (target.role === "owner") return reply({ error: "لا يمكن تغيير حالة حساب المالك" }, 403);

      const { error } = await adminClient.from("admin_roles")
        .update({ is_active: isActive })
        .eq("user_id", userId);
      if (error) return reply({ error: "تعذر تحديث حالة المشرف" }, 500);
      return reply({ success: true, message: isActive ? "تم تفعيل المشرف" : "تم إيقاف المشرف" });
    }

    return reply({ error: "عملية غير معروفة" }, 400);
  } catch (error) {
    console.error("admin-management failed:", error);
    return reply({ error: "حدث خطأ أثناء تنفيذ العملية" }, 500);
  }
});