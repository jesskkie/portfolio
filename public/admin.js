const $ = (s) => document.querySelector(s);
let csrf = "",
  data,
  version,
  tab = "profile",
  dirty = false;
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function markDirty() {
  dirty = true;
  status("Unsaved changes. Save a draft before leaving.");
}
function status(message, error = false) {
  $("#status").hidden = false;
  $("#status").textContent = message;
  $("#status").classList.toggle("danger", error);
}
async function api(url, method = "GET", body) {
  const opts = { method, headers: { "X-CSRF-Token": csrf } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch("/api/admin/" + url, opts);
  if (!r.ok) {
    let message;
    try {
      message = (await r.json()).error;
    } catch {}
    if (r.status === 401 && url !== "login") {
      showLogin();
    }
    throw new Error(
      message || `Request failed (${r.status}). Please try again later.`,
    );
  }
  return r.status === 204 ? null : r.json();
}
function showLogin() {
  $("#login").hidden = false;
  $("#studio").hidden = true;
  data = undefined;
}
async function load() {
  const s = await api("session");
  csrf = s.csrf;
  $("#setup-note").hidden = s.configured;
  if (!s.authenticated) {
    showLogin();
    return;
  }
  const result = await api("content");
  data = result.content;
  version = result.version;
  dirty = false;
  $("#login").hidden = true;
  $("#studio").hidden = false;
  render();
}
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  try {
    const r = await api("login", "POST", Object.fromEntries(form));
    csrf = r.csrf;
    e.target.password.value = "";
    await load();
    status("Signed in. Your draft is private until you publish it.");
  } catch (e) {
    status(e.message, true);
  }
};
function field(label, key, object, multiline = false) {
  const l = el("label", null, "field");
  l.append(document.createTextNode(label));
  const input = el(multiline ? "textarea" : "input");
  input.value =
    key === "images" ? (object[key] || []).join("\n") : object[key] || "";
  input.maxLength = multiline ? 12000 : 2048;
  input.oninput = () => {
    object[key] =
      key === "images"
        ? input.value
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : input.value;
    markDirty();
  };
  l.append(input);
  return l;
}
function button(label, handler, cls = "secondary") {
  const b = el("button", label, cls);
  b.type = "button";
  b.onclick = handler;
  return b;
}
const projectFields = [
  ["Project title", "title"],
  ["Description", "description", true],
  ["Fault, challenge, or problem investigated", "problem", true],
  ["Equipment & tools used", "tools"],
  ["Results (use only verified outcomes)", "results", true],
  ["Image URL (HTTPS or media library path)", "image"],
  ["Project link (HTTPS)", "link"],
  ["Additional image URLs — one per line", "images", true],
];
const certFields = [
  ["Certification name", "title"],
  ["Issuing organization", "issuer"],
  ["Date (e.g. March 2026)", "date"],
  ["Image or document URL", "image"],
  ["Verification link (HTTPS)", "link"],
];
function render() {
  const root = $("#editor");
  root.replaceChildren();
  document
    .querySelectorAll("[data-tab]")
    .forEach((b) =>
      b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"),
    );
  if (tab === "profile") {
    root.append(el("h2", "The essentials."));
    const grid = el("div", null, "form-grid");
    for (const [label, key, multi] of [
      ["Name", "name"],
      ["Professional title", "role"],
      ["Introduction", "intro", true],
      ["About & experience", "about", true],
      ["Contact email", "email"],
      ["LinkedIn URL (HTTPS)", "linkedin"],
      ["GitHub URL (HTTPS)", "github"],
      ["Résumé link (HTTPS or uploaded PDF path)", "resume"],
    ])
      grid.append(field(label, key, data, multi));
    const skillObj = { skills: data.skills.join("\n") };
    const skills = field(
      "Technical skills & equipment — one per line",
      "skills",
      skillObj,
      true,
    );
    skills.querySelector("textarea").oninput = (e) => {
      data.skills = e.target.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      markDirty();
    };
    grid.append(skills);
    root.append(grid);
  } else if (tab === "media") {
    renderMedia();
  } else {
    const list = data[tab],
      fields = tab === "projects" ? projectFields : certFields;
    root.append(
      el(
        "h2",
        tab === "projects"
          ? "Document the technical work."
          : "Share your learning.",
      ),
      el(
        "p",
        "Order items with the arrows. Only items marked “Include on public site” appear after publishing.",
        "muted",
      ),
    );
    root.append(
      button(
        "＋ Add " + (tab === "projects" ? "project" : "certification"),
        () => {
          const item = { id: crypto.randomUUID(), published: false };
          fields.forEach(([, k]) => (item[k] = k === "images" ? [] : ""));
          list.push(item);
          markDirty();
          render();
        },
      ),
    );
    if (!list.length)
      root.append(
        el(
          "p",
          "Nothing here yet. Add your first item to get started.",
          "empty-state",
        ),
      );
    list.forEach((item, i) => {
      const card = el("section", null, "editor-card");
      card.append(
        el(
          "h3",
          `${String(i + 1).padStart(2, "0")} / ${item.title || "Untitled draft"}`,
        ),
      );
      const grid = el("div", null, "form-grid");
      fields.forEach(([label, key, multi]) =>
        grid.append(field(label, key, item, multi)),
      );
      card.append(grid);
      const check = el("label", null, "check");
      const input = el("input");
      input.type = "checkbox";
      input.checked = item.published;
      input.onchange = () => {
        item.published = input.checked;
        markDirty();
      };
      check.append(input, document.createTextNode("Include on public site"));
      card.append(check);
      const actions = el("div", null, "card-actions");
      const up = button("↑ Move up", () => {
        [list[i - 1], list[i]] = [list[i], list[i - 1]];
        markDirty();
        render();
      });
      up.disabled = i === 0;
      const down = button("↓ Move down", () => {
        [list[i + 1], list[i]] = [list[i], list[i + 1]];
        markDirty();
        render();
      });
      down.disabled = i === list.length - 1;
      actions.append(
        up,
        down,
        button(
          "Remove",
          () => {
            if (
              confirm(
                "Remove this item from the draft? Publish afterward to update the public site.",
              )
            ) {
              list.splice(i, 1);
              markDirty();
              render();
            }
          },
          "secondary danger",
        ),
      );
      card.append(actions);
      root.append(card);
    });
  }
}
async function save() {
  const r = await api("content", "PUT", { content: data, version });
  version = r.version;
  dirty = false;
  status("Draft saved. The public site has not changed.");
}
$("#save").onclick = () => save().catch((e) => status(e.message, true));
$("#preview-button").onclick = async () => {
  try {
    await save();
    window.open("/preview", "_blank", "noopener");
    status(
      "Draft saved. If your browser blocked the preview, open /preview on this dashboard host.",
    );
  } catch (e) {
    status(e.message, true);
  }
};
$("#publish").onclick = async () => {
  if (!confirm("Publish the current content to the live public website?"))
    return;
  try {
    await save();
    await api("publish", "POST", { version });
    status("Published successfully. Visitors now see the latest content.");
  } catch (e) {
    status(e.message, true);
  }
};
$("#logout").onclick = async () => {
  try {
    await api("logout", "POST", {});
    dirty = false;
    await load();
    status("You have been securely logged out.");
  } catch (e) {
    status(e.message, true);
  }
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      render();
    }),
);
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
async function renderMedia() {
  const root = $("#editor");
  root.append(
    el("h2", "A home for your assets."),
    el(
      "p",
      "PNG, JPEG, WebP, and PDF · up to 8 MB each. Files stay private until referenced by published content. Copy a file path into an image or résumé field.",
      "muted",
    ),
  );
  const form = el("form");
  const label = el("label", null, "field");
  label.append(document.createTextNode("Choose image or document"));
  const input = el("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp,application/pdf";
  input.required = true;
  label.append(input);
  form.append(label, el("button", "Upload file", "button"));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = new FormData();
    body.append("file", input.files[0]);
    try {
      await api("assets", "POST", body);
      status("File uploaded. Copy its path below.");
      render();
    } catch (e) {
      status(e.message, true);
    }
  };
  root.append(form);
  try {
    const assets = await api("assets");
    if (tab !== "media") return;
    for (const a of assets) {
      const row = el("div", null, "asset-row");
      if (a.mime.startsWith("image/")) {
        const image = el("img");
        image.src = "/media/" + a.id;
        image.alt = a.name;
        row.append(image);
      }
      row.append(el("strong", a.name), el("p", `/media/${a.id}`));
      const actions = el("div", null, "card-actions");
      const view = el("a", "Open file →", "text-link");
      view.href = "/media/" + a.id;
      view.target = "_blank";
      view.rel = "noopener";
      actions.append(
        view,
        button("Copy path", async () => {
          try {
            await navigator.clipboard.writeText("/media/" + a.id);
            status("Path copied.");
          } catch {
            status("Select and copy the file path shown above.");
          }
        }),
        button(
          "Delete file",
          async () => {
            if (!confirm("Permanently delete this unused file?")) return;
            try {
              await api("assets/" + a.id, "DELETE");
              render();
            } catch (e) {
              status(e.message, true);
            }
          },
          "secondary danger",
        ),
      );
      row.append(actions);
      root.append(row);
    }
  } catch (e) {
    status(e.message, true);
  }
}
load().catch((e) => status(e.message, true));
