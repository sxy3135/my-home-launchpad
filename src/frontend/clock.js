// Local clock and date; one minute-aligned scheduler also updates theme and trust expiry.
(function() {
  "use strict";
  const clock = document.getElementById("home-clock"), date = document.getElementById("home-date");
  const zone = "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const label = new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    timeZone: zone,
    weekday: "long"
  });
  let timer = null, suspended = false;
  function update(now) {
    window.HomeTheme?.update(now);
    if (!clock || !date) return;
    const time = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    if (clock.textContent !== time) clock.textContent = time;
    const p = Object.fromEntries(parts.formatToParts(now).map(x => [ x.type, x.value ])), day = p.year + "-" + p.month + "-" + p.day;
    if (date.dateTime !== day) {
      date.dateTime = day;
      date.textContent = label.format(now) + " · " + weekday.format(now);
    }
  }
  function stop() {
    clearTimeout(timer);
    timer = null;
  }
  function sync() {
    stop();
    window.HomeDevice?.checkExpiry?.();
    if (document.hidden || suspended || window.HomeDevice && !window.HomeDevice.unlocked) return;
    const now = new Date;
    update(now);
    timer = setTimeout(sync, 6e4 - now.getTime() % 6e4);
  }
  update(new Date);
  sync();
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("focus", sync);
  window.addEventListener("pagehide", () => {
    suspended = true;
    stop();
  });
  window.addEventListener("pageshow", () => {
    suspended = false;
    sync();
  });
  window.addEventListener("myhome:lock", stop);
})();
