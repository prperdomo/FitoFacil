/*
 * Barreira de acesso simples (não é segurança real: qualquer pessoa que leia
 * este arquivo vê usuário e senha). Serve só para evitar que alguém abra o
 * link/arquivo por acaso e veja o conteúdo sem querer.
 *
 * Para trocar o usuário/senha, edite as constantes USER e PASS abaixo.
 */
(function () {
  "use strict";

  var USER = "fito";
  var PASS = "@fito#2026";
  var STORAGE_KEY = "fitofacil_authed";

  function show(el) { el.hidden = false; }
  function hide(el) { el.hidden = true; }

  document.addEventListener("DOMContentLoaded", function () {
    var loginScreen = document.getElementById("loginScreen");
    var appRoot = document.getElementById("appRoot");
    var form = document.getElementById("loginForm");
    var userInput = document.getElementById("loginUser");
    var passInput = document.getElementById("loginPass");
    var errorEl = document.getElementById("loginError");

    function unlock() {
      hide(loginScreen);
      show(appRoot);
    }

    var authed = false;
    try {
      authed = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
      authed = false;
    }

    if (authed) {
      unlock();
      return;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var u = (userInput.value || "").trim();
      var p = passInput.value || "";
      if (u === USER && p === PASS) {
        try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch (e) {}
        errorEl.hidden = true;
        unlock();
      } else {
        errorEl.hidden = false;
        passInput.value = "";
        passInput.focus();
      }
    });
  });
})();
