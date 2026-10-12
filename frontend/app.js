// const API_URL = "http://localhost:5000";
const API_URL = "https://casestudy-dsrv.onrender.com";

let mode = "login";

function setMode(newMode) {
  mode = newMode;
  const isLogin = mode === "login";

  document.getElementById("tab-login").classList.toggle("active", isLogin);
  document.getElementById("tab-register").classList.toggle("active", !isLogin);
  document.getElementById("name-field").hidden = isLogin;

  document.getElementById("title").innerText = isLogin
    ? "Welcome back"
    : "Create your account";
  document.getElementById("subtitle").innerText = isLogin
    ? "Sign in to your staff account."
    : "Register a new staff account.";
  document.getElementById("submit-btn").innerText = isLogin
    ? "Sign in"
    : "Create account";
  document.getElementById("message").innerText = "";
}

function submitForm() {
  if (mode === "login") {
    login();
  } else {
    register();
  }
}

async function register() {
  const name = document.getElementById("name").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_URL}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    const data = await response.json();

    document.getElementById("message").innerText =
      data.message || "Registration complete";
  } catch (error) {
    document.getElementById("message").innerText = "Cannot connect to server";
  }
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    const response = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    if (data.token) {
      localStorage.setItem("token", data.token);
      window.location.href = "dashboard.html";
    } else {
      document.getElementById("message").innerText =
        data.message || "Login failed";
    }
  } catch (error) {
    document.getElementById("message").innerText = "Cannot connect to server";
  }
}


/* =====================================================================
   Dashboard (dashboard.html)
   ===================================================================== */

function logout() {
  localStorage.removeItem("token");
  window.location.href = "index.html";
}

function initDashboard() {
  /* Breadcrumb + sidebar highlight follow the section being read */
  (function () {
    const sections = [...document.querySelectorAll(".section")];
    const links = [...document.querySelectorAll("[data-nav]")];
    const crumb = document.getElementById("crumb-current");
    function setActive(id) {
      links.forEach((a) => a.classList.toggle("active", a.dataset.nav === id));
      const s = document.getElementById(id);
      if (s) crumb.textContent = s.dataset.title;
    }
    function onScroll() {
      const line = window.innerHeight * 0.3;
      let current = sections[0].id;
      sections.forEach((s) => { if (s.getBoundingClientRect().top <= line) current = s.id; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1].id;
      setActive(current);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
  })();

  /* Cash / GCash tabs */
  document.querySelectorAll("[data-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on);
        document.getElementById("panel-" + t.dataset.tab).hidden = !on;
      });
    });
  });

  /* Cash calculation: only arithmetic on what the user types */
  (function () {
    const due = document.getElementById("cash-due");
    const rec = document.getElementById("cash-received");
    const out = { due: calcId("calc-due"), rec: calcId("calc-received"), chg: calcId("calc-change") };
    function calcId(id) { return document.getElementById(id); }
    const fmt = (n) => "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    function update() {
      const d = parseFloat(due.value), r = parseFloat(rec.value);
      out.due.textContent = isNaN(d) ? "—" : fmt(d);
      out.rec.textContent = isNaN(r) ? "—" : fmt(r);
      out.chg.textContent = isNaN(d) || isNaN(r) || r < d ? "—" : fmt(r - d);
    }
    due.addEventListener("input", update);
    rec.addEventListener("input", update);
  })();

  /* Enable the submit buttons once required fields are filled */
  function bindSubmit(btnId, fieldIds) {
    const btn = document.getElementById(btnId);
    const fields = fieldIds.map((id) => document.getElementById(id));
    const check = () => { btn.disabled = !fields.every((f) => f.value.trim() !== ""); };
    fields.forEach((f) => { f.addEventListener("input", check); f.addEventListener("change", check); });
    check();
  }
  bindSubmit("cash-submit", ["cash-member", "cash-purpose", "cash-due", "cash-received", "cash-date"]);
  bindSubmit("g-submit", ["g-member", "g-purpose", "g-amount", "g-date"]);

  /* Hide an empty state as soon as its table gets rows (call syncEmpty() after you add data) */
  function syncEmpty() {
    document.querySelectorAll(".records").forEach((box) => {
      const body = box.querySelector("tbody");
      const empty = box.querySelector(".empty");
      if (body && empty) empty.hidden = body.children.length > 0;
    });
  }
  function syncGymEmpty() {
    const list = document.getElementById("in-gym-list");
    document.querySelector(".records-empty").hidden = list.children.length > 0;
  }
  new MutationObserver(syncGymEmpty).observe(document.getElementById("in-gym-list"), { childList: true });
  document.querySelectorAll("tbody").forEach((b) => new MutationObserver(syncEmpty).observe(b, { childList: true }));
  syncEmpty();
}

/* ---------- Data layer: members + payments, stored in MongoDB through the backend ----------
   test.members  <- /api/members
   test.payments <- /api/payments                                                          */
