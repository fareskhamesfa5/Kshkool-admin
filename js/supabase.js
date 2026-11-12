
const SUPABASE_URL = "https://bglqrfmxroyjpgdpxsin.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_Uv42h2pT8iAdYUGObB7Qow_QefCO3dJا";

const supabaseClient = window.supabase
  ? window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    )
  : null;
