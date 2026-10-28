// Configuration validation, idempotent migrations and platform-specific target planning. Opens execute in interactions.js.
(function(root) {
  "use strict";
  const t = message => (typeof window === "undefined" ? globalThis : window).HomeI18n?.t(message) ?? message;
  const legacySections = [ "learning", "reading", "affairs", "investment", "entertainment" ];
  const legacyNames = {
    learning: "学习",
    reading: "阅读",
    affairs: "事务",
    investment: "投资",
    entertainment: "娱乐"
  };
  const iconPresets = [ [ "link", "链接" ], [ "home", "首页" ], [ "note", "笔记" ], [ "folder", "文件夹" ], [ "chat", "对话" ], [ "read", "阅读" ], [ "book", "书本" ], [ "school", "学校" ], [ "mail", "邮箱" ], [ "chart", "投资" ], [ "briefcase", "事务" ], [ "play", "播放" ], [ "video", "视频" ], [ "calendar", "日程" ], [ "tasks", "任务" ], [ "wallet", "钱包" ] ].map(([id, name]) => ({
    id,
    name
  }));
  const uid = () => root.crypto?.randomUUID?.() || "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  const MAC_SHORTCUT = "My Home 打开资料";
  // Device targets: raw paths remain data until a validated open address is generated.
    function deviceSystem(nav = root.navigator) {
    const ua = String(nav?.userAgent || ""), platform = String(nav?.userAgentData?.platform || nav?.platform || "");
    if (/iPhone|iPad|iPod|Android/i.test(ua) || /Mac/i.test(platform + " " + ua) && Number(nav?.maxTouchPoints) > 1) return "unsupported";
    if (/Windows|Win32|Win64/i.test(platform + " " + ua)) return "windows";
    if (/macOS|MacIntel|MacPPC|Macintosh|Mac OS X/i.test(platform + " " + ua)) return "mac";
    return "unsupported";
  }
  function unquotePath(value) {
    if (typeof value !== "string") throw Error(t("文件夹路径必须是文本。"));
    if (/[\x00-\x1f\x7f-\x9f]/.test(value)) throw Error(t("路径包含控制字符，请重新复制。"));
    let text = value.trim();
    if (text.length > 1 && [ '"', "'" ].includes(text[0]) && text.at(-1) === text[0]) text = text.slice(1, -1);
    return text;
  }
  function normalizeMacPath(value) {
    const text = unquotePath(value);
    if (text.length > 4096 || !/^\/(?!\/)/.test(text) || /[\x00-\x1f\x7f-\x9f]/.test(text) || text.split("/").some(p => p === "." || p === "..")) throw Error(t("请填写 Mac 绝对文件夹路径，例如 /Users/用户名/Documents/课程资料。"));
    try {
      encodeURIComponent(text);
    } catch {
      throw Error(t("路径包含无法识别的字符，请重新复制。"));
    }
    return text;
  }
  function normalizeLocalPath(value) {
    let text = unquotePath(value || "");
    if (text.length > 2048 || !/^[a-z]:\\/i.test(text) || /[\x00-\x1f\x7f<>"|?*:/]/.test(text.slice(2))) throw Error(t("请粘贴完整的 Windows 本地文件夹路径，例如 C:\\课程\\示例学期\\课程名称。"));
    text = text[0].toUpperCase() + text.slice(1);
    while (text.length > 3 && text.endsWith("\\")) text = text.slice(0, -1);
    const parts = text.slice(3).split("\\");
    if (text.length > 3 && parts.some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))) throw Error(t("路径包含无效的文件夹名，请从资源管理器复制完整路径。"));
    try {
      encodeURIComponent(text);
    } catch {
      throw Error(t("路径包含无法识别的字符，请重新复制。"));
    }
    return text;
  }
  const isLocalPath = value => /^(?:["']?[a-z]:[\\/])/i.test(String(value || "").trim());
  const isMacPath = value => /^["']?\//.test(String(value || "").trim());
  function folderUri(path) {
    const bytes = encodeURIComponent(normalizeLocalPath(path)).replace(/%([0-9a-f]{2})|([^%])/gi, (_, hex, char) => hex || char.charCodeAt(0).toString(16).padStart(2, "0")).toUpperCase();
    return "myhome-folder:open/" + bytes;
  }
  function decodeFolderUri(uri) {
    const match = /^myhome-folder:open\/([a-f0-9]+)$/i.exec(uri);
    if (!match || match[1].length % 2) throw Error(t("本地资料链接无效，请直接粘贴 Windows 文件夹路径。"));
    try {
      return normalizeLocalPath(decodeURIComponent(match[1].replace(/../g, byte => "%" + byte)));
    } catch {
      throw Error(t("本地资料链接无效，请直接粘贴 Windows 文件夹路径。"));
    }
  }
  function normalizeUrl(value) {
    if (/[\x00-\x1f\x7f-\x9f]/.test(String(value || ""))) throw Error(t("链接包含控制字符，请重新复制。"));
    const text = String(value || "").trim();
    if (!text) return "";
    if (isLocalPath(text)) return normalizeLocalPath(text);
    if (isMacPath(text)) return normalizeMacPath(text);
    if (text.length > (/^myhome-folder:/i.test(text) ? 16384 : 8192)) throw Error(t("链接过长，请检查地址。"));
    let parsed;
    try {
      parsed = new URL(text);
    } catch {
      throw Error(t("请填写完整网址（https://…）或 Obsidian 链接。"));
    }
    if (![ "https:", "http:", "obsidian:", "myhome-folder:" ].includes(parsed.protocol)) throw Error(t("支持网址、Obsidian 链接和已配置的本地资料链接。"));
    if (parsed.protocol === "myhome-folder:") {
      if (/^myhome-folder:open\//i.test(text)) return decodeFolderUri(text);
      const legacy = /^myhome-folder:\/\/open\/[^?]+$/.test(text);
      if (legacy) throw Error(t("此旧资料链接没有实际路径，请在备份中填写文件夹路径后重新导入。原配置未被删除。"));
      if (!/^myhome-folder:\/\/open\?path=(?:[a-z0-9._~-]|%[a-f0-9]{2})+$/i.test(text)) throw Error(t("本地资料链接无效，请直接粘贴 Windows 文件夹路径。"));
      try {
        return normalizeLocalPath(decodeURIComponent(text.slice(text.indexOf("=") + 1)));
      } catch {
        throw Error(t("本地资料链接无效，请直接粘贴 Windows 文件夹路径。"));
      }
    }
    if (parsed.protocol === "obsidian:" && parsed.hostname !== "open") throw Error(t("请使用 Obsidian 的“复制 Obsidian URL”，填写 obsidian://open 链接。"));
    if ([ "https:", "http:" ].includes(parsed.protocol) && (!parsed.hostname || parsed.username || parsed.password)) throw Error(t("请使用不含账号密码的完整网址。"));
    return text;
  }
  function targetData(entry) {
    const url = normalizeUrl(isMacPath(entry.url) ? "" : entry.url), hasPaths = entry.folderPaths !== undefined;
    if (hasPaths && (!entry.folderPaths || typeof entry.folderPaths !== "object" || Array.isArray(entry.folderPaths))) throw Error(t("文件夹路径配置无效。"));
    if (hasPaths || isLocalPath(url) || isMacPath(entry.url)) {
      const paths = entry.folderPaths || {}, windows = paths.windows ?? (isLocalPath(url) ? url : ""), mac = paths.mac ?? (isMacPath(entry.url) ? entry.url : "");
      for (const value of [ windows, mac ]) if (typeof value !== "string") throw Error(t("文件夹路径必须是文本。"));
      return {
        url: "",
        folderPaths: {
          windows: windows.trim() ? normalizeLocalPath(windows) : "",
          mac: mac.trim() ? normalizeMacPath(mac) : ""
        }
      };
    }
    return {
      url
    };
  }
  function setEntryTarget(entry, values) {
    const next = {
      ...entry
    };
    delete next.folderPaths;
    Object.assign(next, targetData(values));
    return next;
  }
  function resolveTarget(entry, system = deviceSystem()) {
    const data = targetData(entry);
    if (data.folderPaths) {
      if (![ "windows", "mac" ].includes(system)) return {
        status: "unsupported",
        message: t("此系统暂不支持打开本地资料，请使用 Mac 或 Windows 电脑。")
      };
      const path = data.folderPaths[system];
      if (!path) return {
        status: "missing",
        system,
        folder: true,
        message: system === "mac" ? t("尚未填写 Mac 路径，请在整理中设置资料路径和通用快捷指令。") : t("尚未填写 Windows 路径，请在整理中设置资料路径。")
      };
      return {
        status: "ready",
        kind: "external",
        system,
        path,
        folder: true,
        name: entry.name
      };
    }
    if (!data.url) return {
      status: "missing",
      message: t("请先填写此入口的链接。")
    };
    return {
      status: "ready",
      kind: /^https?:/i.test(data.url) ? "web" : "external",
      url: data.url,
      name: entry.name
    };
  }
  function targetUrl(target) {
    if (target.status !== "ready") return "";
    if (!target.folder) return target.url;
    if (target.system === "windows") return folderUri(target.path);
    if (target.system === "mac") return "shortcuts://run-shortcut?name=" + encodeURIComponent(MAC_SHORTCUT) + "&input=text&text=" + encodeURIComponent(normalizeMacPath(target.path));
    return "";
  }
  const moduleTypes = [ "learning", "reader", "shortcuts" ], moduleSizes = [ "small", "medium", "wide" ];
  const moduleRowHeight = 72, moduleGap = 16, moduleHeights = [ 2, 3, 4 ];
  const moduleHeight = units => units * moduleRowHeight + (units - 1) * moduleGap;
  const defaultSize = type => type === "learning" ? "wide" : type === "reader" ? "medium" : "small";
  const defaultHeight = type => type === "learning" ? 4 : 3;
  function defaultConfig() {
    return validateConfig({
      version: 4,
      localFoldersVersion: 2,
      currentSemester: "semester-1",
      semesters: [ {
        id: "semester-1",
        name: t("当前学期"),
        courses: []
      } ],
      modules: legacySections.map(id => ({
        id,
        type: id === "learning" ? "learning" : id === "reading" ? "reader" : "shortcuts",
        name: t(legacyNames[id]),
        links: []
      }))
    });
  }
  // One runtime model. Fixed sections and their separate order are migration input only.
    function validateConfig(input, {recover = false, issues = []} = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input) || ![ 1, 2, 3, 4 ].includes(input.version)) throw Error(t("这不是支持的 MY HOME 配置文件。"));
    const ids = new Set;
    const str = (v, label, max = 200) => {
      if (typeof v !== "string" || !v.trim() || v.length > max) throw Error(label + t("无效。"));
      return v.trim();
    };
    const id = v => {
      const r = str(v, t("配置编号"), 120);
      if (ids.has(r)) throw Error(t("配置中存在重复编号。"));
      ids.add(r);
      return r;
    };
    function attempt(fn, label, fallback) {
      if (!recover) return fn();
      const before = new Set(ids);
      try {
        return fn();
      } catch (error) {
        ids.clear();
        for (const value of before) ids.add(value);
        issues.push(label + t("：") + error.message);
        return fallback;
      }
    }
    function links(v) {
      if (!Array.isArray(v) || v.length > 100) {
        if (!recover) throw Error(t("入口列表无效或数量过多。"));
        issues.push(t("入口列表无效，原始配置需要恢复。"));
        return [];
      }
      return v.map(e => attempt(() => entry(e), t("入口 ") + (e?.name || ""), null)).filter(Boolean);
    }
    function entry(v) {
      if (!v || typeof v !== "object") throw Error(t("入口无效。"));
      if (v.launchRole !== undefined && ![ "gpt", "note", "folder", "none" ].includes(v.launchRole)) throw Error(t("课程启动用途无效。"));
      return {
        ...v,
        id: id(v.id),
        name: attempt(() => str(v.name, t("入口名称")), t("入口名称"), t("待恢复入口")),
        ...attempt(() => targetData(v), t("入口目标"), {
          url: "",
          folderPaths: undefined
        }),
        icon: typeof v.icon === "string" ? v.icon.slice(0, 32) : "link",
        description: typeof v.description === "string" ? v.description.slice(0, 200) : "",
        ...v.previousUrl ? {
          previousUrl: normalizeUrl(v.previousUrl)
        } : {}
      };
    }
    let rawModules;
    if (input.version < 4) {
      const order = Array.isArray(input.sectionOrder) ? [ ...new Set(input.sectionOrder.filter(k => legacySections.includes(k))) ] : [];
      for (const key of legacySections) if (!order.includes(key)) order.push(key);
      rawModules = order.map(key => ({
        id: key,
        type: key === "learning" ? "learning" : key === "reading" ? "reader" : "shortcuts",
        name: t(legacyNames[key]),
        links: input.version === 1 && key === "investment" ? input.sections?.[key] || [] : input.sections?.[key]
      }));
    } else rawModules = input.modules;
    if (!Array.isArray(rawModules) || rawModules.length > 100) throw Error(t("模块列表无效，最多支持 100 个模块。"));
    const modules = rawModules.map(m => attempt(() => {
      if (!m || !moduleTypes.includes(m.type)) throw Error(t("模块类型无效。"));
      const result = {
        ...m,
        id: id(m.id),
        type: m.type,
        name: attempt(() => str(m.name, t("模块名称")), t("模块名称"), m.type === "learning" ? t("学习") : m.type === "reader" ? "Reader" : t("待恢复模块")),
        size: m.size ?? defaultSize(m.type),
        heightUnits: m.heightUnits === undefined ? defaultHeight(m.type) : m.heightUnits
      };
      if (!moduleSizes.includes(result.size)) {
        if (!recover) throw Error(t("模块尺寸无效。"));
        issues.push(t("模块 ") + result.name + t(" 的尺寸无效，使用默认尺寸。"));
        result.size = defaultSize(m.type);
      }
      if (!moduleHeights.includes(result.heightUnits)) {
        if (!recover) throw Error(t("模块高度无效，请选择 2、3 或 4 份。"));
        issues.push(t("模块 ") + result.name + t(" 的高度无效，暂时使用默认高度。"));
        result.heightUnits = defaultHeight(m.type);
      }
      result.links = links(m.links);
      return result;
    }, t("模块 ") + (m?.name || ""), null)).filter(Boolean);
    for (const type of [ "learning", "reader" ]) if (modules.filter(m => m.type === type).length !== 1) throw Error(t("学习和 Reader 类型必须各保留一个模块。"));
    if (input.version < 3) getModule({
      modules
    }, "learning", true).links.unshift(entry(input.home));
    if (!Array.isArray(input.semesters) || !input.semesters.length || input.semesters.length > 100) throw Error(t("至少保留一个学期，最多支持 100 个学期。"));
    const semesters = input.semesters.map(s => attempt(() => {
      if (!s || !Array.isArray(s.courses) || s.courses.length > 100) throw Error(t("课程列表无效。"));
      return {
        ...s,
        id: id(s.id),
        name: attempt(() => str(s.name, t("学期名称")), t("学期名称"), t("待恢复学期")),
        courses: s.courses.map(c => attempt(() => ({
          ...c,
          id: id(c.id),
          code: typeof c.code === "string" ? c.code.trim().slice(0, 30) : "",
          name: attempt(() => str(c.name, t("课程名称")), t("课程名称"), t("待恢复课程")),
          links: links(c.links)
        }), t("课程 ") + (c?.name || ""), null)).filter(Boolean)
      };
    }, t("学期 ") + (s?.name || ""), null)).filter(Boolean);
    if (!semesters.length) throw Error(t("没有可恢复的有效学期，请导出原始配置并恢复备份。"));
    let currentSemester = input.currentSemester;
    if (!semesters.some(s => s.id === currentSemester)) {
      if (!recover) throw Error(t("当前学期不存在。"));
      issues.push(t("当前学期不存在，暂时显示第一个有效学期。"));
      currentSemester = semesters[0].id;
    }
    const {sections, sectionOrder, home, ...preferences} = input;
    return {
      ...preferences,
      version: 4,
      folderPathsVersion: 1,
      localFoldersVersion: [ 1, 2 ].includes(input.localFoldersVersion) ? input.localFoldersVersion : 0,
      currentSemester,
      semesters,
      modules
    };
  }
  function getModule(c, value, byType = false) {
    const module = c.modules.find(m => byType ? m.type === value : m.id === value);
    if (!module) throw Error(t("模块已不存在。"));
    return module;
  }
  function saveModule(c, moduleId, values) {
    const existing = moduleId ? getModule(c, moduleId) : null, name = String(values.name || "").trim();
    if (!name || name.length > 200) throw Error(t("请填写有效的模块名称。"));
    if (c.modules.some(m => m.id !== moduleId && m.name === name)) throw Error(t("已有同名模块，请使用不同名称以便区分。"));
    if (!moduleSizes.includes(values.size)) throw Error(t("请选择小、中或宽尺寸。"));
    const heightUnits = values.heightUnits === undefined ? existing?.heightUnits ?? defaultHeight(existing?.type) : Number(values.heightUnits);
    if (!moduleHeights.includes(heightUnits)) throw Error(t("请选择 2、3 或 4 份高度。"));
    const remaining = c.modules.length - (existing ? 1 : 0), position = Number(values.position);
    if (!Number.isInteger(position) || position < 0 || position > remaining) throw Error(t("请选择有效的排列位置。"));
    if (!existing && c.modules.length >= 100) throw Error(t("最多支持 100 个模块。"));
    const module = existing ? {
      ...existing,
      name,
      size: values.size,
      heightUnits
    } : {
      id: uid(),
      type: "shortcuts",
      name,
      size: values.size,
      heightUnits,
      links: []
    };
    if (existing) c.modules.splice(c.modules.findIndex(m => m.id === moduleId), 1);
    c.modules.splice(position, 0, module);
    return module;
  }
  function removeModule(c, moduleId) {
    const module = getModule(c, moduleId);
    if (module.type !== "shortcuts") throw Error(t("学习和 Reader 模块不能删除。"));
    c.modules.splice(c.modules.indexOf(module), 1);
  }
  function restoreConfig(input, options) {
    const result = validateConfig(input, options);
    result.localFoldersVersion = 2;
    return result;
  }
  function shortcutList(c, target) {
    if (target.course) {
      for (const s of c.semesters) {
        const course = s.courses.find(x => x.id === target.course);
        if (course) return course.links;
      }
      throw Error(t("课程已不存在。"));
    }
    return getModule(c, target.module).links;
  }
  function saveShortcut(c, target, values) {
    const source = shortcutList(c, target), existing = target.id ? source.find(e => e.id === target.id) : null;
    if (target.id && !existing) throw Error(t("入口已不存在。"));
    const name = String(values.name || "").trim();
    if (!name) throw Error(t("请填写入口名称。"));
    if (!iconPresets.some(e => e.id === values.icon)) throw Error(t("请选择一个预设图标。"));
    const destination = target.course ? source : shortcutList(c, {
      module: values.module
    });
    const remaining = destination.length - (existing && destination === source ? 1 : 0), position = Number(values.position);
    if (!Number.isInteger(position) || position < 0 || position > remaining) throw Error(t("请选择有效的排列位置。"));
    const entry = setEntryTarget(existing ? {
      ...existing,
      name,
      icon: values.icon
    } : {
      id: uid(),
      name,
      icon: values.icon,
      description: ""
    }, values);
    if (target.course && values.launchRole !== undefined) {
      if (![ "gpt", "note", "folder", "none" ].includes(values.launchRole)) throw Error(t("课程启动用途无效。"));
      entry.launchRole = values.launchRole;
    }
    if (existing) source.splice(source.findIndex(e => e.id === target.id), 1);
    destination.splice(position, 0, entry);
    return entry;
  }
  function removeShortcut(c, target) {
    const list = shortcutList(c, target), index = list.findIndex(e => e.id === target.id);
    if (index < 0) throw Error(t("入口已不存在。"));
    list.splice(index, 1);
  }
  function semesterName(c, value, except) {
    const name = String(value || "").trim();
    if (!name) throw Error(t("请填写学期名称。"));
    if (c.semesters.some(s => s.name === name && s.id !== except)) throw Error(t("已有同名学期。"));
    return name;
  }
  function addSemester(c, value) {
    const name = semesterName(c, value), id = uid();
    c.semesters.push({
      id,
      name,
      courses: []
    });
    c.currentSemester = id;
    return id;
  }
  function renameSemester(c, id, value) {
    const s = c.semesters.find(s => s.id === id);
    if (!s) throw Error(t("学期已不存在。"));
    s.name = semesterName(c, value, id);
  }
  function deleteSemester(c, id) {
    if (c.semesters.length <= 1) throw Error(t("至少保留一个学期。"));
    const index = c.semesters.findIndex(s => s.id === id);
    if (index < 0) throw Error(t("学期已不存在。"));
    c.semesters.splice(index, 1);
    if (c.currentSemester === id) c.currentSemester = c.semesters[Math.min(index, c.semesters.length - 1)].id;
  }
  function moveItem(items, id, offset) {
    const index = items.findIndex(x => x.id === id);
    if (index < 0 || index + offset < 0 || index + offset >= items.length) return false;
    [items[index], items[index + offset]] = [ items[index + offset], items[index] ];
    return true;
  }
  function reorderItem(items, id, beforeId = null) {
    const source = items.findIndex(x => (typeof x === "string" ? x : x.id) === id);
    if (source < 0) throw Error(t("排序对象已不存在。"));
    if (beforeId === id) return false;
    if (beforeId !== null && !items.some(x => (typeof x === "string" ? x : x.id) === beforeId)) throw Error(t("排序位置已不存在。"));
    const next = items.slice(), [item] = next.splice(source, 1), index = beforeId === null ? next.length : next.findIndex(x => (typeof x === "string" ? x : x.id) === beforeId);
    next.splice(index, 0, item);
    if (next.every((x, i) => x === items[i])) return false;
    items.splice(0, items.length, ...next);
    return true;
  }
  function courseLaunchTargets(links, system = deviceSystem()) {
    const targets = [], seen = new Set;
    for (const entry of links) {
      const target = resolveTarget(entry, system);
      if (target.status !== "ready") continue;
      const url = targetUrl(target), parsed = new URL(url);
      let identity;
      if (target.folder) identity = "folder:" + system + ":" + (system === "windows" ? target.path.toLowerCase() : target.path); else if (parsed.protocol === "obsidian:" && parsed.searchParams.get("vault") && parsed.searchParams.get("file")) identity = "note:" + JSON.stringify([ parsed.searchParams.get("vault"), parsed.searchParams.get("file").replace(/\\/g, "/").replace(/\.md$/i, "") ]); else identity = parsed.href.replace(/%[a-f0-9]{2}/gi, part => part.toUpperCase());
      if (seen.has(identity)) continue;
      seen.add(identity);
      targets.push({
        url,
        kind: /^https?:$/.test(parsed.protocol) ? "web" : "external",
        name: entry.name
      });
    }
    return targets;
  }
  // Course plans resolve saved roles and types without guessing from display names.
    function courseEntryRole(course, entry) {
    if (entry.launchRole !== undefined) return entry.launchRole;
    for (const [suffix, role] of [ [ "gpt", "gpt" ], [ "note", "note" ], [ "files", "folder" ] ]) if (entry.id === course.id + "-" + suffix) return role;
    const data = targetData(entry);
    if (data.folderPaths) return "folder";
    if (/^obsidian:\/\/open(?:\/)?\?/i.test(data.url)) return "note";
    if (/^https?:\/\//i.test(data.url)) {
      const url = new URL(data.url);
      if ([ "chatgpt.com", "chat.openai.com" ].includes(url.hostname)) return "gpt";
    }
    return "none";
  }
  function macCourseTargets(course) {
    const select = role => {
      const all = course.links.filter(e => courseEntryRole(course, e) === role), marked = all.filter(e => e.launchRole === role || e.id === course.id + "-" + {
        gpt: "gpt",
        note: "note",
        folder: "files"
      }[role]), chosen = marked.length ? marked : all;
      if (chosen.length > 1) throw Error(t("有多个") + {
        gpt: "GPT",
        note: t("笔记"),
        folder: t("资料")
      }[role] + t("入口，请在编辑中明确课程启动用途。"));
      return chosen[0];
    };
    const gpt = select("gpt"), note = select("note"), folder = select("folder");
    if (!gpt || !gpt.url || !note || !note.url) throw Error(t("请先补充本课程的 GPT 网页和 Obsidian 笔记，并在入口编辑中确认课程启动用途。"));
    const gptTarget = resolveTarget(gpt, "mac"), noteTarget = resolveTarget(note, "mac");
    if (gptTarget.kind !== "web") throw Error(t("GPT 地址必须是 http / https 网页。"));
    if (noteTarget.kind !== "external" || noteTarget.folder || !/^obsidian:/i.test(noteTarget.url || "")) throw Error(t("请填写 Obsidian 的 open 笔记链接。"));
    const obsidianUrl = noteTarget.url, parsed = new URL(obsidianUrl);
    try {
      if (/[\x00-\x1f\x7f-\x9f]/.test(decodeURIComponent(gptTarget.url))) throw Error();
      decodeURIComponent(obsidianUrl);
    } catch {
      throw Error(t("课程链接的参数编码无效或含控制字符。"));
    }
    if (parsed.protocol !== "obsidian:" || parsed.hostname !== "open" || ![ "", "/" ].includes(parsed.pathname) || parsed.hash) throw Error(t("请填写 Obsidian 的 open 笔记链接。"));
    const params = parsed.searchParams, seen = new Set;
    for (const [key, value] of params) {
      if (![ "vault", "file", "path", "paneType" ].includes(key) || seen.has(key) || /[\x00-\x1f\x7f-\x9f]/.test(value)) throw Error(t("笔记链接包含重复、写入或不支持的参数。"));
      seen.add(key);
    }
    if (params.get("path")) normalizeMacPath(params.get("path")); else if (!params.get("vault") || !params.get("file")) throw Error(t("笔记链接需要 vault 和 file，或绝对 path。"));
    if (params.has("paneType") && ![ "tab", "split", "window" ].includes(params.get("paneType"))) throw Error(t("笔记 paneType 无效。"));
    const targets = [ {
      kind: "web",
      url: targetUrl(gptTarget)
    } ];
    let folderTarget;
    if (folder) {
      folderTarget = resolveTarget(folder, "mac");
      if (folderTarget.status === "ready" && !folderTarget.folder) throw Error(t("课程资料入口需要配置本地文件夹；云盘等额外入口可标为“仅单独打开”。"));
    }
    // One top-level application request. Shortcuts opens the unmodified note URI
    // on completion, so a second _self navigation cannot cancel the first one.
        const hasFolder = folderTarget?.status === "ready";
    const url = hasFolder ? "shortcuts://x-callback-url/run-shortcut?name=" + encodeURIComponent(MAC_SHORTCUT) + "&input=text&text=" + encodeURIComponent(folderTarget.path) + "&x-success=" + encodeURIComponent(obsidianUrl) : obsidianUrl;
    if (url.length > 65536) throw Error(t("课程启动地址过长，请缩短链接。"));
    targets.push({
      kind: "external",
      url
    });
    return {
      targets,
      hasFolder
    };
  }
  root.HomeModel = {
    moduleTypes,
    moduleSizes,
    defaultSize,
    moduleRowHeight,
    moduleGap,
    moduleHeight,
    moduleHeights,
    defaultHeight,
    getModule,
    saveModule,
    removeModule,
    get iconPresets() { return iconPresets.map(item => ({...item, name: t(item.name)})); },
    uid,
    MAC_SHORTCUT,
    courseEntryRole,
    macCourseTargets,
    deviceSystem,
    normalizeMacPath,
    targetData,
    setEntryTarget,
    resolveTarget,
    targetUrl,
    normalizeUrl,
    normalizeLocalPath,
    isLocalPath,
    folderUri,
    decodeFolderUri,
    defaultConfig,
    validateConfig,
    restoreConfig,
    shortcutList,
    saveShortcut,
    removeShortcut,
    addSemester,
    renameSemester,
    deleteSemester,
    moveItem,
    reorderItem,
    courseLaunchTargets
  };
})(typeof window === "undefined" ? globalThis : window);
