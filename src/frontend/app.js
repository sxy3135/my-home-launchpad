// Configuration persistence and the existing page, settings and editing flows.
(function() {
  "use strict";
  const M = window.HomeModel, U = window.HomeUI, I = window.HomeInteractions, KEY = "my-home-launchpad.config.v1", SYSTEM = M.deviceSystem();
  const $ = id => document.getElementById(id);
  const icon = window.HomeIcons.create;
  document.documentElement.style.setProperty("--module-row-height", M.moduleRowHeight + "px");
  document.documentElement.style.setProperty("--module-gap", M.moduleGap + "px");
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(label, iconName, handler, cls = "icon-button") {
    const b = el("button", cls);
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    if (iconName) b.append(icon(iconName));
    if (cls.includes("text-button") || !iconName) b.append(document.createTextNode(label));
    if (handler) b.addEventListener("click", handler);
    return b;
  }
  // Restore the current configuration before rendering; persist mutations through commit.
    let config = M.defaultConfig(), editing = false, undoState = null, saveHandler = null, toastTimer = null, externalChange = false;
  let startMessage = "", recoveryBlocked = false, rawConfig = null, editorReturn = null, editorSnapshot = null, editorDirty = null, inlinePending = null;
  const panels = new Map, learningPanel = $("module-learning"), readerPanel = $("module-reading");
  const layout = window.HomeModuleLayout?.create($("module-grid"));
  let renderedSemester = null;
  try {
    const saved = rawConfig = localStorage.getItem(KEY);
    if (saved) {
      const input = JSON.parse(saved);
      const issues = [];
      config = M.restoreConfig(input, {
        recover: true,
        issues
      });
      recoveryBlocked = issues.length > 0;
      if (recoveryBlocked) startMessage = "配置部分异常，已显示可恢复内容。原始存储保留，编辑暂停；请在设置中导出原始配置，修复后导入。";
      if (!recoveryBlocked && JSON.stringify(input) !== JSON.stringify(config)) {
        try {
          localStorage.setItem(KEY, JSON.stringify(config));
        } catch {
          startMessage = "配置升级无法保存，请导出当前配置备份。";
        }
      }
    }
  } catch {
    recoveryBlocked = true;
    startMessage = "已有配置无法读取或浏览器存储不可用。请检查备份，原存储未被覆盖。";
  }
  function toast(message, allowUndo = false, error = false) {
    clearTimeout(toastTimer);
    const box = $("toast");
    box.classList.toggle("is-error", error);
    box.replaceChildren(document.createTextNode(message));
    if (allowUndo && undoState) {
      const b = el("button", "", "撤销");
      b.className = "toast-undo";
      b.onclick = undo;
      box.append(b);
    }
    box.hidden = false;
    toastTimer = setTimeout(() => {
      box.hidden = true;
    }, allowUndo ? 1e4 : 4500);
  }
  function saveStatus(text, warning = false) {
    $("save-status").textContent = text;
    $("save-status").parentElement.classList.toggle("warning", warning);
  }
  function commit(mutator, message = "已保存", undoable = false, replacement = false) {
    if (recoveryBlocked && !replacement) {
      if ($("editor").open) $("form-error").textContent = "编辑已暂停，原始配置已保留。请先导出并恢复备份。";
      toast("编辑已暂停，请先导出原始配置并从备份恢复。", false, true);
      return false;
    }
    if (window.HomeDevice && !window.HomeDevice.unlocked) return false;
    if (externalChange) {
      $("form-error").textContent = "另一标签页已修改配置。草稿仍保留；请关闭窗口后重新编辑。";
      toast("另一标签页已修改配置，请关闭编辑窗口后重新编辑。");
      return false;
    }
    try {
      const next = JSON.parse(JSON.stringify(config));
      mutator(next);
      const valid = M.validateConfig(next);
      const serialized = JSON.stringify(valid);
      localStorage.setItem(KEY, serialized);
      // Commits edit a copy, so the previous configuration is already an undo snapshot.
      undoState = undoable ? config : null;
      config = valid;
      recoveryBlocked = false;
      rawConfig = serialized;
      saveStatus("已保存在此浏览器");
      render();
      toast(message, undoable);
      return true;
    } catch (error) {
      saveStatus("保存失败，请导出备份", true);
      toast(error.message || "无法保存，请检查浏览器存储权限。");
      if ($("editor").open) $("form-error").textContent = error.message || "无法保存。";
      return false;
    }
  }
  function undo() {
    if (!undoState) return;
    const old = undoState;
    commit(c => Object.assign(c, old), "已撤销");
  }
  const semester = () => config.semesters.find(s => s.id === config.currentSemester);
  function findCourse(c, id) {
    for (const s of c.semesters) {
      const course = s.courses.find(x => x.id === id);
      if (course) return {
        semester: s,
        course
      };
    }
    throw Error("课程已不存在。");
  }
  // Single entries and course titles share the model and executor.
    function launchElement(entry, cls, content, editAction) {
    const target = M.resolveTarget(entry, SYSTEM), ready = target.status === "ready", b = el(ready ? "a" : "button", cls + (ready ? "" : " unconfigured"));
    b.title = entry.name + (ready ? "" : " · " + target.message);
    b.setAttribute("aria-label", entry.name + (ready ? "" : target.status === "unsupported" ? "，当前系统不支持" : "，待配置"));
    if (ready) {
      b.href = M.targetUrl(target);
      if (target.kind === "web") { b.target = "_blank"; b.rel = "noopener noreferrer"; }
    } else b.type = "button";
    b.addEventListener("click", event => {
      if (editing) { event.preventDefault(); event.stopPropagation(); editAction(); return; }
      if (!ready) { toast(target.message); if (target.status === "missing") editAction(); return; }
      if (target.folder) {
        event.preventDefault();
        const result = I.openTarget({...target, url: M.targetUrl(target)});
        toast(result === "failed" ? "未能发出打开请求，请检查浏览器权限。" : "已发出打开请求；请在目标应用中确认结果。", false, result === "failed");
      }
    });
    b.addEventListener("auxclick", event => { if (editing) event.preventDefault(); });
    b.append(...content);
    return b;
  }
  const launchAll = I.createLauncher();
  function launchCourse(course) {
    if (editing) { editCourse(course.id); return; }
    if (sorter.active()) return;
    if (SYSTEM === "mac") {
      try {
        const current = findCourse(config, course.id).course, plan = M.macCourseTargets(current), result = launchAll(current.id, plan.targets);
        const message = result.repeat ? "刚刚已请求打开课程，请稍候再试。" : [ result.web ? "已发出 GPT 网页打开请求" : "", result.blocked ? "GPT 网页被拦截，请允许此网站弹出窗口或单独点击 GPT" : "", result.external ? plan.hasFolder ? "已发出资料打开请求，完成后由系统打开 Obsidian 笔记" : "已发出 Obsidian 笔记打开请求；未配置 Mac 资料路径，本次跳过 Finder" : "", result.failed ? "部分请求未能发出，请单独点击对应入口" : "", "网页无法确认应用是否已打开" ].filter(Boolean).join("；") + "。";
        toast(message, false, !!(result.failed || result.blocked));
        return;
      } catch (error) {
        toast(error.message, false, true);
        return;
      }
    }
    const result = launchAll(course.id, M.courseLaunchTargets(course.links));
    if (result.repeat) {
      toast("刚刚已请求打开，请稍候再试。");
      return;
    }
    if (result.empty) {
      toast("这门课程还没有配置入口。");
      return;
    }
    const messages = [];
    if (result.web) messages.push("已请求打开 " + result.web + " 个网页");
    if (result.external) messages.push("已请求启动 " + result.external + " 个应用入口，启动结果无法确认");
    if (result.blocked) messages.push(result.blocked + " 个网页被拦截，请允许弹出窗口或单独点击入口");
    if (result.failed) messages.push(result.failed + " 个入口未能发出请求，请单独点击");
    if (result.external) messages.push("应用未响应时请单独点击入口");
    toast(messages.join("；"));
  }
  // Sorting and keyboard moves stay inside the existing grids.
  function reorder(meta) {
    const candidate = JSON.parse(JSON.stringify(config));
    if (M.reorderItem(candidate.modules, meta.id, meta.beforeId)) {
      if (commit(c => Object.assign(c, candidate), "模块顺序已保存", true)) returnFocus({key: "module:" + meta.id});
    } else toast("顺序未改变");
  }
  const sorter = I.createSorter({
    onDrop: reorder,
    onNotice: toast,
    enabled: () => editing && !recoveryBlocked && !externalChange && !$("settings-dialog").open && !$("editor").open && !$("confirm-dialog").open && !$("semester-manager").open
  });
  function renderModules() {
    const grid = $("module-grid"), previous = new Map(panels);
    panels.clear();
    for (const module of config.modules) {
      let panel = module.type === "learning" ? learningPanel : module.type === "reader" ? readerPanel : previous.get(module.id);
      if (module.type === "shortcuts" && (!panel || panel.dataset.moduleType !== "shortcuts")) {
        panel = el("section", "link-section section-panel");
        const frame = el("div", "module-scroll-frame"), scroller = el("div", "module-scroll"), content = el("div", "module-content");
        scroller.tabIndex = 0;
        content.append(el("div", "section-links"));
        scroller.append(content);
        frame.append(scroller, el("span", "scroll-fade scroll-fade-top"), el("span", "scroll-fade scroll-fade-bottom"));
        frame.querySelectorAll(".scroll-fade").forEach(e => e.setAttribute("aria-hidden", "true"));
        panel.append(el("div", "section-heading"), frame);
      }
      panels.set(module.id, panel);
      panel.id = "module-panel-" + module.id;
      panel.dataset.moduleId = module.id;
      panel.dataset.moduleType = module.type;
      panel.style.setProperty("--module-height-units", String(module.heightUnits));
      panel.className = (module.type === "learning" ? "learning-section" : "link-section") + " section-panel module-size-" + module.size;
      const heading = panel.querySelector(".section-heading"), title = el("h2", "", module.name);
      title.title = module.name;
      panel.querySelector(".module-scroll").setAttribute("aria-label", module.name + "内容");
      title.id = "module-heading-" + module.id;
      panel.setAttribute("aria-labelledby", title.id);
      heading.replaceChildren(title);
      if (editing) {
        const edit = button(module.name, null, () => editModule(module.id), "module-title-edit");
        edit.dataset.focusId = "module:" + module.id;
        title.replaceChildren(edit);
        const trigger = button("模块操作：" + module.name, null, null, "icon-button");
        trigger.textContent = "…";
        trigger.dataset.focusId = "module-menu:" + module.id;
        const move = offset => { if (commit(c => M.moveItem(c.modules, module.id, offset), "模块顺序已保存", true)) returnFocus({key: "module:" + module.id}); };
        const up = button("上移", "up", () => move(-1), "button button-quiet"), down = button("下移", "down", () => move(1), "button button-quiet");
        up.disabled = config.modules.indexOf(module) === 0;
        down.disabled = config.modules.indexOf(module) === config.modules.length - 1;
        const items = [button("添加入口", "plus", () => editLink({module: module.id}), "button button-quiet"), up, down];
        if (module.type === "learning") items.push(button("添加课程", "plus", () => editCourse(), "button button-quiet"), button("学期管理", "calendar", () => $("manage-semesters").click(), "button button-quiet"));
        items.forEach(item => {item.dataset.returnFocusId = trigger.dataset.focusId; item.dataset.focusModule = module.id;});
        heading.append(U.menu({trigger, items, label: module.name + "操作", id: "module-menu-" + module.id}));
      }
      sorter.bindModule(panel);
      const container = panel.querySelector(".section-links");
      renderLinks(module, container);
      grid.append(panel);
    }
    const retained = new Set(panels.values());
    for (const panel of previous.values()) if (!retained.has(panel)) panel.remove();
    sorter.register(grid, config.modules.map(m => ({
      id: m.id,
      element: panels.get(m.id)
    })));
  }
  function editModule(id) {
    const existing = id ? M.getModule(config, id) : null, remaining = config.modules.length - (existing ? 1 : 0);
    const fields = [ field("name", "模块名称", existing?.name || "", {
      required: true
    }), field("size", "桌面宽度", existing?.size || "small", {
      options: [ [ "small", "小 · 1 列" ], [ "medium", "中 · 2 列" ], [ "wide", "宽 · 4 列" ] ],
      hint: "窄屏自动调整列数，保留桌面偏好。"
    }), field("heightUnits", "高度", String(existing?.heightUnits ?? M.defaultHeight("shortcuts")), {
      options: M.moduleHeights.map(units => [ String(units), units + " 份 · " + M.moduleHeight(units) + "px" ]),
      hint: "高度包含网格行间距，不随内容或屏幕变化。整理时统一临时增加 1 行管理空间，完成后恢复。"
    }), field("position", "排列位置", String(existing ? config.modules.indexOf(existing) : remaining), {
      options: Array.from({
        length: remaining + 1
      }, (_, i) => [ String(i), i === remaining ? "最后" : "第 " + (i + 1) + " 位" ])
    }) ];
    if (existing?.type !== "shortcuts" && existing) fields.push(el("p", "field-hint", "此专用模块可改名、调整尺寸和排序，不能复制或删除。"));
    openEditor(existing ? "编辑模块" : "新增模块", fields, values => commit(c => M.saveModule(c, id, values), "模块布局已保存", true), existing?.type === "shortcuts" ? () => removeModule(id) : null);
  }
  async function removeModule(id) {
    const module = M.getModule(config, id);
    if (module.type !== "shortcuts") return false;
    if (!await confirm("删除模块「" + module.name + "」及其中 " + module.links.length + " 个入口？仅移除网页配置，不删除目标文件、笔记或外部数据。", true)) return false;
    const index = config.modules.indexOf(module), next = config.modules[index + 1] || config.modules[index - 1];
    const saved = commit(c => M.removeModule(c, id), "模块已删除", true);
    if (saved && editorReturn) { editorReturn.key = "module:" + next.id; editorReturn.moduleId = next.id; }
    return saved;
  }
  function returnFocus(origin) {
    if (window.HomeDevice && !window.HomeDevice.unlocked) return;
    const target = origin?.key ? [ ...document.querySelectorAll("[data-focus-id]") ].find(e => e.dataset.focusId === origin.key) : origin?.node;
    if (target && document.body.contains(target)) target.focus({
      preventScroll: true
    }); else {
      const panel = origin?.moduleId && panels.get(origin.moduleId);
      const title = panel?.querySelector(".module-title-edit");
      if (title) title.focus({preventScroll: true}); else focusSettings();
    }
  }
  // Dialogs and page rendering.
    async function confirm(message, danger = false) {
    if ($("editor").open) return inlineConfirm(message, danger ? "确认删除" : "确认", "继续编辑", danger);
    U.closeSelect();
    $("confirm-text").textContent = message;
    $("confirm-yes").classList.toggle("danger", danger);
    const origin = {
      node: document.activeElement,
      key: document.activeElement?.dataset.focusId
    };
    const dialog = $("confirm-dialog");
    dialog.showModal();
    return new Promise(resolve => {
      function finish(value) {
        dialog.removeEventListener("cancel", cancel);
        dialog.close();
        returnFocus(origin);
        resolve(value);
      }
      function cancel(event) {
        event.preventDefault();
        finish(false);
      }
      dialog.addEventListener("cancel", cancel);
      $("confirm-yes").onclick = () => finish(true);
      $("confirm-cancel").onclick = () => finish(false);
    });
  }
  function render() {
    const offsets = layout?.snapshot(), semesterChanged = renderedSemester !== null && renderedSemester !== config.currentSemester;
    renderedSemester = config.currentSemester;
    sorter.reset();
    U.closeSelect();
    document.body.classList.toggle("editing", editing);
    $("edit-button").setAttribute("aria-pressed", String(editing));
    $("edit-label").textContent = editing ? "完成整理" : "整理";
    $("settings-button").classList.toggle("is-editing", editing);
    $("settings-button").setAttribute("aria-label", editing ? "设置，正在整理" : "设置");
    $("settings-button").title = editing ? "设置 · 正在整理" : "设置";
    const picker = U.select({
      id: "semester-select",
      label: "当前学期",
      options: config.semesters.map(s => [ s.id, s.name ]),
      value: config.currentSemester,
      icon,
      compact: true,
      onChange: value => {
        if (commit(c => {
          c.currentSemester = value;
        }, "已切换学期")) $("semester-select-button").focus();
      }
    });
    $("semester-picker").replaceChildren(picker.element);
    if ($("semester-manager").open) renderSemesterManager();
    renderModules();
    $("layout-toolbar").hidden = !editing;
    $("config-recovery").hidden = !recoveryBlocked;
    $("config-recovery").textContent = recoveryBlocked ? "配置需要恢复：编辑已暂停，原始数据未被覆盖。请在齿轮设置中导出原始配置，修复后导入备份。" : "";
    const s = semester();
    $("course-count").textContent = s.courses.length + " 门课程";
    const container = $("courses");
    container.replaceChildren();
    if (!s.courses.length) {
      const box = el("div", "empty");
      box.append(el("p", "", "这个学期还没有课程。"), button("添加第一门课程", "plus", () => editCourse(), "text-button editing-only"));
      container.append(box);
    }
    s.courses.forEach(course => {
      const card = el("article", "course-card");
      const head = el("div", "course-head");
      const title = el("h3", "course-title"), launch = button(SYSTEM === "mac" ? "打开 " + course.name + " 的 GPT、资料和 Obsidian 笔记；其他入口可单独点击" : "打开 " + course.name + " 的全部已配置入口", null, () => launchCourse(course), "course-launch");
      launch.textContent = course.name;
      launch.title = course.name + " · " + launch.title;
      title.append(launch);
      head.append(title);
      launch.dataset.focusId = "course:" + course.id;
      launch.dataset.focusModule = config.modules.find(m => m.type === "learning").id;
      card.addEventListener("click", event => {
        if (editing && !event.target.closest("button") && !event.target.closest("a")) editCourse(course.id);
      });
      card.append(head);
      const links = el("div", "course-links");
      const primary = new Set;
      for (const role of ["note", "gpt", "folder"]) {
        const entry = course.links.find(e => M.courseEntryRole(course, e) === role);
        if (entry) primary.add(entry.id);
      }
      for (const entry of course.links) if (primary.size < 3) primary.add(entry.id);
      const visible = course.links.filter(e => primary.has(e.id));
      for (const entry of visible) {
        const wrap = el("div", "course-link-wrap");
        const shortName = {
          "主笔记": "笔记",
          "GPT 项目": "GPT",
          "课程资料": "资料"
        }[entry.name] || entry.name;
        const b = launchElement(entry, "course-link" + (M.resolveTarget(entry, SYSTEM).status === "ready" ? "" : " missing"), [ icon(entry.icon), el("span", "course-link-label", shortName) ], () => editCourse(course.id, entry.id));
        b.classList.remove("unconfigured");
        wrap.append(b);
        b.dataset.focusId = "course-entry:" + entry.id;
        b.dataset.focusModule = launch.dataset.focusModule;
        links.append(wrap);
      }
      {
        const more = course.links.filter(e => !primary.has(e.id));
        if (more.length) {
          const trigger = button("更多课程入口（" + more.length + " 个）", "down", null, "icon-button course-more");
          trigger.dataset.focusId = "course-more:" + course.id;
          const items = more.map(entry => {
            const item = launchElement(entry, "course-link", [icon(entry.icon), document.createTextNode(entry.name)], () => editCourse(course.id, entry.id));
            item.dataset.focusId = "course-entry:" + entry.id; item.dataset.returnFocusId = trigger.dataset.focusId; item.dataset.focusModule = launch.dataset.focusModule;
            return item;
          });
          head.append(U.menu({trigger, items, label: course.name + "的其他入口", id: "course-more-" + course.id}));
        }
      }
      card.append(links);
      container.append(card);
    });
    layout?.restore(offsets, semesterChanged ? learningPanel : null);
  }
  function entryContent(entry) {
    const mark = el("span", "entry-icon");
    mark.append(icon(entry.icon));
    const title = el("strong", "entry-title", entry.name);
    title.title = entry.name;
    return [ mark, title ];
  }
  function renderLinks(module, container) {
    const moduleId = module.id;
    container.replaceChildren();
    const items = module.links;
    for (const entry of items) {
      if (module.type === "reader" && entry.id === "readwise") continue;
      const wrap = el("div", "section-item"), target = {
        module: moduleId,
        id: entry.id
      };
      const surface = el("div", "entry-surface");
      const link = launchElement(entry, "entry-link", entryContent(entry), () => editLink(target));
      link.dataset.focusId = "entry:" + entry.id;
      link.dataset.focusModule = moduleId;
      surface.append(link);
      wrap.append(surface);
      const status = M.resolveTarget(entry, SYSTEM).status;
      if (status !== "ready") wrap.append(el("span", "entry-status", status === "unsupported" ? "不支持" : "待配置"));
      container.append(wrap);
    }
    container.hidden = !container.children.length && module.type !== "shortcuts";
    if (module.type === "reader") {
      const home = items.find(e => e.id === "readwise") || items.find(e => e.url === "https://read.readwise.io/");
      const anchor = panels.get(moduleId).querySelector(".reader-home");
      anchor.dataset.focusId = "entry:" + (home?.id || "reader-home");
      anchor.dataset.focusModule = moduleId;
      anchor.href = home?.url || "https://read.readwise.io/";
      anchor.onauxclick = event => { if (editing) event.preventDefault(); };
      anchor.onclick = event => {
        if (editing) {
          event.preventDefault();
          editLink({module: moduleId, ...(home ? {id: home.id} : {})});
        }
      };
    }
    if (!items.length && module.type === "shortcuts") {
      if (editing) {
        const add = button("添加第一个入口", "plus", () => editLink({module: moduleId}), "entry-link empty-entry");
        add.append(el("span", "entry-title", "添加第一个入口"));
        container.append(add);
      } else container.append(el("p", "module-empty", "暂无入口"));
    }
  }
  async function removeLink(target) {
    const entry = M.shortcutList(config, target).find(link => link.id === target.id);
    if (await confirm("删除「" + entry.name + "」入口？", true)) return commit(c => M.removeShortcut(c, target), "入口已删除", true);
    return false;
  }
  async function removeCourse(id) {
    const {course} = findCourse(config, id);
    if (!await confirm("删除「" + course.name + "」及其入口？仅移除网页入口，资料和笔记会保留。", true)) return false;
    return commit(c => {
      const x = findCourse(c, id);
      x.semester.courses = x.semester.courses.filter(k => k.id !== id);
    }, "课程已删除", true);
  }
  // Reusable form controls, target fields and entry/course editing.
    function field(name, label, value = "", options = {}) {
    const wrap = el("div", "field"), lab = el("label", "", label);
    let input;
    if (options.options) {
      const select = U.select({
        id: "field-" + name,
        name,
        label,
        options: options.options,
        value,
        icon,
        onChange: options.onChange
      });
      input = select.element;
      lab.htmlFor = "field-" + name + "-button";
    } else {
      input = el("input");
      input.type = "text";
      input.maxLength = options.max || 200;
      input.placeholder = options.placeholder || "";
      input.autocomplete = "off";
      input.id = "field-" + name;
      input.name = name;
      input.value = value;
      if (options.required) input.required = true;
      lab.htmlFor = input.id;
    }
    wrap.append(lab, input);
    if (options.hint) wrap.append(el("div", "field-hint", options.hint));
    return wrap;
  }
  function iconField(value) {
    const set = el("fieldset", "icon-fieldset");
    set.append(el("legend", "", "预设图标"));
    const grid = el("div", "icon-grid");
    const selected = M.iconPresets.some(p => p.id === value) ? value : "link";
    for (const preset of M.iconPresets) {
      const label = el("label", "icon-option"), input = el("input", "sr-only");
      input.type = "radio";
      input.name = "icon";
      input.value = preset.id;
      input.checked = preset.id === selected;
      input.required = true;
      const choice = el("span", "icon-choice");
      choice.append(icon(preset.id), el("span", "", preset.name));
      label.append(input, choice);
      grid.append(label);
    }
    set.append(grid);
    return set;
  }
  function openEditor(title, fields, onSave, onDelete) {
    editorReturn = {
      node: document.activeElement,
      key: document.activeElement?.dataset.returnFocusId || document.activeElement?.dataset.focusId,
      moduleId: document.activeElement?.dataset.focusModule || document.activeElement?.closest(".section-panel")?.dataset.moduleId
    };
    sorter.cancel();
    U.closeSelect();
    $("dialog-title").textContent = title;
    $("editor-fields").replaceChildren(...fields);
    $("form-error").textContent = "";
    saveHandler = onSave;
    editorDirty = null;
    settleInline(false);
    const deletion = $("editor-delete");
    deletion.hidden = !onDelete;
    deletion.disabled = false;
    deletion.onclick = onDelete ? async () => {
      deletion.disabled = true;
      try {
        if (await onDelete()) closeEditor();
      } finally {
        deletion.disabled = false;
      }
    } : null;
    $("editor").showModal();
    editorSnapshot = editorValues();
  }
  function targetFields(prefix, label, entry, {preferFolder = false} = {}) {
    const data = M.targetData(entry), folder = !!data.folderPaths || preferFolder && !data.url, box = el("fieldset", "target-fieldset");
    box.append(el("legend", "", label));
    const url = field(prefix, "网址 / Obsidian 链接", data.url || "", {
      max: 8192,
      placeholder: "https://… 或 obsidian://open?…"
    }), pathBox = el("div", "folder-path-fields");
    const windows = field(prefix + "-windows", "Windows 文件夹路径", data.folderPaths?.windows || "", {
      max: 2048,
      placeholder: "C:\\课程\\资料"
    }), mac = field(prefix + "-mac", "Mac 文件夹路径", data.folderPaths?.mac || "", {
      max: 4096,
      placeholder: "/Users/用户名/Documents/课程资料"
    });
    const selected = SYSTEM === "mac" ? "mac" : "windows";
    const switchPath = system => {
      windows.hidden = system !== "windows";
      mac.hidden = system !== "mac";
    };
    const systemField = field(prefix + "-system", "查看和编辑路径", selected, {
      options: [ [ "windows", "Windows" ], [ "mac", "Mac" ] ],
      onChange: switchPath
    });
    switchPath(selected);
    pathBox.append(systemField, windows, mac, el("p", "field-hint", "两套路径分别保存，名称与图标共用。切换系统不会修改另一套路径。"));
    if (SYSTEM === "unsupported") pathBox.append(el("p", "field-hint", "当前系统不支持打开本地资料。可填写路径后在 Mac 或 Windows 使用。"));
    const feedback = el("p", "field-hint");
    feedback.setAttribute("role", "status");
    const test = button("测试打开", null, () => {
      try {
        const values = Object.fromEntries(new FormData($("editor-form"))), draft = readTargetFields(entry, values, prefix), target = M.resolveTarget(draft, SYSTEM);
        if (target.status !== "ready") {
          feedback.textContent = target.message;
          return;
        }
        if (values[prefix + "-system"] !== SYSTEM) {
          feedback.textContent = "请切换到当前设备的 " + (SYSTEM === "mac" ? "Mac" : "Windows") + " 路径再测试。";
          return;
        }
        const result = I.openTarget({
          ...target,
          url: M.targetUrl(target)
        });
        feedback.textContent = result === "failed" ? "未能发出打开请求。" : "已发出打开请求；网页无法确认是否打开，请查看 Finder 或资源管理器。";
      } catch (error) {
        feedback.textContent = error.message;
      }
    }, "button button-secondary");
    pathBox.append(test, button("Mac 设置说明", null, openMacSetup, "button button-quiet"), feedback);
    const changeKind = kind => {
      url.hidden = kind !== "url";
      pathBox.hidden = kind !== "folder";
      feedback.textContent = "";
    };
    box.append(field(prefix + "-kind", "入口类型", folder ? "folder" : "url", {
      options: [ [ "url", "网址 / Obsidian" ], [ "folder", "本地资料文件夹" ] ],
      onChange: changeKind
    }), url, pathBox);
    changeKind(folder ? "folder" : "url");
    return box;
  }
  function readTargetFields(entry, values, prefix) {
    return M.setEntryTarget(entry, values[prefix + "-kind"] === "folder" ? {
      folderPaths: {
        windows: values[prefix + "-windows"] || "",
        mac: values[prefix + "-mac"] || ""
      }
    } : {
      url: values[prefix] || ""
    });
  }
  function openMacSetup() {
    sorter.cancel();
    U.closeSelect();
    $("mac-folder-dialog").showModal();
  }
  function closeEditor() {
    U.closeSelect();
    $("editor").close();
    saveHandler = null;
    editorSnapshot = editorDirty = null;
    settleInline(false);
    returnFocus(editorReturn);
    editorReturn = null;
    if (externalChange) {
      externalChange = false;
      try {
        const saved = localStorage.getItem(KEY);
        config = M.restoreConfig(JSON.parse(saved));
        recoveryBlocked = false;
        rawConfig = saved;
        undoState = null;
        render();
      } catch {
        toast("无法读取最新配置，请刷新页面。");
      }
    }
  }
  function entryFields(existing, course = false) {
    return [field(course ? "entry-name" : "name", "入口名称", existing?.name || "", {required: true}),
      targetFields("url", "打开目标", existing || {url: ""}, {preferFolder: existing?.icon === "folder"}),
      ...(course ? [courseRoleField("launchRole", existing?.launchRole ?? "none")] : []), iconField(existing?.icon || "link")];
  }
  function entryValues(existing, values, course = false) {
    return {...values, name: values[course ? "entry-name" : "name"], ...M.targetData(readTargetFields(existing || {}, values, "url"))};
  }
  function positionOptions(length) {
    return Array.from({length: length + 1}, (_, i) => [String(i), i === 0 ? "第一位" : i === length ? "最后" : "第 " + (i + 1) + " 位"]);
  }
  function editLink(target) {
    if (target.course) return editCourse(target.course, target.id);
    const source = M.shortcutList(config, target), existing = target.id ? source.find(e => e.id === target.id) : null;
    const fields = entryFields(existing), row = el("div", "field-row");
    const positions = module => positionOptions(M.getModule(config, module).links.filter(e => e.id !== existing?.id).length);
    let positionField = field("position", "排列位置", String(existing ? source.indexOf(existing) : source.length), {options: positions(target.module)});
    row.append(field("module", "所属模块", target.module, {
      options: config.modules.map(m => [m.id, m.name]),
      onChange: module => {
        const next = field("position", "排列位置", String(M.getModule(config, module).links.filter(e => e.id !== existing?.id).length), {options: positions(module)});
        positionField.replaceWith(next); positionField = next;
      }
    }), positionField);
    fields.push(row);
    openEditor(existing ? "编辑入口" : "添加入口", fields,
      values => commit(c => M.saveShortcut(c, target, entryValues(existing, values)), "入口已保存"), existing ? () => removeLink(target) : null);
  }
  function editCourse(courseId, focusLinkId) {
    const existing = courseId ? findCourse(config, courseId).course : null;
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : {id: M.uid(), name: "", code: "", links: [
      {id: M.uid(), name: "主笔记", icon: "note", url: "", description: "", launchRole: "note"},
      {id: M.uid(), name: "GPT 项目", icon: "chat", url: "", description: "", launchRole: "gpt"},
      {id: M.uid(), name: "课程资料", icon: "folder", url: "", description: "", launchRole: "folder"}]};
    const draftConfig = {semesters: [{courses: [draft]}]}, originalDraft = JSON.stringify(draft);
    let selected = focusLinkId || draft.links[0]?.id, selectionSnapshot;
    const list = el("div", "course-draft-list"), detail = el("div", "course-draft-fields");
    const initialSemester = existing ? findCourse(config, courseId).semester.id : config.currentSemester;
    const positions = id => positionOptions(config.semesters.find(s => s.id === id).courses.filter(c => c.id !== courseId).length);
    let position = field("position", "排列位置", String(existing ? findCourse(config, courseId).semester.courses.indexOf(existing) : semester().courses.length), {options: positions(initialSemester)});
    const row = el("div", "field-row");
    row.append(field("semester", "所属学期", initialSemester, {options: config.semesters.map(s => [s.id, s.name]), onChange: id => {
      const next = field("position", "排列位置", String(config.semesters.find(s => s.id === id).courses.filter(c => c.id !== courseId).length), {options: positions(id)});
      position.replaceWith(next); position = next;
    }}), position);
    function flush() {
      if (!selected || selectionValues() === selectionSnapshot) return;
      const entry = draft.links.find(e => e.id === selected), values = Object.fromEntries(new FormData($("editor-form")));
      M.saveShortcut(draftConfig, {course: draft.id, id: selected}, {...entryValues(entry, values, true), position: draft.links.indexOf(entry)});
    }
    function act(fn) {
      try { flush(); fn(); renderEntries(); $("form-error").textContent = ""; detail.querySelector("input")?.focus({preventScroll: true}); }
      catch (error) { $("form-error").textContent = error.message; }
    }
    function renderEntries() {
      list.replaceChildren(); detail.replaceChildren();
      draft.links.forEach((entry, i) => {
        const wrap = el("div", "draft-entry-row"), select = button(entry.name, null, () => act(() => {selected = entry.id;}), "button button-secondary draft-entry-select");
        select.dataset.entryId = entry.id;
        select.setAttribute("aria-pressed", String(selected === entry.id));
        const up = button("上移入口", "up", () => act(() => M.moveItem(draft.links, entry.id, -1)));
        const down = button("下移入口", "down", () => act(() => M.moveItem(draft.links, entry.id, 1)));
        up.disabled = i === 0; down.disabled = i === draft.links.length - 1;
        const remove = button("从课程草稿删除入口", "trash", () => {
          // Removal affects only this draft; cancelling the course restores every entry.
          if (selected !== entry.id) { try { flush(); } catch (error) { $("form-error").textContent = error.message; return; } }
          draft.links = draft.links.filter(e => e.id !== entry.id);
          if (selected === entry.id) selected = draft.links[Math.min(i, draft.links.length - 1)]?.id;
          renderEntries();
          list.querySelectorAll(".draft-entry-select").find(b => b.dataset.entryId === selected)?.focus({preventScroll: true});
        }, "icon-button danger");
        wrap.append(select, up, down, remove); list.append(wrap);
      });
      const entry = draft.links.find(e => e.id === selected);
      if (entry) detail.append(...entryFields({...entry, launchRole: M.courseEntryRole(draft, entry)}, true));
      else detail.append(el("p", "field-hint", "尚无内部入口，可添加入口。"));
      selectionSnapshot = selectionValues();
    }
    function selectionValues() { return JSON.stringify([...new FormData($("editor-form"))].filter(([name]) => !["name", "semester", "position"].includes(name))); }
    const add = button("添加课程入口", "plus", () => act(() => {
      const entry = {id: M.uid(), name: "新入口", icon: "link", url: "", description: "", launchRole: "none"};
      draft.links.push(entry); selected = entry.id;
    }), "button button-secondary text-button");
    openEditor(existing ? "编辑课程" : "添加课程", [field("name", "课程名称", draft.name, {required: true}), row, el("h3", "", "课程内部入口"), list, add, detail], values => {
      flush();
      const name = String(values.name || "").trim();
      if (!name) throw Error("请填写课程名称。");
      const position = Number(values.position);
      return commit(c => {
        const destination = c.semesters.find(s => s.id === values.semester);
        if (!destination) throw Error("请选择有效学期。");
        if (existing) { const loc = findCourse(c, courseId); loc.semester.courses = loc.semester.courses.filter(x => x.id !== courseId); }
        if (!Number.isInteger(position) || position < 0 || position > destination.courses.length) throw Error("请选择有效的排列位置。");
        destination.courses.splice(position, 0, {...draft, name});
      }, "课程已保存");
    }, existing ? () => removeCourse(courseId) : null);
    renderEntries();
    const headerSnapshot = JSON.stringify([...new FormData($("editor-form"))].filter(([name]) => ["name", "semester", "position"].includes(name)));
    editorDirty = () => JSON.stringify(draft) !== originalDraft || selectionValues() !== selectionSnapshot || headerSnapshot !== JSON.stringify([...new FormData($("editor-form"))].filter(([name]) => ["name", "semester", "position"].includes(name)));
    editorSnapshot = editorValues();
    if (focusLinkId) $("field-entry-name")?.focus();
  }
  function editorValues() { return JSON.stringify([...new FormData($("editor-form"))]); }
  function settleInline(value) {
    const pending = inlinePending; inlinePending = null;
    $("editor-confirm")?.remove();
    $("editor-fields").inert = false;
    if (pending) { pending.origin?.focus({preventScroll: true}); pending.resolve(value); }
  }
  function inlineConfirm(message, yes = "确认", no = "取消", danger = false) {
    U.closeSelect();
    if (inlinePending) return Promise.resolve(false);
    const box = el("section", "editor-confirm"); box.id = "editor-confirm"; box.setAttribute("role", "alert");
    const accept = button(yes, null, () => settleInline(true), "button" + (danger ? " danger" : "")); accept.id = "editor-confirm-yes";
    const cancel = button(no, null, () => settleInline(false), "button button-secondary"); cancel.id = "editor-confirm-cancel";
    box.append(el("p", "", message), accept, cancel);
    $("editor-fields").inert = true;
    $("editor-form").append(box);
    return new Promise(resolve => {inlinePending = {resolve, origin: document.activeElement}; cancel.focus();});
  }
  async function requestCloseEditor() {
    if (inlinePending) { settleInline(false); return; }
    if (editorDirty ? editorDirty() : editorValues() !== editorSnapshot) {
      if (!await inlineConfirm("有未保存的修改。放弃后不会改变已保存配置。", "放弃修改", "继续编辑")) return;
    }
    closeEditor();
  }
  // Semester management uses the same configuration and save path.
    async function removeSemester(id) {
    const selected = config.semesters.find(s => s.id === id);
    if (!selected) return false;
    if (config.semesters.length <= 1) {
      toast("至少保留一个学期。");
      return false;
    }
    if (await confirm("删除「" + selected.name + "」及其中 " + selected.courses.length + " 门课程的入口？原笔记和云盘文件不会被删除。", true)) return commit(c => M.deleteSemester(c, id), "学期已删除", true);
    return false;
  }
  function editSemester(id) {
    const existing = id ? config.semesters.find(s => s.id === id) : null;
    const fields = [ field("name", "学期名称", existing?.name || "", {
      required: true,
      placeholder: "例如 示例学期"
    }) ];
    openEditor(existing ? "重命名学期" : "新增学期", fields, values => commit(c => existing ? M.renameSemester(c, id, values.name) : M.addSemester(c, values.name), existing ? "学期已更新" : "新学期已创建"), existing && config.semesters.length > 1 ? () => removeSemester(id) : null);
  }
  function renderSemesterManager() {
    const list = $("semester-list");
    list.replaceChildren();
    for (const s of config.semesters) {
      const row = el("div", "semester-row"), info = el("div", "semester-info"), name = el("div", "semester-name");
      name.append(el("strong", "", s.name));
      if (s.id === config.currentSemester) name.append(el("span", "current-semester", "当前"));
      info.append(name, el("span", "semester-count", s.courses.length + " 门课程"));
      const actions = el("div", "semester-row-actions");
      actions.append(button("改名", "edit", () => editSemester(s.id), "text-button"));
      const deletion = button("删除", "trash", () => removeSemester(s.id), "text-button danger");
      deletion.disabled = config.semesters.length <= 1;
      if (deletion.disabled) deletion.title = "至少保留一个学期";
      actions.append(deletion);
      row.append(info, actions);
      list.append(row);
    }
  }
  function closeSettings() {
    if ($("settings-dialog").open) $("settings-dialog").close();
    $("settings-button").setAttribute("aria-expanded", "false");
  }
  function courseRoleField(name, value) {
    return field(name, "Mac 课程启动用途", value, {
      options: [ [ "none", "仅单独打开" ], [ "gpt", "GPT 网页" ], [ "note", "Obsidian 笔记" ], [ "folder", "资料文件夹" ] ],
      hint: "仅用于 Mac 点击课程标题；入口名称、单次打开及 Windows 批量打开不变。"
    });
  }
  function focusSettings() {
    if (window.HomeDevice && !window.HomeDevice.unlocked) return;
    if (![ ...document.querySelectorAll("dialog") ].some(d => d.open)) $("settings-button").focus({
      preventScroll: true
    });
  }
  // Bind the existing settings, backup and editing flows.
    $("settings-button").onclick = () => {
    sorter.cancel();
    U.closeSelect();
    $("settings-dialog").showModal();
    $("settings-button").setAttribute("aria-expanded", "true");
  };
  $("settings-close").onclick = () => {
    closeSettings();
    focusSettings();
  };
  $("settings-dialog").addEventListener("cancel", event => {
    event.preventDefault();
    closeSettings();
    focusSettings();
  });
  $("settings-dialog").addEventListener("close", () => {
    closeSettings();
    focusSettings();
  });
  $("settings-dialog").addEventListener("click", event => {
    if (event.target !== $("settings-dialog")) return;
    const r = event.target.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
      closeSettings();
      focusSettings();
    }
  });
  // Close the parent before a child opens or a user-gesture action runs.
    for (const id of [ "edit-button", "manage-semesters", "appearance-button", "mac-folder-settings", "export-button", "import-button", "connection-settings" ]) $(id).addEventListener("click", closeSettings);
  for (const id of [ "semester-manager", "appearance-dialog", "mac-folder-dialog" ]) $(id).addEventListener("close", focusSettings);
  $("edit-button").onclick = () => {
    if (recoveryBlocked) {
      toast("请先导出原始配置并恢复备份。", false, true);
      return;
    }
    if ($("editor").open || sorter.active()) { toast("请先保存或取消当前编辑／拖动。"); return; }
    editing = !editing;
    render();
    focusSettings();
  };
  $("windows-folder-tool").hidden = SYSTEM !== "windows";
  $("mac-folder-settings").onclick = openMacSetup;
  $("mac-folder-close").onclick = $("mac-folder-done").onclick = () => {
    $("mac-folder-dialog").close();
  };
  $("mac-folder-dialog").addEventListener("cancel", () => U.closeSelect());
  $("mac-folder-copy").onclick = async () => {
    const script = $("mac-folder-script"), status = $("mac-folder-copy-status");
    try {
      if (!window.navigator?.clipboard?.writeText) throw Error("Clipboard unavailable");
      await window.navigator.clipboard.writeText(script.value);
      status.textContent = "脚本已复制。";
    } catch {
      script.focus();
      script.select?.();
      status.textContent = "请在脚本框中按 ⌘A、⌘C 复制完整脚本。";
    }
  };
  $("add-module").onclick = () => editModule();
  $("finish-editing").onclick = () => {
    if ($("editor").open || sorter.active()) { toast("请先保存或取消当前编辑／拖动。"); return; }
    editing = false;
    render();
    focusSettings();
  };
  $("new-semester").onclick = () => editSemester();
  $("manage-semesters").onclick = () => {
    U.closeSelect();
    renderSemesterManager();
    $("semester-manager").showModal();
  };
  $("close-semester-manager").onclick = () => $("semester-manager").close();
  $("done-semesters").onclick = () => $("semester-manager").close();
  $("close-dialog").onclick = requestCloseEditor;
  $("cancel-dialog").onclick = requestCloseEditor;
  $("editor").addEventListener("cancel", event => {
    event.preventDefault();
    requestCloseEditor();
  });
  $("editor-form").onsubmit = event => {
    event.preventDefault();
    if (inlinePending) return;
    try {
      const values = Object.fromEntries(new FormData(event.target));
      if (saveHandler?.(values)) closeEditor();
    } catch (error) {
      $("form-error").textContent = error.message;
    }
  };
  $("export-button").onclick = () => {
    const blob = new Blob([ recoveryBlocked && rawConfig !== null ? rawConfig : JSON.stringify(config, null, 2) ], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = "my-home-config-" + (new Date).toISOString().slice(0, 10) + ".json";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    toast(recoveryBlocked ? "原始配置已导出，请修复后重新导入。" : "配置已导出");
  };
  $("import-button").onclick = () => {
    $("import-file").value = "";
    $("import-file").click();
  };
  $("import-file").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw Error("配置文件不能超过 2 MB。");
      const imported = M.restoreConfig(JSON.parse(await file.text()));
      if (await confirm("导入将替换当前配置（" + imported.modules.length + " 个模块、" + imported.semesters.length + " 个学期）。请先导出" + (recoveryBlocked ? "原始配置" : "当前配置") + "备份。")) commit(c => Object.assign(c, imported), "配置已导入", !recoveryBlocked, true);
    } catch (error) {
      toast("导入失败：" + (error instanceof SyntaxError ? "文件不是有效 JSON。" : error.message), false, true);
    }
  };
  window.addEventListener("storage", event => {
    if (window.HomeDevice && !window.HomeDevice.unlocked) return;
    if (event.key !== KEY || !event.newValue) return;
    sorter.cancel();
    try {
      const next = M.restoreConfig(JSON.parse(event.newValue));
      if ($("editor").open) {
        externalChange = true;
        toast("另一标签页已更新配置。请关闭编辑窗口后重新编辑。");
      } else {
        config = next;
        recoveryBlocked = false;
        rawConfig = event.newValue;
        undoState = null;
        render();
        toast("已加载另一标签页的修改");
      }
    } catch {
      recoveryBlocked = true;
      rawConfig = event.newValue;
      editing = false;
      render();
      toast("另一标签页的配置无法读取。请导出原始配置并恢复备份。", false, true);
    }
  });
  window.addEventListener("myhome:lock", () => {
    sorter.reset();
    U.closeSelect();
    closeSettings();
    clearTimeout(toastTimer);
    saveHandler = null;
    editorSnapshot = editorDirty = null;
    settleInline(false);
    undoState = null;
    document.querySelectorAll("dialog").forEach(d => {
      if (d.open) d.close();
    });
    for (const id of [ "module-grid", "editor-fields", "semester-list" ]) $(id).replaceChildren();
    $("layout-toolbar").hidden = true;
    $("toast").hidden = true;
    $("search-query").value = "";
    document.body.classList.remove("editing");
  });
  document.querySelectorAll("[data-icon]").forEach(e => {
    if (!e.children.length) e.append(...icon(e.dataset.icon).childNodes);
  });
  render();
  window.performance?.mark?.("myhome:links-ready");
  if (startMessage) {
    saveStatus("请检查配置备份", true);
    toast(startMessage);
  }
})();
