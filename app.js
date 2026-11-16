(function () {
  "use strict";

  var DATA = window.__DATA__ || { formulas: [], ervas: [], topicas: [] };

  var TABS = [
    { key: "formulas", label: "Fórmulas Magistrais" },
    { key: "ervas", label: "Ervas Isoladas" },
    { key: "topicas", label: "Uso Tópico" },
    { key: "ingredientes", label: "Ingredientes" }
  ];

  var FONTE_REF = {
    "Bergamo": "Fórmulas Magistrais Chinesas, José Antônio Bergamo.",
    "Lo Der Cheng": "Fórmulas Magistrais Chinesas, Lo Der Cheng (Editora Roca)."
  };

  var FAV_KEY = "fitofacil_favs";
  var MOBILE_QUERY = "(max-width: 860px)";

  var state = {
    view: "list",
    tab: "formulas",
    selectedId: null,
    compareIds: null,
    query: "",
    category: "",
    fonte: "",
    favOnly: false,
    alertOnly: false,
    comparePending: null
  };

  // ---------- Texto ----------
  function normalize(str) {
    if (!str) return "";
    return String(str).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  var NOT_WORD = /[^a-z0-9㐀-鿿]+/g;

  // Forma usada na busca: sem acento, minúscula, pontuação vira espaço.
  function fold(str) {
    return normalize(str).replace(NOT_WORD, " ").trim();
  }

  // Igual a fold(), mas guarda de qual caractere do original veio cada letra,
  // para poder destacar o trecho encontrado no texto com acentos.
  function foldMap(text) {
    var folded = "";
    var map = [];
    for (var i = 0; i < text.length; i++) {
      var f = normalize(text.charAt(i)).replace(NOT_WORD, " ");
      for (var j = 0; j < f.length; j++) {
        var c = f.charAt(j);
        if (c === " " && (folded === "" || folded.charAt(folded.length - 1) === " ")) continue;
        folded += c;
        map.push(i);
      }
    }
    return { folded: folded, map: map };
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function matchRanges(text, terms) {
    if (!terms.length) return [];
    var fm = foldMap(text);
    var ranges = [];
    terms.forEach(function (term) {
      var from = 0;
      var idx;
      while ((idx = fm.folded.indexOf(term, from)) !== -1) {
        ranges.push([fm.map[idx], fm.map[idx + term.length - 1] + 1]);
        from = idx + term.length;
      }
    });
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) { last[1] = Math.max(last[1], r[1]); } else { merged.push(r); }
    });
    return merged;
  }

  function highlight(text, terms) {
    if (!text) return "";
    var ranges = matchRanges(text, terms);
    if (!ranges.length) return escapeHtml(text);
    var out = "";
    var pos = 0;
    ranges.forEach(function (r) {
      out += escapeHtml(text.slice(pos, r[0])) + "<mark>" + escapeHtml(text.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return out + escapeHtml(text.slice(pos));
  }

  function slug(name) {
    return fold(name).replace(/ /g, "-");
  }

  function pctNumber(p) {
    return parseFloat(String(p || "0").replace(",", ".")) || 0;
  }

  // ---------- Índices ----------
  var COLLECTIONS = { formulas: DATA.formulas || [], ervas: DATA.ervas || [], topicas: DATA.topicas || [], ingredientes: [] };
  var BY_ID = {};
  var VOCAB = "";
  var TWINS = {};

  function buildIngredients() {
    var aliases = DATA.ingrediente_aliases || {};
    var byName = {};
    ["formulas", "topicas"].forEach(function (tab) {
      COLLECTIONS[tab].forEach(function (item) {
        (item.ingredients || []).forEach(function (ing) {
          var entry = byName[ing.nome_chines];
          if (!entry) {
            entry = byName[ing.nome_chines] = {
              id: slug(ing.nome_chines),
              pinyin_name: ing.nome_chines,
              western_name: ing.nome_cientifico,
              aliases: aliases[ing.nome_chines] || [],
              usos: [],
              erva: null
            };
          }
          entry.usos.push({ tab: tab, item: item, pct: ing.percentual });
        });
      });
    });
    COLLECTIONS.ervas.forEach(function (erva) {
      var entry = byName[erva.ingrediente];
      if (entry) { entry.erva = erva; erva.__ing = entry; }
    });
    COLLECTIONS.ingredientes = Object.keys(byName).map(function (k) { return byName[k]; });
  }

  // Campo de busca: [rótulo, texto exibido, peso, é nome?, texto extra só para a busca]
  function compositionField(item) {
    var aliases = DATA.ingrediente_aliases || {};
    var ings = item.ingredients || [];
    var extra = ings.map(function (ing) {
      return (aliases[ing.nome_chines] || []).concat([ing.nome_cientifico]).join(" ");
    }).join(" ");
    return ["Composição", ings.map(function (ing) { return ing.nome_chines; }).join(", "), 20, false, extra];
  }

  // "pulso fino" e "língua pálida" precisam achar o campo mesmo sem a palavra no texto.
  function labeled(label, text) {
    return [label, text, 15, false, label];
  }

  function fieldsFor(tab, item) {
    var f = [["Nome", item.pinyin_name, 100, true], ["Nome", item.western_name, 60, true]];
    if (tab === "formulas") {
      f.push(["Nome", item.caracteres_chineses, 60, true], ["Indicação", item.indicacao, 40],
        ["Sintomas e sinais", item.sintomas_sinais, 30], ["Síndromes", item.sindromes, 30],
        ["Ações", item.acoes, 25], ["Diagnóstico ocidental", item.correspondencias, 25],
        compositionField(item), labeled("Língua", item.lingua),
        labeled("Saburra", item.saburra), labeled("Pulso", item.pulso),
        ["Categoria", [item.grupo, item.category].filter(Boolean).join(" · "), 15],
        ["Alerta", item.alerta_cuidado, 5]);
    } else if (tab === "ervas") {
      f.push(["Indicação", item.indicacao, 40], ["Ações", item.acoes, 25],
        ["Características", item.caracteristicas, 15], ["Canais", item.canais, 15],
        ["Categoria", item.category, 15]);
    } else if (tab === "topicas") {
      f.push(["Indicação", item.indicacao, 40], ["Ações", item.acoes, 25],
        compositionField(item), ["Apresentações", item.apresentacoes, 15],
        ["Categoria", item.category, 15]);
    } else {
      f.push(["Outros nomes", item.aliases.join(", "), 80, true]);
      if (item.erva) { f.push(["Indicação", item.erva.indicacao, 20], ["Ações", item.erva.acoes, 20]); }
    }
    return f.filter(function (x) { return x[1]; }).map(function (x) {
      return { label: x[0], text: String(x[1]), norm: fold((x[4] ? x[4] + " " : "") + x[1]), weight: x[2], isName: !!x[3] };
    });
  }

  function twinKey(name) {
    return fold(String(name).replace(/\(\d+\)/g, "").replace(/modif\.?/i, ""));
  }

  function buildIndex() {
    buildIngredients();
    var names = [];
    Object.keys(COLLECTIONS).forEach(function (tab) {
      BY_ID[tab] = {};
      COLLECTIONS[tab].forEach(function (item) {
        item.__tab = tab;
        item.__key = tab + ":" + item.id;
        item.__fields = fieldsFor(tab, item);
        item.__norm = item.__fields.map(function (f) { return f.norm; }).join(" | ");
        item.__name = fold(item.pinyin_name);
        BY_ID[tab][item.id] = item;
        names.push(item.__name);
        if (item.aliases) { item.aliases.forEach(function (a) { names.push(fold(a)); }); }
      });
      COLLECTIONS[tab].sort(function (a, b) { return a.pinyin_name.localeCompare(b.pinyin_name, "pt-BR"); });
    });
    VOCAB = "|" + names.join("|") + "|";
    COLLECTIONS.formulas.forEach(function (item) {
      var k = twinKey(item.pinyin_name);
      (TWINS[k] = TWINS[k] || []).push(item);
    });
  }

  function twinsOf(item) {
    return (TWINS[twinKey(item.pinyin_name)] || []).filter(function (x) { return x !== item; });
  }

  // ---------- Busca ----------
  var SYNONYMS = (function () {
    var raw = window.__SYNONYMS__ || {};
    return Object.keys(raw).map(function (key) {
      var k = fold(key);
      return { key: k, words: k.split(" ").length, alts: [k].concat((raw[key] || []).map(fold)) };
    }).sort(function (a, b) { return b.words - a.words; });
  })();

  // Preposições só viram termo de busca quando fazem parte de um nome
  // ("Da Huang", "E Jiao"); sozinhas, casariam com quase todo texto.
  var STOP = { a: 1, o: 1, e: 1, de: 1, da: 1, "do": 1, das: 1, dos: 1, em: 1, no: 1, na: 1, com: 1, para: 1, por: 1, ou: 1 };

  function vocabHas(phrase) {
    var from = 0;
    var idx;
    while ((idx = VOCAB.indexOf(phrase, from)) !== -1) {
      var before = VOCAB.charAt(idx - 1);
      var after = VOCAB.charAt(idx + phrase.length);
      if ((before === "|" || before === " ") && (after === "|" || after === " ")) return true;
      from = idx + 1;
    }
    return false;
  }

  function parseQuery(raw) {
    var norm = fold(raw);
    var words = norm ? norm.split(" ") : [];
    var concepts = [];
    var expanded = [];
    var i = 0;
    while (i < words.length) {
      var hit = null;
      for (var s = 0; s < SYNONYMS.length && !hit; s++) {
        var syn = SYNONYMS[s];
        if (i + syn.words <= words.length && words.slice(i, i + syn.words).join(" ") === syn.key) hit = syn;
      }
      if (hit) {
        concepts.push(hit.alts);
        hit.alts.slice(1).forEach(function (a) { if (a !== hit.key && expanded.indexOf(a) === -1) expanded.push(a); });
        i += hit.words;
        continue;
      }
      var taken = 0;
      for (var n = Math.min(6, words.length - i); n >= 2 && !taken; n--) {
        var phrase = words.slice(i, i + n).join(" ");
        if (vocabHas(phrase)) { concepts.push([phrase]); taken = n; }
      }
      if (taken) { i += taken; continue; }
      if (!STOP[words[i]]) concepts.push([words[i]]);
      i++;
    }
    if (!concepts.length && norm) concepts.push([norm]);
    var terms = [];
    concepts.forEach(function (alts) { alts.forEach(function (a) { if (terms.indexOf(a) === -1) terms.push(a); }); });
    terms.sort(function (a, b) { return b.length - a.length; });
    return { norm: norm, concepts: concepts, terms: terms, expanded: expanded };
  }

  // Devolve -1 se algum termo não aparece; senão, a relevância (peso do melhor
  // campo de cada termo; nome pesa mais que texto).
  function scoreItem(item, q) {
    var total = 0;
    for (var c = 0; c < q.concepts.length; c++) {
      var alts = q.concepts[c];
      var best = 0;
      for (var f = 0; f < item.__fields.length; f++) {
        var field = item.__fields[f];
        if (field.weight <= best) continue;
        for (var a = 0; a < alts.length; a++) {
          var idx = field.norm.indexOf(alts[a]);
          if (idx !== -1) {
            best = Math.max(best, field.weight + (field.isName && idx === 0 ? 20 : 0));
            break;
          }
        }
      }
      if (!best) return -1;
      total += best;
    }
    if (q.norm && item.__name.indexOf(q.norm) !== -1) total += 100;
    return total;
  }

  var currentQuery = parseQuery("");

  function categoryOf(item) {
    return state.tab === "formulas" ? item.grupo : item.category;
  }

  function filteredItems() {
    var q = currentQuery;
    var out = [];
    COLLECTIONS[state.tab].forEach(function (item) {
      if (state.category && categoryOf(item) !== state.category) return;
      if (state.fonte && item.fonte !== state.fonte) return;
      if (state.favOnly && !favs[item.__key]) return;
      if (state.alertOnly && !item.alerta_cuidado) return;
      var score = q.concepts.length ? scoreItem(item, q) : 0;
      if (score < 0) return;
      out.push({ item: item, score: score });
    });
    if (q.concepts.length) {
      out.sort(function (a, b) {
        return b.score - a.score || a.item.pinyin_name.localeCompare(b.item.pinyin_name, "pt-BR");
      });
    }
    return out.map(function (x) { return x.item; });
  }

  function snippetHtml(item) {
    var fallback = item.__tab === "ingredientes"
      ? "Em " + item.usos.length + (item.usos.length === 1 ? " fórmula" : " fórmulas") + (item.erva ? " · com monografia" : "")
      : (item.indicacao || item.acoes || "");
    var q = currentQuery;
    if (!q.terms.length) return escapeHtml(fallback);
    var best = null;
    item.__fields.forEach(function (f) {
      if (f.isName || (best && best.weight >= f.weight)) return;
      for (var t = 0; t < q.terms.length; t++) {
        if (f.norm.indexOf(q.terms[t]) !== -1) { best = f; return; }
      }
    });
    if (!best) return escapeHtml(fallback);
    var text = best.text;
    var ranges = matchRanges(text, q.terms);
    var start = ranges.length ? Math.max(0, ranges[0][0] - 60) : 0;
    if (start > 0) {
      var sp = text.indexOf(" ", start);
      start = sp !== -1 && sp < ranges[0][0] ? sp + 1 : start;
    }
    var excerpt = (start > 0 ? "… " : "") + text.slice(start, start + 220);
    var label = best.label === "Indicação" ? "" : '<span class="snippet-label">' + escapeHtml(best.label) + ":</span> ";
    return label + highlight(excerpt, q.terms);
  }

  // ---------- Favoritos ----------
  var favs = (function () {
    try { return JSON.parse(window.localStorage.getItem(FAV_KEY)) || {}; } catch (e) { return {}; }
  })();

  function toggleFav(key) {
    if (favs[key]) { delete favs[key]; } else { favs[key] = 1; }
    try { window.localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (e) {}
  }

  // ---------- DOM ----------
  var el = {};

  function cacheEls() {
    ["appRoot", "tabs", "searchInput", "categoryField", "categoryLabel", "categorySelect", "fonteField", "fonteSelect",
      "favOnly", "alertField", "alertOnly", "clearBtn", "compareBar", "resultCount", "results", "detail", "compare"]
      .forEach(function (id) { el[id] = document.getElementById(id); });
  }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MOBILE_QUERY).matches);
  }

  function hrefFor(tab, id) {
    return "#" + tab + (id ? "/" + encodeURIComponent(id) : "");
  }

  function distinct(tab, getter) {
    var seen = {};
    COLLECTIONS[tab].forEach(function (item) { var v = getter(item); if (v) seen[v] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  function optionsHtml(values, selected, allLabel) {
    return '<option value="">' + allLabel + "</option>" + values.map(function (v) {
      return '<option value="' + escapeHtml(v) + '"' + (v === selected ? " selected" : "") + ">" + escapeHtml(v) + "</option>";
    }).join("");
  }

  function renderShell() {
    el.tabs.innerHTML = TABS.map(function (t) {
      var current = state.view === "list" && t.key === state.tab;
      return '<a class="tab-btn' + (current ? " active" : "") + '" href="#' + t.key + '"' + (current ? ' aria-current="page"' : "") + ">" +
        escapeHtml(t.label) + ' <span class="tab-count">(' + COLLECTIONS[t.key].length + ")</span></a>";
    }).join("");

    var isFormulas = state.tab === "formulas";
    var cats = state.tab === "ingredientes" ? [] : distinct(state.tab, isFormulas ? function (i) { return i.grupo; } : function (i) { return i.category; });
    if (cats.indexOf(state.category) === -1) state.category = "";
    el.categoryField.hidden = !cats.length;
    el.categoryLabel.textContent = isFormulas ? "Grupo" : "Categoria";
    el.categorySelect.innerHTML = optionsHtml(cats, state.category, isFormulas ? "Todos os grupos" : "Todas as categorias");

    var fontes = distinct(state.tab, function (i) { return i.fonte; });
    if (fontes.indexOf(state.fonte) === -1) state.fonte = "";
    el.fonteField.hidden = !fontes.length;
    el.fonteSelect.innerHTML = optionsHtml(fontes, state.fonte, "Todas as fontes");

    el.alertField.hidden = !isFormulas;
    if (!isFormulas) state.alertOnly = false;
    el.alertOnly.checked = state.alertOnly;
    el.favOnly.checked = state.favOnly;
  }

  function favButton(item, extraClass) {
    var on = !!favs[item.__key];
    return '<button type="button" class="fav-btn' + (extraClass || "") + (on ? " on" : "") + '" data-fav="' + escapeHtml(item.__key) +
      '" aria-pressed="' + on + '" aria-label="' + (on ? "Remover dos favoritos: " : "Favoritar: ") + escapeHtml(item.pinyin_name) +
      '" title="' + (on ? "Remover dos favoritos" : "Favoritar") + '">' + (on ? "★" : "☆") + "</button>";
  }

  function cardHtml(item) {
    var chips = "";
    var cat = item.__tab === "formulas" ? item.grupo : item.category;
    if (cat) chips += '<span class="chip">' + escapeHtml(cat) + "</span>";
    if (item.fonte) chips += '<span class="chip chip--plain">' + escapeHtml(item.fonte.replace(/ \(.*\)$/, "")) + "</span>";
    if (item.alerta_cuidado) chips += '<span class="chip chip--alert" title="' + escapeHtml(item.alerta_cuidado) + '">⚠ Cuidado</span>';
    var snippet = snippetHtml(item);
    return '<div class="result-card' + (state.selectedId === item.id ? " active" : "") + '" data-key="' + escapeHtml(item.__key) + '">' +
      '<a class="result-card__link" href="' + hrefFor(item.__tab, item.id) + '">' +
      '<span class="result-card__name">' + highlight(item.pinyin_name, currentQuery.terms) + "</span>" +
      (item.western_name ? '<span class="result-card__western">' + highlight(item.western_name, currentQuery.terms) + "</span>" : "") +
      (chips ? '<span class="result-card__chips">' + chips + "</span>" : "") +
      (snippet ? '<span class="result-card__snippet">' + snippet + "</span>" : "") +
      "</a>" + favButton(item) + "</div>";
  }

  function renderList() {
    var items = filteredItems();
    var n = items.length;
    var msg = "<strong>" + n + "</strong> resultado" + (n === 1 ? "" : "s");
    if (currentQuery.expanded.length) msg += ' <span class="result-count__note">· busca ampliada para: ' + escapeHtml(currentQuery.expanded.join(", ")) + "</span>";
    el.resultCount.innerHTML = msg;
    el.results.innerHTML = n
      ? items.map(cardHtml).join("")
      : '<div class="empty-state">' + (state.favOnly && !currentQuery.norm && !state.category && !state.fonte
        ? "Nenhum favorito nesta aba ainda. Use a estrela ☆ para marcar os itens que você consulta mais."
        : "Nenhum resultado encontrado. Ajuste a busca ou os filtros.") + "</div>";
  }

  function markActiveCard() {
    var prev = el.results.querySelector(".result-card.active");
    if (prev) prev.classList.remove("active");
    if (!state.selectedId) return;
    var cards = el.results.querySelectorAll(".result-card");
    var key = state.tab + ":" + state.selectedId;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute("data-key") === key) { cards[i].classList.add("active"); break; }
    }
  }

  // ---------- Detalhe ----------
  function section(title, value) {
    if (!value) return "";
    return '<div class="detail__section"><h4>' + escapeHtml(title) + "</h4><p>" + highlight(value, currentQuery.terms) + "</p></div>";
  }

  function ingredientsTable(ingredients) {
    var rows = ingredients.map(function (ing) {
      return '<tr><td><a href="' + hrefFor("ingredientes", slug(ing.nome_chines)) + '">' + highlight(ing.nome_chines, currentQuery.terms) + "</a></td><td>" +
        highlight(ing.nome_cientifico, currentQuery.terms) + '</td><td class="pct">' + (ing.percentual ? escapeHtml(ing.percentual) + "%" : "—") + "</td></tr>";
    }).join("");
    return '<div class="table-wrap"><table class="ingredients"><thead><tr><th>Nome chinês</th><th>Nome científico</th><th class="pct">%</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>";
  }

  function notesHtml(notes) {
    return escapeHtml(notes).replace(/https?:\/\/[^\s<]+[^\s<.,;)]/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url + "</a>";
    });
  }

  function compareButton(item) {
    var pending = state.comparePending && BY_ID.formulas[state.comparePending];
    if (pending && pending !== item) {
      return '<a class="btn btn--primary" href="#comparar/' + encodeURIComponent(pending.id) + "/" + encodeURIComponent(item.id) + '">Comparar com ' + escapeHtml(pending.pinyin_name) + "</a>";
    }
    if (pending === item) return '<button class="btn" type="button" data-action="compare-cancel">Cancelar comparação</button>';
    return '<button class="btn" type="button" data-action="compare-start">Comparar com outra…</button>';
  }

  function usosTable(usos, title) {
    if (!usos.length) return "";
    var sorted = usos.slice().sort(function (a, b) {
      return pctNumber(b.pct) - pctNumber(a.pct) || a.item.pinyin_name.localeCompare(b.item.pinyin_name, "pt-BR");
    });
    var showFonte = sorted.some(function (u) { return u.item.fonte; });
    var rows = sorted.map(function (u) {
      return '<tr><td><a href="' + hrefFor(u.tab, u.item.id) + '">' + escapeHtml(u.item.pinyin_name) + "</a></td>" +
        (showFonte ? "<td>" + escapeHtml((u.item.fonte || "").replace(/ \(.*\)$/, "")) + "</td>" : "") +
        '<td class="pct">' + (u.pct ? escapeHtml(u.pct) + "%" : "—") + "</td></tr>";
    }).join("");
    return '<div class="detail__section"><h4>' + escapeHtml(title) + " (" + usos.length + ')</h4><div class="table-wrap"><table class="ingredients"><thead><tr><th>Nome</th>' +
      (showFonte ? "<th>Fonte</th>" : "") + '<th class="pct">%</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
  }

  function detailHtml(item) {
    var tab = item.__tab;
    var q = currentQuery.terms;
    var head = '<a class="detail__back" href="#' + tab + '" data-action="back">← Voltar à lista</a>' +
      '<div class="detail__header"><div><h3 class="detail__name">' + highlight(item.pinyin_name, q) +
      (item.caracteres_chineses ? ' <span class="detail__hanzi" lang="zh">' + escapeHtml(item.caracteres_chineses) + "</span>" : "") + "</h3>" +
      (item.western_name ? '<div class="detail__western">' + highlight(item.western_name, q) + "</div>" : "") +
      "</div>" + favButton(item, " fav-btn--detail") + "</div>";

    var chips = "";
    if (tab === "formulas") {
      if (item.grupo) chips += '<span class="chip chip--solid">' + escapeHtml(item.grupo) + "</span>";
      if (item.category) chips += '<span class="chip">' + escapeHtml(item.category) + "</span>";
    } else if (item.category) {
      chips += '<span class="chip chip--solid">' + escapeHtml(item.category) + "</span>";
    }
    if (item.fonte) chips += '<span class="chip chip--plain">Fonte: ' + escapeHtml(item.fonte) + "</span>";
    var body = chips ? '<div class="detail__chips">' + chips + "</div>" : "";

    if (item.alerta_cuidado) body += '<div class="detail__alerta" role="note">⚠ ' + escapeHtml(item.alerta_cuidado) + "</div>";

    if (tab === "ingredientes") {
      if (item.aliases.length) body += section("Também aparece como", item.aliases.join(", "));
      if (item.erva) {
        body += section("Indicação", item.erva.indicacao) + section("Ações", item.erva.acoes) +
          section("Características", item.erva.caracteristicas) + section("Canais", item.erva.canais);
      }
      body += usosTable(item.usos.filter(function (u) { return u.tab === "formulas"; }), "Fórmulas que contêm") +
        usosTable(item.usos.filter(function (u) { return u.tab === "topicas"; }), "Fórmulas de uso tópico");
    } else {
      body += section("Indicação", item.indicacao) + section("Ações", item.acoes);
    }

    if (tab === "formulas") {
      body += section("Síndromes", item.sindromes) + section("Sintomas e Sinais", item.sintomas_sinais);
      if (item.lingua || item.saburra || item.pulso) {
        body += '<div class="diagnosis-row">' + section("Língua", item.lingua) + section("Saburra", item.saburra) + section("Pulso", item.pulso) + "</div>";
      }
      body += section("Correspondências (Diagnóstico Ocidental)", item.correspondencias);
    } else if (tab === "ervas") {
      body += section("Características", item.caracteristicas) + section("Canais", item.canais);
      if (item.__ing) {
        body += '<div class="detail__section"><a href="' + hrefFor("ingredientes", item.__ing.id) + '">Ver as ' + item.__ing.usos.length + " fórmulas que contêm esta erva →</a></div>";
      }
    } else if (tab === "topicas") {
      body += section("Apresentações", item.apresentacoes);
    }

    if ((tab === "formulas" || tab === "topicas") && item.ingredients && item.ingredients.length) {
      body += '<div class="detail__section"><h4>Composição</h4>' + ingredientsTable(item.ingredients) + "</div>";
    }

    if (tab === "formulas") {
      var twins = twinsOf(item);
      if (twins.length) {
        body += '<div class="detail__section"><h4>Outras versões desta fórmula</h4><ul class="twins">' + twins.map(function (t) {
          return "<li><a href=\"" + hrefFor("formulas", t.id) + '">' + escapeHtml(t.pinyin_name) + "</a> <span class=\"twins__fonte\">" + escapeHtml(t.fonte || "") +
            '</span> · <a href="#comparar/' + encodeURIComponent(item.id) + "/" + encodeURIComponent(t.id) + '">comparar</a></li>';
        }).join("") + "</ul></div>";
      }
    }

    if (item.notes) body += '<div class="detail__notes">' + notesHtml(item.notes) + "</div>";
    if (FONTE_REF[item.fonte]) body += '<p class="detail__ref">Fonte: ' + escapeHtml(FONTE_REF[item.fonte]) + "</p>";

    var actions = '<div class="detail__actions">' + (tab === "formulas" ? compareButton(item) : "") +
      '<button class="btn" type="button" data-action="print">Imprimir</button></div>';

    return head + body + actions;
  }

  function renderDetail() {
    var item = state.selectedId ? BY_ID[state.tab][state.selectedId] : null;
    el.detail.innerHTML = item
      ? detailHtml(item)
      : '<div class="detail-placeholder">' + (state.selectedId ? "Item não encontrado." : "Selecione um item na lista para ver os detalhes completos.") + "</div>";
  }

  function renderCompareBar() {
    var pending = state.comparePending && BY_ID.formulas[state.comparePending];
    el.compareBar.hidden = !pending || state.view !== "list";
    if (pending) {
      el.compareBar.innerHTML = "Comparação: <strong>" + escapeHtml(pending.pinyin_name) + "</strong> (" + escapeHtml(pending.fonte || "") +
        ") selecionada. Abra outra fórmula e clique em “Comparar”. " +
        '<button class="btn btn--small" type="button" data-action="compare-cancel">Cancelar</button>';
    }
  }

  // ---------- Comparação ----------
  function renderCompare() {
    var a = BY_ID.formulas[state.compareIds[0]];
    var b = BY_ID.formulas[state.compareIds[1]];
    if (!a || !b) {
      el.compare.innerHTML = '<div class="empty-state">Fórmulas não encontradas para comparar. <a href="#formulas">Voltar</a></div>';
      return;
    }
    var col = function (item) {
      return '<th scope="col"><a href="' + hrefFor("formulas", item.id) + '">' + escapeHtml(item.pinyin_name) + "</a>" +
        '<span class="compare__fonte">' + escapeHtml(item.fonte || "") + "</span></th>";
    };
    var rows = [
      ["Classificação", function (i) { return [i.grupo, i.category].filter(Boolean).join(" · "); }],
      ["Alerta", function (i) { return i.alerta_cuidado; }],
      ["Indicação", function (i) { return i.indicacao; }],
      ["Ações", function (i) { return i.acoes; }],
      ["Síndromes", function (i) { return i.sindromes; }],
      ["Sintomas e sinais", function (i) { return i.sintomas_sinais; }],
      ["Língua", function (i) { return i.lingua; }],
      ["Saburra", function (i) { return i.saburra; }],
      ["Pulso", function (i) { return i.pulso; }],
      ["Diagnóstico ocidental", function (i) { return i.correspondencias; }]
    ].map(function (r) {
      var va = r[1](a);
      var vb = r[1](b);
      if (!va && !vb) return "";
      return '<tr class="compare__label"><th colspan="2" scope="colgroup">' + r[0] + "</th></tr><tr><td>" + (escapeHtml(va) || "—") + "</td><td>" + (escapeHtml(vb) || "—") + "</td></tr>";
    }).join("");

    var pa = {};
    var pb = {};
    a.ingredients.forEach(function (i) { pa[i.nome_chines] = i.percentual || "sim"; });
    b.ingredients.forEach(function (i) { pb[i.nome_chines] = i.percentual || "sim"; });
    var names = Object.keys(pa).concat(Object.keys(pb).filter(function (n) { return !pa[n]; }));
    names.sort(function (x, y) {
      return (pa[y] && pb[y] ? 1 : 0) - (pa[x] && pb[x] ? 1 : 0) || x.localeCompare(y, "pt-BR");
    });
    var cell = function (v) { return '<td class="pct' + (v ? "" : " compare__absent") + '">' + (v ? escapeHtml(v) + (v === "sim" ? "" : "%") : "—") + "</td>"; };
    var comp = names.map(function (n) {
      return '<tr><td><a href="' + hrefFor("ingredientes", slug(n)) + '">' + escapeHtml(n) + "</a></td>" + cell(pa[n]) + cell(pb[n]) + "</tr>";
    }).join("");
    var common = names.filter(function (n) { return pa[n] && pb[n]; }).length;

    el.compare.innerHTML =
      '<div class="compare__bar"><a class="btn" href="' + hrefFor("formulas", a.id) + '">← Voltar</a>' +
      '<button class="btn" type="button" data-action="print">Imprimir</button></div>' +
      '<h2 class="compare__title">Comparação de fórmulas</h2>' +
      '<div class="table-wrap"><table class="compare__table"><thead><tr>' + col(a) + col(b) + "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
      '<h3 class="compare__subtitle">Composição <span class="compare__note">' + common + " ingrediente" + (common === 1 ? "" : "s") + " em comum</span></h3>" +
      '<div class="table-wrap"><table class="ingredients compare__comp"><thead><tr><th>Ingrediente</th><th class="pct">' + escapeHtml(a.fonte || "A") +
      '</th><th class="pct">' + escapeHtml(b.fonte || "B") + "</th></tr></thead><tbody>" + comp + "</tbody></table></div>";
  }

  // ---------- Rotas (#aba/id, #comparar/a/b) ----------
  var listScrollY = 0;
  var listHidden = false;
  var wasOpen = false;
  var routed = false;
  var cameFromList = false;

  function parseRoute() {
    var h = "";
    try { h = decodeURIComponent(window.location.hash.replace(/^#/, "")); } catch (e) { h = ""; }
    var p = h.split("/");
    if (p[0] === "comparar" && p[1] && p[2]) return { view: "compare", ids: [p[1], p[2]] };
    var known = TABS.some(function (t) { return t.key === p[0]; });
    return { view: "list", tab: known ? p[0] : "formulas", id: p[1] || null };
  }

  function applyRoute() {
    var r = parseRoute();
    var tabChanged = false;
    var scrollBefore = window.scrollY;
    state.view = r.view;
    if (r.view === "compare") {
      state.compareIds = r.ids;
      state.comparePending = null;
    } else {
      tabChanged = r.tab !== state.tab;
      if (tabChanged) { state.tab = r.tab; state.category = ""; state.fonte = ""; }
      state.selectedId = r.id;
    }

    var open = state.view === "compare" || !!state.selectedId;
    el.appRoot.classList.toggle("app--compare", state.view === "compare");
    el.appRoot.classList.toggle("app--open", open);
    el.compare.hidden = state.view !== "compare";

    renderShell();
    renderCompareBar();
    if (state.view === "compare") {
      renderCompare();
    } else {
      if (tabChanged || !el.results.firstChild) { renderList(); } else { markActiveCard(); }
      renderDetail();
    }

    // No celular (e na comparação) a lista some enquanto o detalhe está aberto:
    // guarda a posição da lista para devolver ao voltar.
    var listHiddenNow = open && (isMobile() || state.view === "compare");
    if (listHiddenNow && !listHidden) { listScrollY = scrollBefore; }
    if (listHiddenNow) {
      window.scrollTo(0, 0);
    } else if (listHidden) {
      window.scrollTo(0, listScrollY);
    } else if (open) {
      el.detail.scrollTop = 0;
    }
    if (open && !wasOpen) { cameFromList = routed; }
    if (!open) { cameFromList = false; }
    listHidden = listHiddenNow;
    wasOpen = open;
    routed = true;
  }

  function go(hash) {
    if (window.location.hash === hash) { applyRoute(); } else { window.location.hash = hash; }
  }

  // ---------- Eventos ----------
  function refreshAfterFilter() {
    currentQuery = parseQuery(state.query);
    renderList();
    if (state.view === "list") renderDetail();
  }

  function bindEvents() {
    window.addEventListener("hashchange", applyRoute);

    var debounce = null;
    el.searchInput.addEventListener("input", function (e) {
      state.query = e.target.value;
      window.clearTimeout(debounce);
      debounce = window.setTimeout(refreshAfterFilter, 140);
    });

    el.categorySelect.addEventListener("change", function (e) { state.category = e.target.value; renderList(); });
    el.fonteSelect.addEventListener("change", function (e) { state.fonte = e.target.value; renderList(); });
    el.favOnly.addEventListener("change", function (e) { state.favOnly = e.target.checked; renderList(); });
    el.alertOnly.addEventListener("change", function (e) { state.alertOnly = e.target.checked; renderList(); });

    el.clearBtn.addEventListener("click", function () {
      state.query = "";
      state.category = "";
      state.fonte = "";
      state.favOnly = false;
      state.alertOnly = false;
      el.searchInput.value = "";
      currentQuery = parseQuery("");
      renderShell();
      renderList();
      go("#" + state.tab);
    });

    el.appRoot.addEventListener("click", function (e) {
      var favBtn = e.target.closest("[data-fav]");
      if (favBtn) {
        toggleFav(favBtn.getAttribute("data-fav"));
        if (state.favOnly) { renderList(); } else {
          var all = el.appRoot.querySelectorAll('[data-fav="' + favBtn.getAttribute("data-fav").replace(/"/g, '\\"') + '"]');
          var on = !!favs[favBtn.getAttribute("data-fav")];
          for (var i = 0; i < all.length; i++) {
            all[i].classList.toggle("on", on);
            all[i].setAttribute("aria-pressed", String(on));
            all[i].textContent = on ? "★" : "☆";
          }
        }
        return;
      }
      var actionEl = e.target.closest("[data-action]");
      if (!actionEl) return;
      var action = actionEl.getAttribute("data-action");
      if (action === "print") {
        window.print();
      } else if (action === "compare-start") {
        state.comparePending = state.selectedId;
        renderCompareBar();
        renderDetail();
      } else if (action === "compare-cancel") {
        state.comparePending = null;
        renderCompareBar();
        renderDetail();
      } else if (action === "back" && cameFromList) {
        e.preventDefault();
        window.history.back();
      }
    });
  }

  function init() {
    cacheEls();
    buildIndex();
    bindEvents();
    applyRoute();
    if ("serviceWorker" in navigator && /^https?:$/.test(window.location.protocol)) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
