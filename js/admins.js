const tableBody = document.getElementById("adminsTableBody");
const form = document.getElementById("createAdminForm");
const formMessage = document.getElementById("formMessage");
const listMessage = document.getElementById("listMessage");
const createButton = document.getElementById("createAdminBtn");

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = "admin-message" + (type ? " " + type : "");
}

async function callAdminManagement(payload) {
  if (!supabaseClient) throw new Error("تعذر الاتصال بخدمة قاعدة البيانات");
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session) {
    location.href = "../index.html";
    throw new Error("انتهت جلسة الدخول، سجل الدخول مرة أخرى");
  }
  const { data, error } = await supabaseClient.functions.invoke("admin-management", { body: payload });
  if (error) {
    let message = error.message || "تعذر تنفيذ الطلب";
    try {
      const context = error.context;
      if (context && typeof context.json === "function") {
        const details = await context.json();
        if (details?.error) message = details.error;
      }
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ar-EG");
}

async function loadAdmins() {
  tableBody.innerHTML = '<tr><td colspan="6">جارٍ تحميل البيانات...</td></tr>';
  showMessage(listMessage, "");
  try {
    const data = await callAdminManagement({ action: "list" });
    const admins = data.admins || [];
    document.getElementById("totalAdmins").textContent = admins.length;
    document.getElementById("activeAdmins").textContent = admins.filter(a => a.is_active).length;
    document.getElementById("inactiveAdmins").textContent = admins.filter(a => !a.is_active).length;

    if (!admins.length) {
      tableBody.innerHTML = '<tr><td colspan="6">لا يوجد مشرفون مسجلون.</td></tr>';
      return;
    }

    tableBody.innerHTML = admins.map(admin => {
      const active = admin.is_active === true;
      const isOwner = admin.role === "owner";
      const action = isOwner
        ? '<span class="muted">حساب المالك</span>'
        : '<button class="btn ' + (active ? 'danger' : 'success') + ' admin-toggle" type="button" data-id="' + escapeHtml(admin.user_id) + '" data-active="' + (!active) + '">' + (active ? "إيقاف" : "تفعيل") + '</button>';
      return '<tr>' +
        '<td><strong>' + escapeHtml(admin.username) + '</strong></td>' +
        '<td class="code-cell">' + escapeHtml(admin.admin_code) + '</td>' +
        '<td><span class="role-pill ' + (isOwner ? 'owner' : '') + '">' + (isOwner ? "مالك النظام" : "مشرف") + '</span></td>' +
        '<td><span class="state-pill ' + (active ? 'active' : 'inactive') + '">' + (active ? "نشط" : "موقوف") + '</span></td>' +
        '<td>' + formatDate(admin.created_at) + '</td><td>' + action + '</td></tr>';
    }).join("");
  } catch (error) {
    tableBody.innerHTML = '<tr><td colspan="6">تعذر تحميل القائمة.</td></tr>';
    showMessage(listMessage, error.message, "error");
  }
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  createButton.disabled = true;
  createButton.textContent = "جارٍ إنشاء الحساب...";
  showMessage(formMessage, "جارٍ إنشاء حساب المشرف...");
  const payload = {
    action: "create",
    username: document.getElementById("newUsername").value.trim(),
    admin_code: document.getElementById("newAdminCode").value.trim(),
    email: document.getElementById("newEmail").value.trim(),
    password: document.getElementById("newPassword").value
  };
  try {
    const result = await callAdminManagement(payload);
    form.reset();
    showMessage(formMessage, result.message || "تم إنشاء حساب المشرف بنجاح", "success");
    await loadAdmins();
  } catch (error) {
    showMessage(formMessage, error.message, "error");
  } finally {
    createButton.disabled = false;
    createButton.textContent = "＋ إنشاء حساب المشرف";
  }
});

tableBody?.addEventListener("click", async event => {
  const button = event.target.closest(".admin-toggle");
  if (!button) return;
  const isActive = button.dataset.active === "true";
  const promptText = isActive ? "هل تريد تفعيل هذا المشرف؟" : "هل تريد إيقاف هذا المشرف؟";
  if (!window.confirm(promptText)) return;
  button.disabled = true;
  try {
    const result = await callAdminManagement({
      action: "set_active",
      user_id: button.dataset.id,
      is_active: isActive
    });
    showMessage(listMessage, result.message, "success");
    await loadAdmins();
  } catch (error) {
    showMessage(listMessage, error.message, "error");
    button.disabled = false;
  }
});

document.getElementById("refreshAdmins")?.addEventListener("click", loadAdmins);
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  location.href = "../index.html";
});
document.getElementById("menuBtn")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

async function initAdminsPage() {
  if (!supabaseClient) { location.href = "../index.html"; return; }
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { location.href = "../index.html"; return; }
  const { data: profile } = await supabaseClient.from("admin_roles")
    .select("username,role,is_active").eq("user_id", session.user.id).maybeSingle();
  if (!profile || profile.role !== "owner" || !profile.is_active) {
    document.querySelector(".admins-page").innerHTML =
      '<section class="panel"><h2>غير مصرح بالدخول</h2><p class="muted">هذه الصفحة متاحة لمالك النظام فقط.</p><a class="btn primary" href="../dashboard.html">العودة للوحة التحكم</a></section>';
    return;
  }
  document.getElementById("adminName").textContent = profile.username || "المالك";
  await loadAdmins();
}
initAdminsPage();