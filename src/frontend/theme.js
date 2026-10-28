(function(root) {
  "use strict";
  const KEY = "myhome.appearance.v1", DARK = [ 3, 6, 4 ], WHITE = [ 255, 255, 255 ], LIMIT = .18273;
  const nodes = [ [ 0, "3B5148" ], [ 360, "3B5148" ], [ 540, "E5EEE8" ], [ 1020, "E5EEE8" ], [ 1080, "CBDCD1" ], [ 1140, "8FA99A" ], [ 1260, "3B5148" ], [ 1440, "3B5148" ] ].map(([minute, hex]) => [ minute, hex.match(/../g).map(x => parseInt(x, 16)) ]);
  const linear = x => (x /= 255) <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  const luminance = rgb => rgb.map(linear).reduce((n, x, i) => n + x * [ .2126, .7152, .0722 ][i], 0);
  const ink = rgb => luminance(rgb) >= LIMIT ? DARK : WHITE;
  const hex = rgb => "#" + rgb.map(x => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  function colorAt(minute) {
    minute = (minute % 1440 + 1440) % 1440;
    for (let i = 1; i < nodes.length; i++) if (minute <= nodes[i][0]) {
      const [start, a] = nodes[i - 1], [end, b] = nodes[i], t = (minute - start) / (end - start);
      return mix(a, b, t * t * (3 - 2 * t)).map(Math.round);
    }
  }
  let fixed = null, preview = null, last = "";
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Number.isInteger(saved?.minute) && saved.minute >= 0 && saved.minute < 1440) fixed = saved.minute;
  } catch {}
  function apply(rgb) {
    const color = hex(rgb);
    if (last === color) return;
    last = color;
    const style = root.document?.documentElement?.style;
    if (!style) return;
    const fore = ink(rgb), hover = mix(rgb, fore, .08), pressed = mix(rgb, fore, .14);
    const values = {
      "--main-color": color,
      "--main-ink": hex(fore),
      "--main-ink-rgb": fore.join(" "),
      "--inner-hover-ink": hex(ink(hover)),
      "--inner-hover-ink-rgb": ink(hover).join(" "),
      "--inner-pressed-ink": hex(ink(pressed)),
      "--inner-pressed-ink-rgb": ink(pressed).join(" ")
    };
    for (const [key, value] of Object.entries(values)) style.setProperty(key, value);
  }
  function minuteNow(now) {
    return now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60 + now.getMilliseconds() / 6e4;
  }
  function update(now = new Date) {
    apply(colorAt(preview ?? fixed ?? minuteNow(now)));
  }
  function save(minute) {
    fixed = minute;
    try {
      if (minute === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, JSON.stringify({
        minute
      }));
    } catch {
      return false;
    }
    return true;
  }
  root.HomeTheme = {
    colorAt,
    luminance,
    ink,
    hex,
    mix,
    minuteNow,
    update,
    get fixed() {
      return fixed;
    },
    get preview() {
      return preview;
    },
    previewAt(minute) {
      preview = minute;
      update();
    },
    endPreview() {
      preview = null;
      update();
    },
    pin(minute) {
      const ok = save(minute);
      preview = null;
      update();
      return ok;
    },
    automatic() {
      const ok = save(null);
      preview = null;
      update();
      return ok;
    }
  };
  update();
})(typeof window === "undefined" ? globalThis : window);
