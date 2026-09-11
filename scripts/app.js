// Biblioteca de materiais — carrega dados/materiais.json e renderiza
// navegação em 3 níveis (Área → Série → Unidade) com busca, accordion e deep link.
(async function () {
  const groupsEl = document.querySelector("#groups");
  const countEl = document.querySelector("#count");
  const emptyEl = document.querySelector("#empty");
  const searchEl = document.querySelector("#search");
  const areaFiltersEl = document.querySelector("#area-filters");
  const nivelFiltersEl = document.querySelector("#nivel-filters");
  const totalEl = document.querySelector("#total");

  const norm = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  let data = { areas: [] };
  try {
    const res = await fetch("dados/materiais.json");
    data = await res.json();
  } catch (err) {
    groupsEl.innerHTML =
      '<p class="empty" style="display:block">Não foi possível carregar os materiais agora. Tente novamente mais tarde.</p>';
    return;
  }

  const totalMateriais = data.areas.reduce(
    (sum, area) =>
      sum +
      area.niveis.reduce(
        (s2, niv) =>
          s2 + niv.unidades.reduce((s3, u) => s3 + u.materiais.length, 0),
        0
      ),
    0
  );
  if (totalEl) totalEl.textContent = totalMateriais;

  // ---------- estado ----------
  const state = { area: "todos", nivel: "todos", termo: "" };

  function readHash() {
    const m = location.hash.match(/materiais\?(.*)$/);
    if (!m) {
      state.area = "todos";
      state.nivel = "todos";
      state.termo = "";
      return;
    }
    const params = new URLSearchParams(m[1]);
    state.area = params.get("area") || "todos";
    state.nivel = params.get("nivel") || "todos";
    state.termo = params.get("q") || "";
  }
  readHash();

  function writeHash() {
    const params = new URLSearchParams();
    if (state.area !== "todos") params.set("area", state.area);
    if (state.nivel !== "todos") params.set("nivel", state.nivel);
    if (state.termo) params.set("q", state.termo);
    const qs = params.toString();
    const newHash = qs ? `#materiais?${qs}` : "#materiais";
    history.replaceState(null, "", newHash);
  }

  // ---------- filtros de área ----------
  function renderAreaFilters() {
    const buttons = [
      { id: "todos", nome: "Todos" },
      ...data.areas.map((a) => ({ id: a.id, nome: a.nome })),
    ];
    areaFiltersEl.innerHTML = "";
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "filter";
      btn.type = "button";
      btn.dataset.area = b.id;
      btn.textContent = b.nome;
      btn.setAttribute("aria-pressed", String(state.area === b.id));
      btn.addEventListener("click", () => {
        state.area = b.id;
        state.nivel = "todos";
        render();
      });
      areaFiltersEl.append(btn);
    });
  }

  // ---------- filtros de série (dependem da área) ----------
  function renderNivelFilters() {
    const area = data.areas.find((a) => a.id === state.area);
    if (!area || area.niveis.length < 2) {
      nivelFiltersEl.innerHTML = "";
      nivelFiltersEl.classList.remove("show");
      return;
    }
    nivelFiltersEl.classList.add("show");
    const buttons = [
      { id: "todos", nome: "Todas as séries" },
      ...area.niveis.map((n) => ({ id: n.id, nome: n.nome })),
    ];
    nivelFiltersEl.innerHTML = "";
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.className = "filter";
      btn.type = "button";
      btn.dataset.nivel = b.id;
      btn.textContent = b.nome;
      btn.setAttribute("aria-pressed", String(state.nivel === b.id));
      btn.addEventListener("click", () => {
        state.nivel = b.id;
        render();
      });
      nivelFiltersEl.append(btn);
    });
  }

  // ---------- render principal ----------
  function materialMatches(material, termo) {
    if (!termo) return true;
    const haystack = norm(
      [material.titulo, ...(material.tags || [])].join(" ")
    );
    return haystack.includes(termo);
  }

  function render() {
    writeHash();
    renderAreaFilters();
    renderNivelFilters();

    const termo = norm(state.termo.trim());
    let visible = 0;
    groupsEl.innerHTML = "";

    data.areas.forEach((area) => {
      if (state.area !== "todos" && state.area !== area.id) return;
      area.niveis.forEach((nivel) => {
        if (state.nivel !== "todos" && state.nivel !== nivel.id) return;
        nivel.unidades.forEach((unidade) => {
          const matches = unidade.materiais.filter((m) =>
            materialMatches(m, termo)
          );
          if (!matches.length) return;
          visible += matches.length;

          const details = document.createElement("details");
          details.className = "group";
          if (termo) details.open = true;

          const summary = document.createElement("summary");
          const breadcrumb =
            area.niveis.length > 1
              ? `${area.nome} › ${nivel.nome} › ${unidade.nome}`
              : `${area.nome} › ${unidade.nome}`;
          summary.innerHTML = `<span><small class="breadcrumb">${breadcrumb}</small>${unidade.nome} · ${matches.length}</span><span class="chev" aria-hidden="true">›</span>`;

          const grid = document.createElement("div");
          grid.className = "grid";
          matches.forEach((m) => {
            const link = document.createElement("a");
            link.className = "card";
            link.href = `arquivos/${m.arquivo
              .split("/")
              .map(encodeURIComponent)
              .join("/")}`;
            link.target = "_blank";
            link.rel = "noopener";
            link.innerHTML = `<strong>${m.titulo}</strong><span aria-hidden="true">↗</span>`;
            link.setAttribute("aria-label", `Abrir material: ${m.titulo}`);
            grid.append(link);
          });

          details.append(summary, grid);
          groupsEl.append(details);
        });
      });
    });

    countEl.textContent = `${visible} ${
      visible === 1 ? "material encontrado" : "materiais encontrados"
    }`;
    emptyEl.style.display = visible ? "none" : "block";
  }

  searchEl.value = state.termo;
  searchEl.addEventListener("input", () => {
    state.termo = searchEl.value;
    render();
  });

  render();
})();
