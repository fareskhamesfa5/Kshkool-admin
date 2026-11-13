const tableBody = document.getElementById("studentsTableBody");
const form = document.getElementById("createStudentForm");
const formMessage = document.getElementById("formMessage");
const listMessage = document.getElementById("listMessage");
const createButton = document.getElementById("createStudentBtn");
const searchInput = document.getElementById("studentSearch");
const filterInput = document.getElementById("studentFilter");
let studentsCache = [];

function showStudentMessage(element, message, type = "") {
  element.textContent = message;
  element.className = "student-message" + (type ? " " + type : "");
}
function escapeStudentHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}
function studentDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ar-EG", {year:"numeric",month:"short",day:"numeric"});
}
async function callStudentManagement(payload) {
  if (!supabaseClient) throw new Error("تعذر الاتصال بقاعدة البيانات");
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session) {
    location.href = "../index.html";
    throw new Error("انتهت جلسة الدخول. سجل الدخول مرة أخرى.");
  }
  const { data, error } = await supabaseClient.functions.invoke("student-management", { body: payload });
  if (error) {
    let message = error.message || "تعذر تنفيذ العملية";
    try {
      if (error.context && typeof error.context.json === "function") {
        const details = await error.context.json();
        if (details?.error) message = details.error;
      }
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
function renderStudents() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filter = filterInput.value;
  const visible = studentsCache.filter(student => {
    const matchesText = !query || [student.full_name, student.email].some(value => String(value || "").toLocaleLowerCase().includes(query));
    const matchesState = filter === "all" || (filter === "active" ? student.is_active : !student.is_active);
    return matchesText && matchesState;
  });
  document.getElementById("emptyStudents").hidden = visible.length !== 0;
  if (!visible.length) {
    tableBody.innerHTML = "";
    return;
  }
  tableBody.innerHTML = visible.map(student => {
    const active = student.is_active === true;
    const name = student.full_name || "طالب بدون اسم";
    return `<tr>
      <td><div class="student-identity"><span class="student-avatar">${escapeStudentHtml(name.trim().charAt(0) || "ط")}</span><strong>${escapeStudentHtml(name)}</strong></div></td>
      <td class="student-email">${escapeStudentHtml(student.email || "—")}</td>
      <td>${studentDate(student.created_at)}</td>
      <td><span class="student-state ${active ? "active" : "inactive"}">${active ? "نشط" : "موقوف"}</span></td>
      <td><div class="student-actions">
        <button class="student-action edit" type="button" data-action="edit" data-id="${escapeStudentHtml(student.id)}">تعديل الاسم</button>
        <button class="student-action ${active ? "pause" : "activate"}" type="button" data-action="toggle" data-id="${escapeStudentHtml(student.id)}" data-active="${!active}">${active ? "إيقاف" : "تفعيل"}</button>
        <button class="student-action delete" type="button" data-action="delete" data-id="${escapeStudentHtml(student.id)}">حذف</button>
      </div></td>
    </tr>`;
  }).join("");
}
async function loadStudents() {
  tableBody.innerHTML = '<tr><td colspan="5">جارٍ تحميل الطلاب...</td></tr>';
  document.getElementById("emptyStudents").hidden = true;
  showStudentMessage(listMessage, "");
  try {
    const data = await callStudentManagement({action:"list"});
    studentsCache = data.students || [];
    document.getElementById("totalStudents").textContent = studentsCache.length;
    document.getElementById("activeStudents").textContent = studentsCache.filter(s => s.is_active).length;
    document.getElementById("inactiveStudents").textContent = studentsCache.filter(s => !s.is_active).length;
    renderStudents();
  } catch (error) {
    tableBody.innerHTML = '<tr><td colspan="5">تعذر تحميل بيانات الطلاب.</td></tr>';
    showStudentMessage(listMessage, error.message, "error");
  }
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  createButton.disabled = true;
  createButton.textContent = "جارٍ إنشاء الحساب...";
  showStudentMessage(formMessage, "جارٍ إنشاء حساب الطالب...");
  try {
    const result = await callStudentManagement({
      action:"create",
      full_name:document.getElementById("studentName").value.trim(),
      email:document.getElementById("studentEmail").value.trim(),
      password:document.getElementById("studentPassword").value
    });
    form.reset();
    showStudentMessage(formMessage, result.message || "تم إنشاء حساب الطالب بنجاح", "success");
    await loadStudents();
  } catch (error) {
    showStudentMessage(formMessage, error.message, "error");
  } finally {
    createButton.disabled = false;
    createButton.textContent = "＋ إنشاء حساب الطالب";
  }
});
tableBody.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const student = studentsCache.find(item => item.id === button.dataset.id);
  if (!student) return;
  const action = button.dataset.action;
  try {
    button.disabled = true;
    if (action === "edit") {
      const nextName = window.prompt("اكتب الاسم الجديد للطالب:", student.full_name || "");
      if (nextName === null) return;
      if (nextName.trim().length < 2) throw new Error("الاسم يجب ألا يقل عن حرفين");
      await callStudentManagement({action:"update",user_id:student.id,full_name:nextName.trim()});
      showStudentMessage(listMessage, "تم تحديث بيانات الطالب", "success");
    } else if (action === "toggle") {
      const isActive = button.dataset.active === "true";
      if (!window.confirm(isActive ? "هل تريد تفعيل حساب هذا الطالب؟" : "هل تريد إيقاف حساب هذا الطالب ومنعه من تسجيل الدخول؟")) return;
      await callStudentManagement({action:"set_active",user_id:student.id,is_active:isActive});
      showStudentMessage(listMessage, isActive ? "تم تفعيل حساب الطالب" : "تم إيقاف حساب الطالب", "success");
    } else if (action === "delete") {
      if (!window.confirm("حذف حساب الطالب نهائياً؟ سيتم حذف ملفه الشخصي ونتائجه المرتبطة به. لا يمكن التراجع عن هذه العملية.")) return;
      await callStudentManagement({action:"delete",user_id:student.id});
      showStudentMessage(listMessage, "تم حذف حساب الطالب", "success");
    }
    await loadStudents();
  } catch (error) {
    showStudentMessage(listMessage, error.message, "error");
  } finally {
    button.disabled = false;
  }
});
searchInput.addEventListener("input", renderStudents);
filterInput.addEventListener("change", renderStudents);
document.getElementById("refreshStudents").addEventListener("click", loadStudents);
document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
  location.href = "../index.html";
});
document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));

async function initStudentsPage() {
  if (!supabaseClient) { location.href = "../index.html"; return; }
  const {data:{session},error} = await supabaseClient.auth.getSession();
  if (error || !session) { location.href = "../index.html"; return; }
  const {data:admin,error:roleError} = await supabaseClient.from("admin_roles")
    .select("username,role,is_active").eq("user_id",session.user.id).maybeSingle();
  if (roleError || !admin || !admin.is_active || admin.role !== "owner") {
    document.querySelector(".students-page").innerHTML = '<section class="panel"><h2>غير مصرح بالدخول</h2><p class="muted">هذه الصفحة متاحة لمدير النظام فقط.</p><a class="btn primary" href="../dashboard.html">العودة للوحة التحكم</a></section>';
    return;
  }
  document.getElementById("adminName").textContent = admin.username || "المشرف";
  document.getElementById("adminRole").textContent = admin.role === "owner" ? "SUPER ADMIN" : "ADMIN";
  await loadStudents();
}
initStudentsPage();