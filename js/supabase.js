// ضع بيانات مشروع Supabase العامة هنا فقط. لا تضع service_role key في المتصفح مطلقاً.
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
const supabaseClient = (window.supabase && SUPABASE_URL.startsWith("https://") && SUPABASE_ANON_KEY.startsWith("ey"))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
