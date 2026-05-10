/**
 * Aplica el tema guardado antes del primer pintado (evita parpadeo).
 * Migra claves antiguas: ion→aurora, ember→coral, aqua→laguna.
 * Por defecto: tema soft (kit morado luminoso).
 */
(function () {
  var KEY = "umgPanelTheme";
  var LEGACY = { ion: "aurora", ember: "coral", aqua: "laguna" };
  var ALLOWED = ["soft", "aurora", "coral", "laguna", "paper"];
  try {
    var t = localStorage.getItem(KEY);
    if (t && LEGACY[t]) {
      t = LEGACY[t];
      localStorage.setItem(KEY, t);
    }
    if (!t || ALLOWED.indexOf(t) < 0) t = "soft";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "soft");
  }
})();
