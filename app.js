(function () {
  "use strict";

  var DATA = null;

  var TABS = [
    { key: "formulas", label: "Fórmulas Magistrais" },
    { key: "ervas", label: "Ervas Isoladas" },
    { key: "topicas", label: "Uso Tópico" }
  ];

  var state = {
    tab: "formulas",
    query: "",
    category: "",
    selectedId: null
  };

  function normalize(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  // ---------- Sinônimos populares ----------
  // Carrega window.__SYNONYMS__ (definido em synonyms.js) e normaliza as chaves
  // uma única vez, pra permitir buscar por termos leigos (ex.: "dor de cabeça")
  // e encontrar itens que só usam o termo clínico (ex.: "Cefaleia").
  var SYNONYMS = (function () {
    var raw = window.__SYNONYMS__ || {};
    var out = {};
    Object.keys(raw).forEach(function (key) {
      var nk = normalize(key);
      var vals = (raw[key] || []).map(normalize);
      out[nk] = (out[nk] || []).concat(vals);
    });
    return out;
  })();

  // Dado um texto de busca já normalizado, retorna termos clínicos extras
  // associados a qualquer sinônimo popular contido nesse texto.
  function expandWithSynonyms(normalizedQuery) {
    if (!normalizedQuery) return [];
    var extra = [];
    Object.keys(SYNONYMS).forEach(function (key) {
      if (normalizedQuery.indexOf(key) !== -1) {
        extra = extra.concat(SYNONYMS[key]);
      }
    });
    return extra;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function searchableText(item, tabKey) {
    var parts = [item.pinyin_name, item.western_name, item.indicacao, item.acoes];
    if (tabKey === "formulas") {
      parts.push(item.sindromes, item.sintomas_sinais, item.correspondencias);
    } else if (tabKey === "ervas") {
      parts.push(item.caracteristicas, item.canais);
    } else if (tabKey === "topicas") {
      parts.push(item.apresentacoes);
    }
    if (item.ingredients && item.ingredients.length) {
      item.ingredients.forEach(function (ing) {
        parts.push(ing.nome_chines, ing.nome_cientifico);
      });
    }
    return normalize(parts.filter(Boolean).join(" | "));
  }

  function getDataset(tabKey) {
    return (DATA && DATA[tabKey]) || [];
  }

  function distinctCategories(tabKey) {
    var seen = {};
    var out = [];
    getDataset(tabKey).forEach(function (item) {
      var c = (item.category || "").trim();
      if (c && !seen[c]) {
        seen[c] = true;
        out.push(c);
      }
    });
    out.sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
    return out;
  }

  function filteredItems() {
    var tabKey = state.tab;
    var items = getDataset(tabKey);
    var q = normalize(state.query.trim());
    var cat = state.category;
    var synonymTerms = expandWithSynonyms(q);

    return items.filter(function (item) {
      if (cat && item.category !== cat) return false;
      if (!q) return true;
      if (!item.__search) item.__search = searchableText(item, tabKey);
      if (item.__search.indexOf(q) !== -1) return true;
      for (var i = 0; i < synonymTerms.length; i++) {
        if (item.__search.indexOf(synonymTerms[i]) !== -1) return true;
      }
      return false;
    });
  }

  function snippetFor(item) {
    return item.indicacao || item.acoes || "";
  }

  // ---------- DOM refs ----------
  var el = {};

  function cacheEls() {
    el.tabs = document.getElementById("tabs");
    el.searchInput = document.getElementById("searchInput");
    el.categorySelect = document.getElementById("categorySelect");
    el.clearBtn = document.getElementById("clearBtn");
    el.resultCount = document.getElementById("resultCount");
    el.results = document.getElementById("results");
    el.detail = document.getElementById("detail");
  }

  function render() {
    renderTabs();
    renderCategoryOptions();
    var items = filteredItems();
    renderResultCount(items.length);
    renderResults(items);
    renderDetail();
  }

  function renderTabs() {
    el.tabs.innerHTML = TABS.map(function (t) {
      var cls = "tab-btn" + (t.key === state.tab ? " active" : "");
      return '<button class="' + cls + '" data-tab="' + t.key + '" type="button">' +
        escapeHtml(t.label) + " <span style=\"opacity:.7;font-weight:400\">(" + getDataset(t.key).length + ")</span></button>";
    }).join("");
  }

  function renderCategoryOptions() {
    var cats = distinctCategories(state.tab);
    if (state.category && cats.indexOf(state.category) === -1) {
      state.category = "";
    }
    var opts = ['<option value="">Todas as categorias</option>'];
    cats.forEach(function (c) {
      opts.push('<option value="' + escapeHtml(c) + '"' + (c === state.category ? " selected" : "") + ">" + escapeHtml(c) + "</option>");
    });
    el.categorySelect.innerHTML = opts.join("");
  }

  function renderResultCount(n) {
    el.resultCount.innerHTML = "<strong>" + n + "</strong> resultado" + (n === 1 ? "" : "s") + " encontrado" + (n === 1 ? "" : "s");
  }

  function renderResults(items) {
    if (!items.length) {
      el.results.innerHTML = '<div class="empty-state">Nenhum resultado encontrado. Ajuste a busca ou o filtro de categoria.</div>';
      return;
    }
    var html = items.map(function (item) {
      var active = item.id === state.selectedId ? " active" : "";
      var western = item.western_name ? '<div class="result-card__western">' + escapeHtml(item.western_name) + "</div>" : "";
      var cat = item.category ? '<span class="result-card__category">' + escapeHtml(item.category) + "</span>" : "";
      var snippet = snippetFor(item);
      return '<div class="result-card' + active + '" data-id="' + escapeHtml(item.id) + '">' +
        '<div class="result-card__top">' +
        '<span class="result-card__name">' + escapeHtml(item.pinyin_name) + "</span>" +
        '<span class="result-card__id">' + escapeHtml(item.id) + "</span>" +
        "</div>" +
        western +
        cat +
        (snippet ? '<div class="result-card__snippet">' + escapeHtml(snippet) + "</div>" : "") +
        "</div>";
    }).join("");
    el.results.innerHTML = html;
  }

  function findSelected() {
    if (!state.selectedId) return null;
    var items = getDataset(state.tab);
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === state.selectedId) return items[i];
    }
    return null;
  }

  function ingredientsTable(ingredients) {
    if (!ingredients || !ingredients.length) return "";
    var hasDosagem = ingredients.some(function (ing) { return ing.dosagem; });
    var qtyHeader = hasDosagem ? "Dosagem" : "%";
    var rows = ingredients.map(function (ing) {
      var qty = ing.percentual ? escapeHtml(ing.percentual) + "%" : escapeHtml(ing.dosagem || "");
      return "<tr><td>" + escapeHtml(ing.nome_chines) + "</td><td>" + escapeHtml(ing.nome_cientifico) +
        '</td><td class="pct">' + qty + "</td></tr>";
    }).join("");
    return '<table class="ingredients"><thead><tr><th>Nome chinês</th><th>Nome científico</th><th>' + qtyHeader + '</th></tr></thead><tbody>' +
      rows + "</tbody></table>";
  }

  function section(title, value) {
    if (!value) return "";
    return '<div class="detail__section"><h4>' + escapeHtml(title) + "</h4><p>" + escapeHtml(value) + "</p></div>";
  }

  function renderDetail() {
    var item = findSelected();
    if (!item) {
      el.detail.innerHTML = '<div class="detail-placeholder">Selecione um item na lista para ver os detalhes completos.</div>';
      return;
    }

    var tabKey = state.tab;
    var nameLine = escapeHtml(item.pinyin_name) +
      (item.caracteres_chineses ? ' <span class="detail__hanzi">' + escapeHtml(item.caracteres_chineses) + "</span>" : "");
    var header = '<div class="detail__header">' +
      '<div><h3 class="detail__name">' + nameLine + "</h3>" +
      (item.western_name ? '<div class="detail__western">' + escapeHtml(item.western_name) + "</div>" : "") +
      "</div>" +
      '<span class="detail__id-badge">' + escapeHtml(item.id) + "</span>" +
      "</div>" +
      (item.category ? '<span class="detail__category">' + escapeHtml(item.category) + "</span>" : "") +
      (item.fonte ? '<span class="detail__fonte">Fonte: ' + escapeHtml(item.fonte) + "</span>" : "");

    var body = "";
    body += section("Indicação", item.indicacao);
    body += section("Ações", item.acoes);

    if (tabKey === "formulas") {
      body += section("Síndromes", item.sindromes);
      body += section("Sintomas e Sinais", item.sintomas_sinais);
      if (item.lingua || item.saburra || item.pulso) {
        body += '<div class="diagnosis-row">' +
          section("Língua", item.lingua) +
          section("Saburra", item.saburra) +
          section("Pulso", item.pulso) +
          "</div>";
      }
      body += section("Correspondências (Diagnóstico Ocidental)", item.correspondencias);
      if (item.ingredients && item.ingredients.length) {
        body += '<div class="detail__section"><h4>Composição</h4>' + ingredientsTable(item.ingredients) + "</div>";
      }
    } else if (tabKey === "ervas") {
      body += section("Características", item.caracteristicas);
      body += section("Canais", item.canais);
    } else if (tabKey === "topicas") {
      body += section("Apresentações", item.apresentacoes);
      if (item.ingredients && item.ingredients.length) {
        body += '<div class="detail__section"><h4>Composição</h4>' + ingredientsTable(item.ingredients) + "</div>";
      }
    }

    if (item.notes) {
      body += '<div class="detail__notes">' + escapeHtml(item.notes) + "</div>";
    }

    var actions = '<div class="detail__actions"><button class="btn" type="button" id="printBtn">Imprimir</button></div>';

    el.detail.innerHTML = header + body + actions;

    var printBtn = document.getElementById("printBtn");
    if (printBtn) {
      printBtn.addEventListener("click", function () { window.print(); });
    }
  }

  function bindEvents() {
    el.tabs.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      state.tab = btn.getAttribute("data-tab");
      state.category = "";
      state.selectedId = null;
      render();
    });

    el.searchInput.addEventListener("input", function (e) {
      state.query = e.target.value;
      render();
    });

    el.categorySelect.addEventListener("change", function (e) {
      state.category = e.target.value;
      render();
    });

    el.clearBtn.addEventListener("click", function () {
      state.query = "";
      state.category = "";
      el.searchInput.value = "";
      render();
    });

    el.results.addEventListener("click", function (e) {
      var card = e.target.closest("[data-id]");
      if (!card) return;
      state.selectedId = card.getAttribute("data-id");
      render();
      if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) {
        el.detail.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  function loadData() {
    if (window.__DATA__) {
      DATA = window.__DATA__;
      init();
      return;
    }
    fetch("data.json")
      .then(function (r) { return r.json(); })
      .then(function (json) {
        DATA = json;
        init();
      })
      .catch(function (err) {
        document.getElementById("results").innerHTML =
          '<div class="empty-state">Não foi possível carregar data.json (' + escapeHtml(err.message) +
          "). Abra este arquivo por um servidor local ou verifique se data.json está na mesma pasta.</div>";
      });
  }

  function init() {
    cacheEls();
    bindEvents();
    render();
  }

  document.addEventListener("DOMContentLoaded", loadData);
})();
