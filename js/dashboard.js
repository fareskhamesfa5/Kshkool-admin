async function initDashboard() {
  if (!supabaseClient) { location.href = "index.html"; return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { location.href = "index.html"; return; }
  const { data: role, error } = await supabaseClient.from("admin_roles").select("username,role,is_active").eq("user_id", session.user.id).single();
  if (error || !role || role.is_active !== true) { await supabaseClient.auth.signOut(); location.href = "index.html"; return; }
  document.getElementById("adminName").textContent = role.username || "المشرف";
  document.getElementById("adminRole").textContent = role.role === "owner" ? "SUPER ADMIN" : "ADMIN";
  document.querySelectorAll(".owner-only").forEach(el => { if (role.role !== "owner") el.hidden = true; });
  const [{ data: studentProfiles, error: studentsError }, { data: adminAccounts, error: adminsError }] = await Promise.all([
    supabaseClient.from("profiles").select("id").eq("role", "student"),
    supabaseClient.from("admin_roles").select("user_id")
  ]);
  if (studentsError || adminsError) {
    document.getElementById("studentsCount").textContent = "—";
    return;
  }
  const adminIds = new Set((adminAccounts || []).map(account => account.user_id));
  const actualStudentsCount = (studentProfiles || []).filter(profile => !adminIds.has(profile.id)).length;
  document.getElementById("studentsCount").textContent = actualStudentsCount;
}
document.getElementById("logoutBtn")?.addEventListener("click", async () => { if (supabaseClient) await supabaseClient.auth.signOut(); location.href = "index.html"; });
document.getElementById("menuBtn")?.addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
initDashboard();
