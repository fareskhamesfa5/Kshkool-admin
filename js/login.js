
const form = document.getElementById("loginForm");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("loginMessage");
    const username = document.getElementById("username").value.trim();
    const adminId = document.getElementById("adminId").value.trim();
    const password = document.getElementById("password").value;

    // التحقق من أن الرقم التعريفي أرقام فقط
    if (!/^\d+$/.test(adminId)) {
      message.textContent = "الرقم التعريفي يجب أن يحتوي على أرقام فقط.";
      return;
    }

    if (!supabaseClient) {
      message.textContent = "إعداد Supabase غير مكتمل.";
      return;
    }

    message.textContent = "جارٍ التحقق...";

    try {
      const { data, error } =
        await supabaseClient.functions.invoke("admin-login", {
          body: {
            username,
            admin_id: adminId,
            password
          }
        });

      if (error || !data?.access_token || !data?.refresh_token) {
        throw new Error("بيانات الدخول غير صحيحة أو خدمة الدخول غير مجهزة.");
      }

      const { error: sessionError } =
        await supabaseClient.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });

      if (sessionError) throw sessionError;

      location.href = "dashboard.html";

    } catch (err) {
      message.textContent =
        err.message || "تعذر تسجيل الدخول.";
    }
  });
}
