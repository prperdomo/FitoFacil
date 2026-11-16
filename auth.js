/*
 * Barreira de acesso simples (não é segurança real: qualquer pessoa que leia
 * este arquivo vê usuário e senha). Serve só para evitar que alguém abra o
 * link/arquivo por acaso e veja o conteúdo sem querer.
 *
 * Para trocar o usuário/senha, edite as constantes USER e PASS abaixo.
 * Para trocar o tempo de inatividade, edite INACTIVITY_MS.
 */
(function () {
  "use strict";

  var USER = "fito";
  var PASS = "@fito#2026";
  var STORAGE_KEY = "fitofacil_authed";
  var INACTIVITY_MS = 180000;
  var SAVE_EVERY_MS = 5000;
  var ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];

  // O que fica salvo é o horário da última atividade, para a sessão também
  // expirar com a aba fechada.
  function readLastActivity() {
    try { return parseInt(window.localStorage.getItem(STORAGE_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function saveLastActivity(ts) {
    try { window.localStorage.setItem(STORAGE_KEY, String(ts)); } catch (e) {}
  }
  function clearAuth() {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    var loginScreen = document.getElementById("loginScreen");
    var appRoot = document.getElementById("appRoot");
    var form = document.getElementById("loginForm");
    var userInput = document.getElementById("loginUser");
    var passInput = document.getElementById("loginPass");
    var errorEl = document.getElementById("loginError");
    var logoutBtn = document.getElementById("logoutBtn");

    var unlocked = false;
    var timer = null;
    var lastActivity = 0;
    var lastSaved = 0;

    function lock() {
      unlocked = false;
      clearAuth();
      if (timer) { window.clearTimeout(timer); timer = null; }
      ACTIVITY_EVENTS.forEach(function (evt) { document.removeEventListener(evt, onActivity); });
      appRoot.hidden = true;
      loginScreen.hidden = false;
      userInput.value = "";
      passInput.value = "";
      errorEl.hidden = true;
      userInput.focus();
    }

    function onActivity() {
      lastActivity = Date.now();
      if (lastActivity - lastSaved > SAVE_EVERY_MS) {
        lastSaved = lastActivity;
        saveLastActivity(lastActivity);
      }
      if (timer) { window.clearTimeout(timer); }
      timer = window.setTimeout(lock, INACTIVITY_MS);
    }

    function unlock() {
      unlocked = true;
      loginScreen.hidden = true;
      appRoot.hidden = false;
      lastSaved = 0;
      ACTIVITY_EVENTS.forEach(function (evt) { document.addEventListener(evt, onActivity, { passive: true }); });
      onActivity();
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if ((userInput.value || "").trim() === USER && (passInput.value || "") === PASS) {
        errorEl.hidden = true;
        unlock();
      } else {
        errorEl.hidden = false;
        passInput.value = "";
        passInput.focus();
      }
    });

    if (logoutBtn) { logoutBtn.addEventListener("click", lock); }

    // Timers em aba de fundo podem atrasar: confere de novo quando a aba volta.
    document.addEventListener("visibilitychange", function () {
      if (unlocked && !document.hidden && Date.now() - lastActivity > INACTIVITY_MS) { lock(); }
    });

    if (Date.now() - readLastActivity() < INACTIVITY_MS) {
      unlock();
    } else {
      clearAuth();
    }
  });
})();
