async function initDashboard() {
  if (!supabaseClient) { location.href = "index.html"; return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { location.href = "index.html"; return; }
  const { data: role, error } = await supabaseClient.from("admin_roles").select("username,role").eq("user_id", session.user.id).single();
  if (error || !role) { await supabaseClient.auth.signOut(); location.href = "index.html"; return; }
  document.getElementById("adminName").textContent = role.username || "المشرف";
  document.getElementById("adminRole").textContent = role.role === "owner" ? "SUPER ADMIN" : "ADMIN";
  document.querySelectorAll(".owner-only").forEach(el => { if (role.role !== "owner") el.hidden = true; });
  const { count } = await supabaseClient.from("profiles").select("*", { count: "exact", head: true }).eq("role", "student");
  document.getElementById("studentsCount").textContent = count ?? "—";
}
document.getElementById("logoutBtn")?.addEventListener("click", async () => { if (supabaseClient) await supabaseClient.auth.signOut(); location.href = "index.html"; });
document.getElementById("menuBtn")?.addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
initDashboard();