async function api(path, options) {
  options = options || {};
  const token = localStorage.getItem("token");
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new Error("Cannot connect to server.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (response.status === 401) {
    logout(); // token missing or expired -> back to the sign-in page
    throw new Error("Your session expired. Please sign in again.");
  }
  if (!response.ok) {
    throw new Error((data && data.message) || "Something went wrong.");
  }
  return data;
}

/* Shows the full name the user typed when creating their account (it is stored in the login token). */
function showStaffName() {
  const target = document.getElementById("staff-name");
  if (!target) return;
  try {
    const payload = localStorage.getItem("token").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    const user = JSON.parse(new TextDecoder().decode(bytes));
    if (user && typeof user.name === "string" && user.name.trim()) {
      target.textContent = user.name.trim();
      target.title = user.name.trim();
    }
  } catch (e) {
    /* keep the default label */
  }
}

function initData() {
  const $ = (id) => document.getElementById(id);
  const STATUS = { active: "Active", inactive: "Inactive", expired: "Expired" };
  const PAY_STATUS = { paid: "Paid", pending: "Pending", cancelled: "Cancelled" };
  const METHOD = { cash: "Cash", gcash: "GCash" };

  let members = [];
  let payments = [];
  let checkins = [];
  let syncNote = "Connecting to database…";
  let noteTimer = null;
  let membersState = "loading"; // loading | ready | error
  let loadMessage = "";
  let pendingDeleteId = null;
  let gcashPayment = null;
  const emptyQr = $("qr-output").innerHTML; // the static "No QR generated" markup

  /* ----- small helpers ----- */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(id, size) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "i");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  function button(label, cls, onClick) {
    const b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function iconButton(iconId, label, cls, onClick) {
    const b = el("button", "icon-btn " + (cls || ""));
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.appendChild(icon(iconId, 16));
    b.addEventListener("click", onClick);
    return b;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  };
  const nowLocalInput = () => {
    const d = new Date();
    return todayISO() + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };
  const fmtDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  };
  const fmtDateTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
  };
  const num = (n) => Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = (n) => "₱" + num(n);
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  const sameDay = (iso, d) => {
    const x = new Date(iso);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth() && x.getDate() === d.getDate();
  };
  const sum = (list) => list.reduce((t, p) => t + p.amount, 0);
  // A member is "expired" when their status is active but the expiry date has passed.
  function memberState(m) {
    if (m.status !== "active") return "inactive";
    if (m.expiresAt && m.expiresAt < todayISO()) return "expired";
    return "active";
  }

  function daysLeft(iso) {
    const today = new Date(todayISO() + "T00:00:00");
    const end = new Date(iso + "T00:00:00");
    return Math.round((end - today) / 86400000);
  }

  function expiryNote(iso) {
    const d = daysLeft(iso);
    if (d < 0) return "expired " + plural(-d, "day", "days") + " ago";
    if (d === 0) return "expires today";
    return plural(d, "day", "days") + " left";
  }

  // Add n months to a YYYY-MM-DD date, clamping to the end of shorter months (Jan 31 + 1 month = Feb 28).
  function addMonths(iso, n) {
    const parts = iso.split("-").map(Number);
    const total = parts[0] * 12 + (parts[1] - 1) + n;
    const year = Math.floor(total / 12);
    const month = total % 12;
    const lastDay = new Date(year, month + 1, 0).getDate();
    return year + "-" + pad(month + 1) + "-" + pad(Math.min(parts[2], lastDay));
  }

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "—" : d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  };

  // Footer note under the Member directory ("Synced with MongoDB", or a short error)
  function setSyncNote(text) {
    syncNote = text;
    $("members-footer-note").textContent = text;
    $("members-footer-note").classList.remove("note-error");
  }

  function flashNote(text) {
    const note = $("members-footer-note");
    note.textContent = text;
    note.classList.add("note-error");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => setSyncNote(syncNote), 5000);
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((n) => { n.textContent = value; });
  }

  function poke(id) {
    $(id).dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* ----- dialogs ----- */
  function openDialog(d) {
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }

  function closeDialog(d) {
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
  }

  document.querySelectorAll("dialog.modal").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d) closeDialog(d);
    });
  });
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.addEventListener("click", () => closeDialog(b.closest("dialog")));
  });

  /* =====================================================================
     MEMBERS
     ===================================================================== */
  function visibleMembers() {
    const q = $("member-search").value.trim().toLowerCase();
    const status = $("member-status-filter").value;
    return members
      .filter((m) => {
        if (!status) return true;
        const state = memberState(m);
        if (status === "expiring") return state === "active" && m.expiresAt && daysLeft(m.expiresAt) <= 7;
        return state === status;
      })
      .filter((m) => !q || [m.name, m.email, m.phone, m.plan].some((v) => (v || "").toLowerCase().includes(q)));
  }

  function memberRow(m) {
    const tr = document.createElement("tr");

    const who = el("td");
    const person = el("div", "person");
    person.appendChild(el("span", "avatar", initials(m.name)));
    const info = el("div");
    info.appendChild(el("b", "", m.name));
    info.appendChild(el("small", "", m.email || "No email"));
    person.appendChild(info);
    who.appendChild(person);
    tr.appendChild(who);

    tr.appendChild(el("td", "", m.phone || "—"));
    tr.appendChild(el("td", "", m.plan || "—"));

    const st = el("td");
    const stCell = el("div", "status-cell");
    const state = memberState(m);
    stCell.appendChild(el("span", "pill status-" + state, STATUS[state]));
    const sw = el("button", "switch");
    const nextLabel = m.status === "active" ? "inactive" : "active";
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-checked", String(m.status === "active"));
    sw.setAttribute("aria-label", "Mark " + m.name + " as " + nextLabel);
    sw.title = "Mark as " + nextLabel;
    sw.addEventListener("click", () => toggleStatus(m, sw));
    stCell.appendChild(sw);
    st.appendChild(stCell);
    tr.appendChild(st);

    tr.appendChild(el("td", "", fmtDate(m.joined)));

    const exp = el("td", "", m.expiresAt ? fmtDate(m.expiresAt) : "—");
    if (m.expiresAt) {
      exp.title = "Membership " + expiryNote(m.expiresAt);
      if (state === "expired") exp.className = "expiry-past";
      else if (state === "active" && daysLeft(m.expiresAt) <= 7) exp.className = "expiry-soon";
    }
    tr.appendChild(exp);

    const actions = el("td");
    const wrap = el("div", "row-actions");
    wrap.appendChild(button("View", "btn btn-outline btn-sm", () => showDetails(m)));
    wrap.appendChild(iconButton("i-trash", "Delete " + m.name, "danger", () => askDelete(m)));
    actions.appendChild(wrap);
    tr.appendChild(actions);
    return tr;
  }

  function updateMemberSummaries() {
    const month = todayISO().slice(0, 7);
    const active = members.filter((m) => memberState(m) === "active").length;
    const joinedThisMonth = members.filter((m) => (m.joined || "").slice(0, 7) === month).length;
    const ready = membersState === "ready";
    const show = (n) => (ready ? String(n) : "");

    setText('[data-field="members-total"]', show(members.length));
    setText('[data-field="members-active"]', show(active));
    setText('[data-field="members-inactive"]', show(members.length - active));
    setText('[data-field="members-new"]', show(joinedThisMonth));
    // the same figures feed the Analytics and Dashboard cards
    setText('[data-field="total-members"]', show(members.length));
    setText('[data-field="active-memberships"]', show(active));
    setText('[data-field="new-members"]', show(joinedThisMonth));
    $("members-count").textContent = ready && members.length ? plural(members.length, "member", "members") : "";
    $("hint-members").hidden = !ready || members.length > 0;
  }

  function fillMemberSelects() {
    ["cash-member", "g-member"].forEach((id) => {
      const sel = $(id);
      const current = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      members.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
      const stillThere = members.some((m) => m.id === current);
      sel.value = stillThere ? current : "";
      if (!stillThere && current) sel.dispatchEvent(new Event("change"));
    });
  }

  function renderMembers() {
    const list = visibleMembers();
    const body = $("members-body");
    body.replaceChildren();
    list.forEach((m) => body.appendChild(memberRow(m)));

    let title, text;
    if (membersState === "loading") {
      title = "Loading members…";
      text = "The server may take up to a minute to wake up.";
    } else if (membersState === "error") {
      title = "Couldn't load members";
      text = loadMessage + " Refresh the page to try again.";
    } else if (members.length === 0) {
      title = "No members yet";
      text = "Add your first member to build the directory.";
    } else {
      title = "No matching members";
      text = "Try a different search or status filter.";
    }
    $("members-empty-title").textContent = title;
    $("members-empty-text").textContent = text;
    $("members-card").querySelector(".empty").hidden = list.length > 0;
    $("members-footer-count").textContent = members.length ? "Showing " + list.length + " of " + members.length : "";

    updateMemberSummaries();
    fillMemberSelects();
    renderCheckins();
  }

  /* ----- switch a member between active and inactive ----- */
  async function toggleStatus(m, sw) {
    const next = m.status === "active" ? "inactive" : "active";
    sw.disabled = true;
    try {
      const data = await api("/api/members/" + encodeURIComponent(m.id) + "/status", { method: "PATCH", body: { status: next } });
      members = members.map((x) => (x.id === m.id ? data.member : x));
      renderMembers();
    } catch (err) {
      sw.disabled = false;
      flashNote("Couldn't update status: " + err.message);
    }
  }

  /* ----- add member ----- */
  /* ----- membership plan: a dropdown you can also type in ----- */
  const planInput = $("m-plan");
  const planList = $("plan-list");
  const planItems = Array.from(planList.querySelectorAll("li"));
  let planActive = -1;

  function markPlanItems() {
    const typed = planInput.value.trim().toLowerCase();
    planItems.forEach((li, i) => {
      li.classList.toggle("is-current", li.dataset.value.toLowerCase() === typed);
      li.classList.toggle("is-active", i === planActive);
      li.setAttribute("aria-selected", i === planActive ? "true" : "false");
    });
  }

  function openPlanList() {
    planList.hidden = false;
    planInput.setAttribute("aria-expanded", "true");
    markPlanItems();
  }

  function closePlanList() {
    planList.hidden = true;
    planInput.setAttribute("aria-expanded", "false");
    planActive = -1;
  }

  function choosePlan(i) {
    const value = planItems[i].dataset.value;
    planInput.value = value;
    closePlanList();
    planInput.focus();
    if (value === "Others") planInput.select(); // so you can type your own name straight away
  }

  planItems.forEach((li, i) => {
    li.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
    li.addEventListener("click", () => choosePlan(i));
    li.addEventListener("mousemove", () => { planActive = i; markPlanItems(); });
  });
  $("plan-toggle").addEventListener("mousedown", (e) => e.preventDefault());
  $("plan-toggle").addEventListener("click", () => {
    if (planList.hidden) { openPlanList(); planInput.focus(); } else closePlanList();
  });
  planInput.addEventListener("focus", openPlanList);
  planInput.addEventListener("click", openPlanList);
  planInput.addEventListener("input", closePlanList); // typing your own plan: get the list out of the way
  planInput.addEventListener("blur", closePlanList);
  planInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (planList.hidden) openPlanList();
      planActive = e.key === "ArrowDown" ? Math.min(planItems.length - 1, planActive + 1) : Math.max(0, planActive - 1);
      markPlanItems();
    } else if (e.key === "Enter" && !planList.hidden && planActive >= 0) {
      e.preventDefault();
      choosePlan(planActive);
    } else if (e.key === "Escape" && !planList.hidden) {
      e.preventDefault(); // close just the list, not the whole dialog
      e.stopPropagation();
      closePlanList();
    }
  });

  // One form, two modes: add a member, or edit an existing one.
  let editingId = null;

  function openMemberForm(m) {
    editingId = m ? m.id : null;
    $("member-form").reset();
    closePlanList();
    $("add-title").textContent = m ? "Edit member" : "Add member";
    $("add-desc").textContent = m ? "Update this member's details, plan or expiry date." : "Enter the member's details. Fields marked * are required.";
    $("member-submit-label").textContent = m ? "Save changes" : "Save member";
    $("m-status-field").hidden = Boolean(m); // status has its own switch in the directory
    $("m-checkin-row").hidden = Boolean(m);
    if (m) {
      $("m-name").value = m.name;
      $("m-email").value = m.email || "";
      $("m-phone").value = m.phone || "";
      $("m-plan").value = m.plan || "";
      $("m-joined").value = m.joined || "";
      $("m-expires").value = m.expiresAt || "";
      $("m-notes").value = m.notes || "";
    } else {
      $("m-joined").value = todayISO();
    }
    syncCheckinBox();
    $("member-error").textContent = "";
    openDialog($("add-dialog"));
    $("m-name").focus();
  }

  $("add-member-btn").addEventListener("click", () => openMemberForm(null));

  // quick-set buttons for the expiry date
  document.querySelectorAll("[data-extend]").forEach((b) => {
    b.addEventListener("click", () => {
      const kind = b.dataset.extend;
      if (kind === "none") {
        $("m-expires").value = "";
      } else {
        const current = $("m-expires").value;
        const base = current && current > todayISO() ? current : todayISO();
        $("m-expires").value = addMonths(base, kind === "1y" ? 12 : 1);
      }
      syncCheckinBox();
    });
  });

  function syncCheckinBox() {
    const box = $("m-checkin");
    const expired = $("m-expires").value && $("m-expires").value < todayISO();
    const inactive = $("m-status").value !== "active" || Boolean(expired);
    const wasDisabled = box.disabled;
    box.disabled = inactive;
    if (inactive) box.checked = false;
    else if (wasDisabled) box.checked = true; // back to active: restore the default
  }
  $("m-status").addEventListener("change", syncCheckinBox);
  $("m-expires").addEventListener("input", syncCheckinBox);
  $("m-expires").addEventListener("change", syncCheckinBox);

  $("member-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = $("member-error");
    const submit = e.target.querySelector('button[type="submit"]');
    const name = $("m-name").value.trim().replace(/\s+/g, " ");
    const email = $("m-email").value.trim();
    const joined = $("m-joined").value || todayISO();
    const expiresAt = $("m-expires").value;

    if (!name) {
      error.textContent = "Please enter the member's full name.";
      return;
    }
    if (email && members.some((m) => m.id !== editingId && (m.email || "").toLowerCase() === email.toLowerCase())) {
      error.textContent = "A member with this email address already exists.";
      return;
    }
    if (expiresAt && expiresAt < joined) {
      error.textContent = "The expiry date can't be before the join date.";
      return;
    }

    const fields = {
      name: name,
      email: email,
      phone: $("m-phone").value.trim(),
      plan: $("m-plan").value.trim(),
      joined: joined,
      expiresAt: expiresAt,
      notes: $("m-notes").value.trim(),
    };

    error.textContent = "";
    submit.disabled = true;
    try {
      if (editingId) {
        const data = await api("/api/members/" + encodeURIComponent(editingId), { method: "PATCH", body: fields });
        members = members.map((x) => (x.id === editingId ? data.member : x));
        // someone inside the gym keeps showing under their new name
        checkins = checkins.map((c) => (c.member === editingId && !c.checkOutAt ? Object.assign({}, c, { memberName: data.member.name }) : c));
      } else {
        const data = await api("/api/members", {
          method: "POST",
          body: Object.assign({}, fields, {
            status: $("m-status").value,
            checkIn: $("m-checkin").checked && $("m-status").value === "active" && !(expiresAt && expiresAt < todayISO()),
          }),
        });
        members.unshift(data.member);
        if (data.checkin) checkins.unshift(data.checkin);
      }
      renderMembers();
      closeDialog($("add-dialog"));
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  /* ----- member details ----- */
  function showDetails(m) {
    $("md-avatar").textContent = initials(m.name);
    $("md-name").textContent = m.name;
    const badge = $("md-status");
    const state = memberState(m);
    badge.textContent = STATUS[state];
    badge.className = "pill status-" + state;
    $("md-email").textContent = m.email || "—";
    $("md-phone").textContent = m.phone || "—";
    $("md-plan").textContent = m.plan || "—";
    $("md-joined").textContent = fmtDate(m.joined);
    $("md-expires").textContent = m.expiresAt ? fmtDate(m.expiresAt) + " (" + expiryNote(m.expiresAt) + ")" : "No expiry date";
    $("md-notes").textContent = m.notes || "—";
    $("md-edit").onclick = () => {
      closeDialog($("details-dialog"));
      openMemberForm(m);
    };
    $("md-delete").onclick = () => {
      closeDialog($("details-dialog"));
      askDelete(m);
    };
    openDialog($("details-dialog"));
  }

  /* ----- delete member ----- */
  function askDelete(m) {
    pendingDeleteId = m.id;
    $("confirm-name").textContent = m.name;
    $("confirm-error").textContent = "";
    openDialog($("confirm-dialog"));
  }

  $("confirm-delete").addEventListener("click", async () => {
    if (!pendingDeleteId) return;
    const btn = $("confirm-delete");
    btn.disabled = true;
    try {
      await api("/api/members/" + encodeURIComponent(pendingDeleteId), { method: "DELETE" });
      const goneId = pendingDeleteId;
      members = members.filter((m) => m.id !== goneId);
      checkins = checkins.map((c) => (c.member === goneId && !c.checkOutAt ? Object.assign({}, c, { checkOutAt: new Date().toISOString() }) : c));
      pendingDeleteId = null;
      renderMembers();
      closeDialog($("confirm-dialog"));
    } catch (err) {
      $("confirm-error").textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $("member-search").addEventListener("input", renderMembers);
  $("member-status-filter").addEventListener("change", renderMembers);

  /* =====================================================================
     CHECK-INS (Dashboard: "Recent check-ins" and "Members in gym")
     ===================================================================== */
  function renderCheckins() {
    const now = new Date();
    const open = checkins.filter((c) => !c.checkOutAt);
    const today = checkins.filter((c) => sameDay(c.checkInAt, now));
    const ready = membersState === "ready";

    // Recent check-ins: today's visits, newest first
    const body = $("checkins-body");
    body.replaceChildren();
    today.forEach((c) => {
      const tr = document.createElement("tr");
      tr.appendChild(el("td", "", c.memberName));
      tr.appendChild(el("td", "", fmtTime(c.checkInAt)));
      tr.appendChild(el("td", "", c.checkOutAt ? fmtTime(c.checkOutAt) : "—"));
      const st = el("td");
      st.appendChild(el("span", "pill " + (c.checkOutAt ? "status-inactive" : "status-active"), c.checkOutAt ? "Checked out" : "In gym"));
      tr.appendChild(st);
      body.appendChild(tr);
    });
    setText('[data-field="checkins-count"]', today.length ? plural(today.length, "check-in", "check-ins") : "");
    setText('[data-field="checkins-context"]', today.length ? "Newest first" : "");

    // cards
    setText('[data-field="members-in-gym"]', ready ? String(open.length) : "");
    setText('[data-field="todays-checkins"]', ready ? String(today.length) : "");
    setText('[data-field="present-count"]', open.length ? open.length + " present" : "");

    // Members in gym: who is inside right now
    const list = $("in-gym-list");
    list.replaceChildren();
    open.forEach((c) => {
      const li = el("li", "gym-item");
      const person = el("div", "person");
      person.appendChild(el("span", "avatar", initials(c.memberName)));
      const info = el("div");
      info.appendChild(el("b", "", c.memberName));
      info.appendChild(el("small", "", "Checked in " + fmtTime(c.checkInAt)));
      person.appendChild(info);
      li.appendChild(person);
      const out = el("button", "btn btn-outline btn-sm", "Check out");
      out.type = "button";
      out.addEventListener("click", () => checkOut(c.id, out));
      li.appendChild(out);
      list.appendChild(li);
    });
    document.querySelector(".records-empty").hidden = open.length > 0;

    // picker: active members who are not already inside
    const sel = $("checkin-member");
    const current = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    const inside = new Set(open.map((c) => c.member));
    members
      .filter((m) => memberState(m) === "active" && !inside.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
      });
    sel.value = Array.from(sel.options).some((o) => o.value === current) ? current : "";
    $("checkin-btn").disabled = !sel.value;
  }

  $("checkin-member").addEventListener("change", () => {
    $("checkin-btn").disabled = !$("checkin-member").value;
  });

  $("checkin-btn").addEventListener("click", async () => {
    const btn = $("checkin-btn");
    const error = $("checkin-error");
    const memberId = $("checkin-member").value;
    if (!memberId) return;
    error.textContent = "";
    btn.disabled = true;
    try {
      const data = await api("/api/checkins", { method: "POST", body: { memberId: memberId } });
      checkins.unshift(data.checkin);
      renderCheckins();
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = !$("checkin-member").value;
    }
  });

  async function checkOut(id, btn) {
    const error = $("checkin-error");
    error.textContent = "";
    btn.disabled = true;
    try {
      const data = await api("/api/checkins/" + encodeURIComponent(id) + "/checkout", { method: "PATCH" });
      checkins = checkins.map((c) => (c.id === id ? data.checkin : c));
      renderCheckins();
    } catch (err) {
      error.textContent = err.message;
      btn.disabled = false;
    }
  }

  /* =====================================================================
     PAYMENTS
     ===================================================================== */
  const paidPayments = () => payments.filter((p) => p.status === "paid");

  function paymentRow(p, withStatus) {
    const tr = document.createElement("tr");
    tr.appendChild(el("td", "", p.memberName));
    tr.appendChild(el("td", "", p.purpose));
    tr.appendChild(el("td", "", METHOD[p.method] || p.method));
    tr.appendChild(el("td", "", num(p.amount)));
    tr.appendChild(el("td", "", fmtDateTime(p.paidAt)));
    tr.appendChild(el("td", "", p.reference));

    if (withStatus) {
      const td = el("td");
      const cell = el("div", "status-cell");
      cell.appendChild(el("span", "pill status-" + p.status, PAY_STATUS[p.status] || p.status));
      if (p.status === "pending") {
        cell.appendChild(iconButton("i-check", "Mark as paid", "ok", () => updateStatus(p.id, "paid")));
        cell.appendChild(iconButton("i-x", "Cancel payment", "danger", () => updateStatus(p.id, "cancelled")));
      }
      td.appendChild(cell);
      tr.appendChild(td);
    }
    return tr;
  }

  function renderTrend(list) {
    const box = $("payments-chart");
    const old = box.querySelector("svg.trend");
    if (old) old.remove();
    box.querySelector(".empty").hidden = list.length > 0;
    $("trend-sub").textContent = list.length ? "Recorded payments over the last 7 days." : "Chart requires recorded payments.";
    if (!list.length) return;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    const totals = days.map((d) => sum(list.filter((p) => sameDay(p.paidAt, d))));
    const max = Math.max.apply(null, totals) || 1;

    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "trend");
    svg.setAttribute("viewBox", "0 0 560 200");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Payments recorded in the last 7 days");
    const add = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
      if (text !== undefined) n.textContent = text;
      svg.appendChild(n);
    };
    add("line", { x1: 10, x2: 550, y1: 156, y2: 156 });
    days.forEach((d, i) => {
      const cx = 40 + i * 80;
      const h = totals[i] ? Math.max(3, (totals[i] / max) * 120) : 0;
      if (h) add("rect", { x: cx - 22, y: 156 - h, width: 44, height: h, rx: 5 });
      if (totals[i]) add("text", { x: cx, y: 150 - h, class: "val" }, totals[i].toLocaleString("en-PH", { maximumFractionDigits: 0 }));
      add("text", { x: cx, y: 176 }, d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }));
    });
    box.insertBefore(svg, box.querySelector(".rule"));
  }

  function renderPayments() {
    const paid = paidPayments();
    const cash = paid.filter((p) => p.method === "cash");
    const gcash = paid.filter((p) => p.method === "gcash");
    const total = sum(paid);
    const today = new Date();
    const todayPaid = paid.filter((p) => sameDay(p.paidAt, today));
    const todayCash = todayPaid.filter((p) => p.method === "cash");
    const todayGcash = todayPaid.filter((p) => p.method === "gcash");

    // Payment history (Payment Methods section)
    const history = $("payment-history-body");
    history.replaceChildren();
    payments.forEach((p) => history.appendChild(paymentRow(p, true)));
    setText('[data-field="history-count"]', payments.length ? plural(payments.length, "record", "records") : "");
    setText('[data-field="history-context"]', payments.length ? "Newest first" : "");

    // Dashboard cards
    setText('[data-field="todays-payments"]', money(sum(todayPaid)));
    setText('[data-field="today-total"]', money(sum(todayPaid)));
    setText('[data-field="today-cash-count"]', plural(todayCash.length, "payment", "payments"));
    setText('[data-field="today-cash-total"]', money(sum(todayCash)));
    setText('[data-field="today-gcash-count"]', plural(todayGcash.length, "payment", "payments"));
    setText('[data-field="today-gcash-total"]', money(sum(todayGcash)));

    // Analytics cards
    setText('[data-field="total-recorded"]', money(total));
    setText('[data-field="cash-total"]', money(sum(cash)));
    setText('[data-field="gcash-total"]', money(sum(gcash)));
    setText('[data-field="total-records"]', String(paid.length));
    setText('[data-field="breakdown-cash-total"]', money(sum(cash)));
    setText('[data-field="breakdown-gcash-total"]', money(sum(gcash)));
    setText('[data-field="breakdown-cash-count"]', plural(cash.length, "payment", "payments"));
    setText('[data-field="breakdown-gcash-count"]', plural(gcash.length, "payment", "payments"));
    document.querySelector('[data-field="breakdown-cash-bar"]').style.width = total ? (sum(cash) / total) * 100 + "%" : "0";
    document.querySelector('[data-field="breakdown-gcash-bar"]').style.width = total ? (sum(gcash) / total) * 100 + "%" : "0";
    renderTrend(paid);

    // All payment records (Analytics section)
    const q = $("filter-member").value.trim().toLowerCase();
    const method = $("filter-method").value;
    const rows = payments.filter((p) => (!method || p.method === method) && (!q || p.memberName.toLowerCase().includes(q)));
    const all = $("all-records-body");
    all.replaceChildren();
    rows.forEach((p) => all.appendChild(paymentRow(p, false)));
    $("records-empty-title").textContent = payments.length ? "No matching payments" : "No payments recorded";
    $("records-empty-text").textContent = payments.length
      ? "Try a different member name or method."
      : "Record a cash payment or GCash payment to build your transaction history.";
    setText('[data-field="records-count"]', payments.length ? plural(payments.length, "record", "records") : "");
    setText('[data-field="records-footer-count"]', payments.length ? "Showing " + rows.length + " of " + payments.length : "");
    setText('[data-field="records-footer-context"]', payments.length ? "Newest first" : "");
  }

  $("filter-member").addEventListener("input", renderPayments);
  $("filter-method").addEventListener("change", renderPayments);

  /* ----- cash payment ----- */
  function resetCashForm() {
    ["cash-purpose", "cash-due", "cash-received", "cash-notes"].forEach((id) => { $(id).value = ""; });
    $("cash-member").value = "";
    $("cash-date").value = nowLocalInput();
    ["cash-due", "cash-received", "cash-purpose", "cash-date"].forEach(poke);
    $("cash-member").dispatchEvent(new Event("change"));
  }

  $("cash-submit").addEventListener("click", async () => {
    const btn = $("cash-submit");
    const error = $("cash-error");
    const ok = $("cash-msg");
    const amount = Number($("cash-due").value);
    const received = Number($("cash-received").value);
    error.textContent = "";
    ok.textContent = "";

    if (!(amount > 0)) {
      error.textContent = "Enter a payment amount greater than zero.";
      return;
    }
    if (received < amount) {
      error.textContent = "Cash received is less than the amount due.";
      return;
    }

    btn.disabled = true;
    try {
      const data = await api("/api/payments", {
        method: "POST",
        body: {
          method: "cash",
          memberId: $("cash-member").value,
          purpose: $("cash-purpose").value.trim(),
          amount: amount,
          cashReceived: received,
          paidAt: new Date($("cash-date").value).toISOString(),
          notes: $("cash-notes").value.trim(),
        },
      });
      payments.unshift(data.payment);
      renderPayments();
      resetCashForm();
      ok.textContent = "Payment recorded · " + data.payment.reference;
    } catch (err) {
      error.textContent = err.message;
      poke("cash-due"); // re-evaluate the button state
    }
  });

  /* ----- GCash payment (demo) ----- */
  function demoQr(seed) {
    const N = 25;
    const ns = "http://www.w3.org/2000/svg";
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const rnd = () => {
      h ^= h << 13; h >>>= 0;
      h ^= h >>> 17;
      h ^= h << 5; h >>>= 0;
      return h / 4294967296;
    };
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "demo-qr");
    svg.setAttribute("viewBox", "0 0 " + N + " " + N);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Demo QR code, not scannable");
    const corners = [[0, 0], [N - 7, 0], [0, N - 7]];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        let on = null;
        for (let c = 0; c < corners.length; c++) {
          const rx = x - corners[c][0];
          const ry = y - corners[c][1];
          if (rx >= -1 && rx <= 7 && ry >= -1 && ry <= 7) {
            on = rx >= 0 && rx <= 6 && ry >= 0 && ry <= 6 &&
              (rx === 0 || rx === 6 || ry === 0 || ry === 6 || (rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4));
            break;
          }
        }
        if (on === null) on = rnd() > 0.55;
        if (on) {
          const r = document.createElementNS(ns, "rect");
          r.setAttribute("x", x);
          r.setAttribute("y", y);
          r.setAttribute("width", 1);
          r.setAttribute("height", 1);
          r.setAttribute("fill", "#112218");
          svg.appendChild(r);
        }
      }
    }
    return svg;
  }

  function showQr(p) {
    gcashPayment = p;
    const box = $("qr-output");
    box.replaceChildren();
    box.appendChild(demoQr(p.reference));
    box.appendChild(el("h3", "", "Demo QR generated"));
    box.appendChild(el("p", "", p.memberName + " · " + money(p.amount)));
    box.appendChild(el("p", "hint", "Reference " + p.reference + " · Pending"));
    const actions = el("div", "qr-actions");
    actions.appendChild(button("Mark as paid", "btn btn-primary btn-sm", () => updateStatus(p.id, "paid")));
    actions.appendChild(button("Cancel", "btn btn-outline btn-sm", () => updateStatus(p.id, "cancelled")));
    box.appendChild(actions);
  }

  function showQrDone(p) {
    const box = $("qr-output");
    box.replaceChildren();
    const ic = el("span", "empty-icon");
    ic.appendChild(icon("i-check", 23));
    box.appendChild(ic);
    box.appendChild(el("h3", "", "Payment recorded"));
    box.appendChild(el("p", "", p.memberName + " · " + money(p.amount)));
    box.appendChild(el("p", "hint", "Reference " + p.reference));
  }

  function resetGcashForm() {
    ["g-purpose", "g-amount", "g-notes"].forEach((id) => { $(id).value = ""; });
    $("g-member").value = "";
    $("g-date").value = nowLocalInput();
    ["g-amount", "g-purpose", "g-date"].forEach(poke);
    $("g-member").dispatchEvent(new Event("change"));
  }

  $("g-submit").addEventListener("click", async () => {
    const btn = $("g-submit");
    const error = $("g-error");
    const amount = Number($("g-amount").value);
    error.textContent = "";

    if (!(amount > 0)) {
      error.textContent = "Enter a payment amount greater than zero.";
      return;
    }

    btn.disabled = true;
    try {
      const data = await api("/api/payments", {
        method: "POST",
        body: {
          method: "gcash",
          memberId: $("g-member").value,
          purpose: $("g-purpose").value.trim(),
          amount: amount,
          paidAt: new Date($("g-date").value).toISOString(),
          notes: $("g-notes").value.trim(),
        },
      });
      payments.unshift(data.payment);
      renderPayments();
      showQr(data.payment);
      resetGcashForm();
    } catch (err) {
      error.textContent = err.message;
      poke("g-amount");
    }
  });

  async function updateStatus(id, status) {
    try {
      const data = await api("/api/payments/" + encodeURIComponent(id) + "/status", { method: "PATCH", body: { status: status } });
      payments = payments.map((p) => (p.id === id ? data.payment : p));
      renderPayments();
      if (gcashPayment && gcashPayment.id === id) {
        if (status === "paid") showQrDone(data.payment);
        else $("qr-output").innerHTML = emptyQr;
        gcashPayment = null;
      }
    } catch (err) {
      $("g-error").textContent = err.message;
    }
  }

  /* =====================================================================
     START: set defaults, then load everything from the database
     ===================================================================== */
  $("cash-date").value = nowLocalInput();
  $("g-date").value = nowLocalInput();
  poke("cash-date");
  poke("g-date");

  renderMembers();
  renderPayments();

  // check-ins load separately, so a problem there never hides members or payments
  const checkinsRequest = api("/api/checkins")
    .then((r) => r.checkins || [])
    .catch((err) => {
      $("checkin-error").textContent = "Couldn't load check-ins: " + err.message;
      return [];
    });

  Promise.all([api("/api/members"), api("/api/payments"), checkinsRequest])
    .then((results) => {
      members = results[0].members || [];
      payments = results[1].payments || [];
      checkins = results[2];
      membersState = "ready";
      setSyncNote("Synced with MongoDB");
      setText('[data-field="analytics-status"]', "Synced with MongoDB");
    })
    .catch((err) => {
      membersState = "error";
      loadMessage = err.message;
      setSyncNote("Not connected");
      setText('[data-field="analytics-status"]', "Not connected: " + err.message);
    })
    .then(() => {
      renderMembers();
      renderPayments();
    });
}

if (document.body && document.body.classList.contains("dashboard")) {
  if (!localStorage.getItem("token")) {
    window.location.replace("index.html"); // not signed in
  } else {
    showStaffName();
    initDashboard();
    initData();
  }
}
