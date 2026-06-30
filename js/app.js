/* ============================================================
   Research Report — page controller (report.html)

   Two modes, decided by the `reportId` query parameter:
     • Dynamic  (?reportId=…): the page is driven live by the API via
       js/report-view.js — the headline from GET /reports/{id}, the body
       streamed from /reports/{id}/events, references from the real list.
     • Static   (no reportId): the server-rendered sample report stands as a
       graceful, no-backend fallback.

   The content behaviors (citation tooltips, accordions, scroll-spy) live in
   js/report-view.js and are reused here, so streamed and static content behave
   identically. This file owns only the page chrome (search, nav) and the
   mode switch.

   Depends on: js/config.js, js/api.js, js/report-view.js (loaded before this).
   ============================================================ */
(function () {
  'use strict';

  var PROPS = { accent: '#0F766E', bodySerif: true, showToc: true };

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

  var view = window.CorpusReportView;

  /* ---------- Theme / prop application ---------- */
  function applyTweaks() {
    var root = document.getElementById('rr-root');
    if (!root) return;
    root.style.setProperty('--accent', PROPS.accent || '#0F766E');
    var serif = PROPS.bodySerif !== false;
    root.style.setProperty('--body-font', serif ? "'Newsreader', Georgia, serif" : "'IBM Plex Sans', system-ui, sans-serif");
    var toc = document.getElementById('rr-toc');
    if (toc) toc.style.display = (PROPS.showToc === false) ? 'none' : '';
  }

  function scrollToEl(el) {
    if (!el) return;
    if (view && view.scrollToEl) { view.scrollToEl(el); return; }
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80, behavior: scrollBehavior });
  }

  /* ---------- Search: jump to first matching content ---------- */
  function initSearch() {
    var input = document.getElementById('rr-search-input');
    if (!input) return;
    var hlTimer;

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var q = input.value.trim().toLowerCase();
      if (!q) return;

      var candidates = [].slice.call(
        document.querySelectorAll('#rr-reading h2, #rr-reading h3, #rr-reading p, #rr-reading td, #rr-reading .rr-acc__q')
      );
      var match = null;
      for (var i = 0; i < candidates.length; i++) {
        if ((candidates[i].textContent || '').toLowerCase().indexOf(q) !== -1) { match = candidates[i]; break; }
      }
      if (!match) { input.setAttribute('aria-label', 'No match for "' + input.value + '"'); return; }

      scrollToEl(match);
      clearTimeout(hlTimer);
      match.classList.add('rr-hl');
      hlTimer = setTimeout(function () { match.classList.remove('rr-hl'); }, 1600);
    });
  }

  /* ---------- Nav buttons ---------- */
  function initNav() {
    var refsBtn = document.getElementById('rr-nav-refs');
    if (refsBtn) {
      refsBtn.addEventListener('click', function () { scrollToEl(document.getElementById('sec-references')); });
    }
    var exportBtn = document.getElementById('rr-nav-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        expandAllForExport();
        window.print();
      });
    }
  }

  function expandAllForExport() {
    /* Reveal collapsed content so the printed/exported copy is complete. */
    var more = document.getElementById('rr-refs-more');
    if (more) more.hidden = false;
    [].slice.call(document.querySelectorAll('.rr-acc-btn')).forEach(function (btn) {
      if (btn.getAttribute('aria-expanded') !== 'true') btn.click();
    });
  }

  /* ---------- Static-fallback content behaviors (reused from report-view) ---------- */
  function initStaticBehaviors() {
    if (!view) return;
    view.behaviors.initScrollSpy();
    view.behaviors.initAccordion(document);
    view.behaviors.initCitations(document);
  }

  /* ---------- Init ---------- */
  function init() {
    applyTweaks();
    initSearch();
    initNav();

    var reportId = new URLSearchParams(window.location.search).get('reportId');
    var reading = document.getElementById('rr-reading');

    if (reportId && view && reading) {
      // Dynamic mode: report-view owns the content + its behaviors.
      var params = new URLSearchParams(window.location.search);
      view.mount({
        reportId: reportId,
        root: reading,
        tocRoot: document.getElementById('rr-toc'),
        baseUrl: params.get('api') || undefined,
      });
    } else {
      // Static fallback: wire the server-rendered sample.
      initStaticBehaviors();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
