// Time preview and persistent fixed-colour selection using the shared theme.
(function() {
  "use strict";
  const t = message => (typeof window === "undefined" ? globalThis : window).HomeI18n?.t(message) ?? message;
  const theme = window.HomeTheme, button = document.getElementById("appearance-button"), dialog = document.getElementById("appearance-dialog");
  if (!theme || !button || !dialog) return;
  const slider = document.getElementById("appearance-time"), time = document.getElementById("appearance-value"), color = document.getElementById("appearance-color"), state = document.getElementById("appearance-state"), note = document.getElementById("appearance-note");
  const format = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  function label() {
    const m = Number(slider.value), c = theme.hex(theme.colorAt(m));
    time.textContent = format(m);
    color.textContent = c;
    slider.setAttribute("aria-valuetext", format(m) + t("，") + c);
  }
  function status() {
    state.textContent = theme.fixed === null ? t("自动") : t("固定");
    button.setAttribute("aria-label", t("外观：") + (theme.fixed === null ? t("随设备时间自动变化") : t("固定 ") + format(theme.fixed) + t(" 的颜色")));
  }
  function finish() {
    dialog.close();
    theme.endPreview();
    status();
    button.focus({
      preventScroll: true
    });
  }
  button.addEventListener("click", () => {
    window.HomeUI?.closeSelect();
    slider.value = theme.fixed ?? Math.floor(theme.minuteNow(new Date));
    note.textContent = theme.fixed === null ? t("当前随设备时间变化。") : t("已固定所选时刻的颜色。");
    note.classList.remove("form-error");
    label();
    dialog.showModal();
  });
  slider.addEventListener("input", () => {
    theme.previewAt(Number(slider.value));
    label();
    note.textContent = t("正在预览；关闭后恢复原设置。");
    note.classList.remove("form-error");
  });
  document.getElementById("appearance-pin").addEventListener("click", () => {
    const ok = theme.pin(Number(slider.value));
    note.textContent = ok ? t("已固定 ") + format(Number(slider.value)) + t(" 的颜色。") : t("颜色已固定，但浏览器未能保存此设置。");
    note.classList.toggle("form-error", !ok);
    status();
  });
  document.getElementById("appearance-auto").addEventListener("click", () => {
    const ok = theme.automatic();
    slider.value = Math.floor(theme.minuteNow(new Date));
    label();
    note.textContent = ok ? t("已恢复随设备时间变化。") : t("已恢复自动，但浏览器未能保存此设置。");
    note.classList.toggle("form-error", !ok);
    status();
  });
  document.getElementById("appearance-close").addEventListener("click", finish);
  dialog.addEventListener("cancel", e => {
    e.preventDefault();
    finish();
  });
  dialog.addEventListener("close", () => {
    theme.endPreview();
    status();
  });
  status();
  window.addEventListener("myhome:language", status);
})();
