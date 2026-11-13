import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
  "Cache-Control": "no-store"
};
const reply = (body: unknown, status = 200) => Response.json(body, {status, headers:corsHeaders});

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigin || origin !== allowedOrigin) return new Response("Origin not allowed", {status:403,headers:corsHeaders});
  if (req.method === "OPTIONS") return new Response("ok", {headers:corsHeaders});
  if (req.method !== "POST") return reply({error:"Method not allowed"},405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return reply({error:"Server configuration error"},500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return reply({error:"Unauthorized"},401);

    const authClient = createClient(url,anonKey);
    const {data:authData,error:authError} = await authClient.auth.getUser(token);
    if (authError || !authData.user) return reply({error:"Unauthorized"},401);

    const adminClient = createClient(url,serviceKey);
    const {data:actor,error:actorError} = await adminClient.from("admin_roles")
      .select("username,role,is_active").eq("user_id",authData.user.id).maybeSingle();
    if (actorError || !actor || !actor.is_active || !["owner","admin"].includes(actor.role)) {
      return reply({error:"ليس لديك صلاحية إدارة الطلاب"},403);
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const [{data:profiles,error:profileError},{data:userData,error:userError},{data:adminRows,error:adminError}] = await Promise.all([
        adminClient.from("profiles").select("id,full_name,username,created_at,is_active").eq("role","student").order("created_at",{ascending:false}),
        adminClient.auth.admin.listUsers({page:1,perPage:1000}),
        adminClient.from("admin_roles").select("user_id")
      ]);
      if (profileError || userError || adminError) return reply({error:"تعذر تحميل قائمة الطلاب"},500);
      const adminIds = new Set((adminRows || []).map(row => row.user_id));
      const emails = new Map((userData.users || []).map(user => [user.id,user.email || ""]));
      const students = (profiles || []).filter(profile => !adminIds.has(profile.id)).map(profile => ({...profile,email:emails.get(profile.id) || ""}));
      return reply({students});
    }

    if (action === "create") {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (fullName.length < 2 || fullName.length > 100) return reply({error:"اكتب اسم الطالب بشكل صحيح"},400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({error:"البريد الإلكتروني غير صحيح"},400);
      if (password.length < 8 || password.length > 72) return reply({error:"كلمة المرور يجب أن تكون من 8 إلى 72 حرفاً"},400);

      const {data:created,error:createError} = await adminClient.auth.admin.createUser({
        email,password,email_confirm:true,user_metadata:{full_name:fullName,account_type:"student"}
      });
      if (createError || !created.user) return reply({error:createError?.message || "تعذر إنشاء حساب الطالب"},400);

      const {error:insertError} = await adminClient.from("profiles").upsert({
        id:created.user.id,full_name:fullName,role:"student",is_active:true
      }, {onConflict:"id"});
      if (insertError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        return reply({error:"تعذر حفظ ملف الطالب، وتم التراجع عن إنشاء الحساب"},500);
      }
      await adminClient.from("audit_logs").insert({
        actor_id:authData.user.id,actor_username:actor.username,action:"create",entity:"student",details:"إنشاء حساب طالب"
      });
      return reply({success:true,message:"تم إنشاء حساب الطالب بنجاح"},201);
    }

    const userId = typeof body.user_id === "string" ? body.user_id : "";
    if (!userId || userId === authData.user.id) return reply({error:"معرّف الطالب غير صحيح"},400);
    const {data:student,error:studentError} = await adminClient.from("profiles")
      .select("id,role,full_name").eq("id",userId).eq("role","student").maybeSingle();
    if (studentError || !student) return reply({error:"الطالب غير موجود"},404);
    const {data:targetAdmin,error:targetAdminError} = await adminClient.from("admin_roles").select("user_id").eq("user_id",userId).maybeSingle();
    if (targetAdminError) return reply({error:"تعذر التحقق من نوع الحساب"},500);
    if (targetAdmin) return reply({error:"لا يمكن تنفيذ إدارة الطلاب على حساب مشرف"},403);

    if (action === "update") {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (fullName.length < 2 || fullName.length > 100) return reply({error:"الاسم يجب أن يكون بين حرفين و100 حرف"},400);
      const {error} = await adminClient.from("profiles").update({full_name:fullName}).eq("id",userId).eq("role","student");
      if (error) return reply({error:"تعذر تحديث بيانات الطالب"},500);
      await adminClient.from("audit_logs").insert({actor_id:authData.user.id,actor_username:actor.username,action:"update",entity:"student",details:"تعديل اسم طالب"});
      return reply({success:true,message:"تم تحديث بيانات الطالب"});
    }

    if (action === "set_active") {
      if (typeof body.is_active !== "boolean") return reply({error:"حالة الحساب غير صحيحة"},400);
      const {error:authUpdateError} = await adminClient.auth.admin.updateUserById(userId,{
        ban_duration:body.is_active ? "none" : "876000h"
      });
      if (authUpdateError) return reply({error:"تعذر تحديث صلاحية تسجيل الدخول"},500);
      const {error} = await adminClient.from("profiles").update({is_active:body.is_active}).eq("id",userId).eq("role","student");
      if (error) return reply({error:"تم تحديث الدخول لكن تعذر تحديث حالة الملف الشخصي"},500);
      await adminClient.from("audit_logs").insert({actor_id:authData.user.id,actor_username:actor.username,action:body.is_active ? "activate" : "deactivate",entity:"student",details:body.is_active ? "تفعيل حساب طالب" : "إيقاف حساب طالب"});
      return reply({success:true,message:body.is_active ? "تم تفعيل حساب الطالب" : "تم إيقاف حساب الطالب"});
    }

    if (action === "delete") {
      const {error} = await adminClient.auth.admin.deleteUser(userId);
      if (error) return reply({error:"تعذر حذف حساب الطالب: " + error.message},500);
      await adminClient.from("audit_logs").insert({actor_id:authData.user.id,actor_username:actor.username,action:"delete",entity:"student",details:"حذف حساب طالب"});
      return reply({success:true,message:"تم حذف حساب الطالب"});
    }

    return reply({error:"عملية غير معروفة"},400);
  } catch (error) {
    console.error("student-management failed:",error);
    return reply({error:"حدث خطأ أثناء تنفيذ العملية"},500);
  }
});