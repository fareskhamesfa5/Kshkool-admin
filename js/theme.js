(() => {
 const KEY="koshkool_admin_theme", iconRoot=new URL("../assets/icons/",document.currentScript.src);
 const icons={dark:new URL("moon.svg",iconRoot).href,light:new URL("sun.svg",iconRoot).href};
 document.body.classList.toggle("light-theme",(localStorage.getItem(KEY)||"dark")==="light");
 function setup(){
  const header=document.querySelector(".topbar"); if(!header||document.getElementById("adminThemeToggle"))return;
  const button=document.createElement("button");button.type="button";button.id="adminThemeToggle";button.className="admin-theme-toggle";
  const img=document.createElement("img");img.alt="";img.className="admin-theme-icon";button.appendChild(img);header.appendChild(button);
  function render(animate=false){const light=document.body.classList.contains("light-theme");img.src=light?icons.dark:icons.light;button.title=light?"تفعيل الوضع الداكن":"تفعيل الوضع الفاتح";button.setAttribute("aria-label",button.title);if(animate){img.classList.remove("theme-pop");void img.offsetWidth;img.classList.add("theme-pop")}}
  render();button.addEventListener("click",()=>{const light=document.body.classList.toggle("light-theme");localStorage.setItem(KEY,light?"light":"dark");render(true)});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup);else setup();
})();