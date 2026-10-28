const $ = (s) => document.querySelector(s);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function link(label, url, cls) {
  const a = el("a", label, cls);
  a.href = url;
  if (url.startsWith("https:")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  return a;
}
const preview = location.pathname === "/preview";
async function load() {
  const r = await fetch(preview ? "/api/admin/content" : "/api/content");
  if (!r.ok) {
    document.body.textContent = "Sign in to view this preview.";
    return;
  }
  const result = await r.json(),
    c = preview ? result.content : result;
  if (preview) $("#preview").hidden = false;
  document.title = `${c.name} · Automation portfolio`;
  for (const id of ["name", "brand-name", "footer-name"])
    $("#" + id).textContent = c.name;
  $("#role").textContent = c.role;
  $("#intro").textContent = c.intro;
  $("#about-text").textContent = c.about;
  if (c.name !== "Your name") $(".placeholder-note").hidden = true;
  for (const skill of c.skills) $("#skills").append(el("span", skill, "tag"));
  if (c.resume) {
    $("#resume").hidden = false;
    $("#resume").href = c.resume;
  }
  const projects = preview ? c.projects : c.projects.filter((p) => p.published);
  if (!projects.length) {
    const card = el("div", null, "empty-state");
    card.append(
      el("span", "[ TECHNICAL PROJECTS / COMING SOON ]", "eyebrow"),
      el("h3", "Real equipment. Real problem-solving."),
      el(
        "p",
        "This space is ready for your actual work: the equipment involved, the problem investigated, the controls or tools used, and the outcome. No projects have been listed yet.",
        "muted",
      ),
    );
    $("#projects").append(card);
  }
  projects.forEach((p, i) => {
    const card = el("article", null, "project-card");
    const visual = el("div", null, "project-visual");
    if (p.image) {
      const img = el("img");
      img.src = p.image;
      img.alt = p.title;
      img.loading = "lazy";
      visual.append(img);
    } else
      visual.append(
        el("span", String(i + 1).padStart(2, "0"), "project-number"),
      );
    const info = el("div", null, "project-info");
    info.append(
      el("p", p.tools || "Equipment & tools to be added", "eyebrow"),
      el("h3", p.title),
      el("p", p.description, "muted"),
    );
    const button = el("button", "View case study →", "text-link");
    button.onclick = () => {
      const details = $("#project-details");
      details.replaceChildren(
        el("p", "PROJECT / " + String(i + 1).padStart(2, "0"), "eyebrow"),
        el("h2", p.title),
      );
      for (const [title, value] of [
        ["Overview", p.description],
        ["Problem investigated", p.problem],
        ["Equipment & tools", p.tools],
        ["Results & observations", p.results],
      ]) {
        details.append(
          el("h3", title),
          el("p", value || "Details to be added."),
        );
      }
      if (p.image) {
        const img = el("img");
        img.src = p.image;
        img.alt = p.title;
        details.append(img);
      }
      for (const url of p.images || []) {
        const img = el("img");
        img.src = url;
        img.alt = p.title + " — project image";
        img.loading = "lazy";
        details.append(img);
      }
      if (p.link) details.append(link("Explore project →", p.link, "button"));
      $("#project-dialog").showModal();
    };
    info.append(button);
    card.append(visual, info);
    $("#projects").append(card);
  });
  const certs = preview
    ? c.certifications
    : c.certifications.filter((p) => p.published);
  if (!certs.length)
    $("#certifications").append(
      el(
        "p",
        "Certifications will appear here once added. No credentials have been listed yet.",
        "empty-state muted",
      ),
    );
  for (const c of certs) {
    const row = el("article", null, "cert-row");
    const box = el("div");
    box.append(el("h3", c.title), el("p", c.issuer, "muted"));
    row.append(el("span", "✧", "cert-icon"), box, el("span", c.date, "muted"));
    if (c.link) row.append(link("View credential →", c.link, "text-link"));
    if (c.image) row.append(link("View document →", c.image, "text-link"));
    $("#certifications").append(row);
  }
  if (c.email)
    $("#contacts").append(link("Say hello →", "mailto:" + c.email, "button"));
  if (c.linkedin)
    $("#contacts").append(link("LinkedIn →", c.linkedin, "text-link"));
  if (c.github) $("#contacts").append(link("GitHub →", c.github, "text-link"));
  if (!c.email && !c.linkedin && !c.github)
    $("#contacts").append(el("p", "Contact details coming soon.", "muted"));
}
$("#close-dialog").onclick = () => $("#project-dialog").close();
load().catch(() => {
  $("#intro").textContent = "Unable to load content. Please try again shortly.";
});
