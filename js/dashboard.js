async function initDashboard() {
  if (!supabaseClient) { location.href = "index.html"; return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { location.href = "index.html"; return; }
  const { data: role, error } = await supabaseClient.from("admin_roles").select("username,role,is_active").eq("user_id", session.user.id).single();
  if (error || !role || role.is_active !== true) { await supabaseClient.auth.signOut(); location.href = "index.html"; return; }
  document.getElementById("adminName").textContent = role.username || "المشرف";
  document.getElementById("adminRole").textContent = role.role === "owner" ? "SUPER ADMIN" : "ADMIN";
  document.querySelectorAll(".owner-only").forEach(el => { if (role.role !== "owner") el.hidden = true; });
  const { data: studentsResult, error: studentsError } = await supabaseClient.functions.invoke("student-management", {
    body: { action: "list" }
  });
  if (studentsError || studentsResult?.error || !Array.isArray(studentsResult?.students)) {
    document.getElementById("studentsCount").textContent = "—";
    return;
  }
  document.getElementById("studentsCount").textContent = studentsResult.students.length;
}
document.getElementById("logoutBtn")?.addEventListener("click", async () => { if (supabaseClient) await supabaseClient.auth.signOut(); location.href = "index.html"; });
document.getElementById("menuBtn")?.addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
initDashboard();
