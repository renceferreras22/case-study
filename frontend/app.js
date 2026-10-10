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

/* ---------- Members: add / delete / search / details ----------
   Records are kept in this browser (localStorage). To use your own backend later,
   replace loadMembers() and saveMembers() inside initMembers(). */
function initMembers() {
  const KEY = "vitalfit_members";
  const STATUS = { active: "Active", inactive: "Inactive" };
  const $ = (id) => document.getElementById(id);
  let members = loadMembers();
  let pendingDeleteId = null;

  function loadMembers() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function saveMembers() {
    try {
      localStorage.setItem(KEY, JSON.stringify(members));
    } catch (e) {
      console.warn("Could not save members:", e);
    }
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function uid() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : "m" + Date.now() + Math.random().toString(16).slice(2);
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? "—" : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0] ? parts[0][0] : "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
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

  /* ----- table ----- */
  function visibleMembers() {
    const q = $("member-search").value.trim().toLowerCase();
    const status = $("member-status-filter").value;
    return members
      .filter((m) => !status || m.status === status)
      .filter((m) => !q || [m.name, m.email, m.phone, m.plan].some((v) => (v || "").toLowerCase().includes(q)))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function buildRow(m) {
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
    st.appendChild(el("span", "pill status-" + m.status, STATUS[m.status] || m.status));
    tr.appendChild(st);

    tr.appendChild(el("td", "", fmtDate(m.joined)));

    const actions = el("td");
    const wrap = el("div", "row-actions");
    const view = el("button", "btn btn-outline btn-sm", "View");
    view.type = "button";
    view.addEventListener("click", () => showDetails(m));
    const del = el("button", "icon-btn danger");
    del.type = "button";
    del.setAttribute("aria-label", "Delete " + m.name);
    del.appendChild(icon("i-trash", 16));
    del.addEventListener("click", () => askDelete(m));
    wrap.appendChild(view);
    wrap.appendChild(del);
    actions.appendChild(wrap);
    tr.appendChild(actions);
    return tr;
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((n) => { n.textContent = value; });
  }

  function updateSummaries() {
    const month = todayISO().slice(0, 7);
    const active = members.filter((m) => m.status === "active").length;
    const joinedThisMonth = members.filter((m) => (m.joined || "").slice(0, 7) === month).length;
    setText('[data-field="members-total"]', members.length);
    setText('[data-field="members-active"]', active);
    setText('[data-field="members-inactive"]', members.length - active);
    setText('[data-field="members-new"]', joinedThisMonth);
    // the same figures feed the Analytics and Dashboard cards
    setText('[data-field="total-members"]', members.length);
    setText('[data-field="active-memberships"]', active);
    setText('[data-field="new-members"]', joinedThisMonth);
    $("members-count").textContent = members.length ? members.length + (members.length === 1 ? " member" : " members") : "";
  }

  function fillMemberSelects() {
    ["cash-member", "g-member"].forEach((id) => {
      const sel = $(id);
      if (!sel) return;
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

  function render() {
    const list = visibleMembers();
    const body = $("members-body");
    body.replaceChildren();
    list.forEach((m) => body.appendChild(buildRow(m)));

    const none = members.length === 0;
    $("members-empty-title").textContent = none ? "No members yet" : "No matching members";
    $("members-empty-text").textContent = none ? "Add your first member to build the directory." : "Try a different search or status filter.";
    $("members-card").querySelector(".empty").hidden = list.length > 0;
    $("members-footer-count").textContent = members.length ? "Showing " + list.length + " of " + members.length : "";

    updateSummaries();
    fillMemberSelects();
  }

  /* ----- add ----- */
  $("add-member-btn").addEventListener("click", () => {
    $("member-form").reset();
    $("m-joined").value = todayISO();
    $("member-error").textContent = "";
    openDialog($("add-dialog"));
    $("m-name").focus();
  });

  $("member-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("m-name").value.trim().replace(/\s+/g, " ");
    const email = $("m-email").value.trim();
    const error = $("member-error");
    if (!name) {
      error.textContent = "Please enter the member's full name.";
      return;
    }
    if (email && members.some((m) => (m.email || "").toLowerCase() === email.toLowerCase())) {
      error.textContent = "A member with this email address already exists.";
      return;
    }
    members.push({
      id: uid(),
      name: name,
      email: email,
      phone: $("m-phone").value.trim(),
      plan: $("m-plan").value.trim(),
      status: $("m-status").value,
      joined: $("m-joined").value || todayISO(),
      notes: $("m-notes").value.trim(),
      createdAt: Date.now(),
    });
    saveMembers();
    render();
    closeDialog($("add-dialog"));
  });

  /* ----- details ----- */
  function showDetails(m) {
    $("md-avatar").textContent = initials(m.name);
    $("md-name").textContent = m.name;
    const badge = $("md-status");
    badge.textContent = STATUS[m.status] || m.status;
    badge.className = "pill status-" + m.status;
    $("md-email").textContent = m.email || "—";
    $("md-phone").textContent = m.phone || "—";
    $("md-plan").textContent = m.plan || "—";
    $("md-joined").textContent = fmtDate(m.joined);
    $("md-notes").textContent = m.notes || "—";
    $("md-delete").onclick = () => {
      closeDialog($("details-dialog"));
      askDelete(m);
    };
    openDialog($("details-dialog"));
  }

  /* ----- delete ----- */
  function askDelete(m) {
    pendingDeleteId = m.id;
    $("confirm-name").textContent = m.name;
    openDialog($("confirm-dialog"));
  }

  $("confirm-delete").addEventListener("click", () => {
    if (pendingDeleteId) {
      members = members.filter((m) => m.id !== pendingDeleteId);
      saveMembers();
      render();
    }
    pendingDeleteId = null;
    closeDialog($("confirm-dialog"));
  });

  $("member-search").addEventListener("input", render);
  $("member-status-filter").addEventListener("change", render);

  render();
}

if (document.body && document.body.classList.contains("dashboard")) {
  initDashboard();
  initMembers();
}
