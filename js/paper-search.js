/* ============================================================
   Paper Search — behaviours
   Ported from the design's DCLogic component, with accessibility
   wiring (dialog semantics, switch/radio roles, focus management).
   Search submission navigates to the report page.
   ============================================================ */
(function () {
  'use strict';

  var PROPS = { accent: '#0F766E' };
  var RESULT_URL = 'report.html'; /* the Research Report page */

  function applyTweaks() {
    var root = document.getElementById('ps-root');
    if (root) root.style.setProperty('--accent', PROPS.accent || '#0F766E');
  }

  /* ---------- Filter drawer (modal) ---------- */
  function initDrawer() {
    var overlay = document.getElementById('ps-overlay');
    var drawer = document.getElementById('ps-drawer');
    var openBtn = document.getElementById('ps-filter-open');
    var closeBtn = document.getElementById('ps-filter-close');
    if (!overlay || !drawer) return;

    var lastFocused = null;

    function open() {
      lastFocused = document.activeElement;
      drawer.classList.add('is-open');
      overlay.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
      if (closeBtn) closeBtn.focus();
    }
    function close() {
      drawer.classList.remove('is-open');
      overlay.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      if (openBtn) {
        openBtn.setAttribute('aria-expanded', 'false');
        if (lastFocused === closeBtn || drawer.contains(lastFocused)) openBtn.focus();
      }
    }

    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) close();
    });
  }

  /* ---------- Accordion groups ---------- */
  function initAccordion() {
    [].slice.call(document.querySelectorAll('.ps-acc')).forEach(function (btn) {
      var panel = btn.nextElementSibling;
      if (!panel) return;

      var panelId = panel.id || ('ps-acc-panel-' + Math.round(panel.getBoundingClientRect().top + Math.abs(panel.offsetTop)));
      panel.id = panelId;
      panel.setAttribute('role', 'region');
      btn.setAttribute('aria-controls', panelId);

      var startOpen = btn.getAttribute('aria-expanded') === 'true';

      function setOpen(isOpen) {
        panel.style.maxHeight = isOpen ? (panel.scrollHeight + 4) + 'px' : '0px';
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      }
      setOpen(startOpen);

      btn.addEventListener('click', function () {
        setOpen(btn.getAttribute('aria-expanded') !== 'true');
      });
    });
  }

  /* Recompute open panels' heights after layout/resize so content isn't clipped. */
  function refreshOpenPanels() {
    [].slice.call(document.querySelectorAll('.ps-acc[aria-expanded="true"]')).forEach(function (btn) {
      var panel = btn.nextElementSibling;
      if (panel) panel.style.maxHeight = (panel.scrollHeight + 4) + 'px';
    });
  }

  /* ---------- Toggles (switches) ---------- */
  function initToggles() {
    [].slice.call(document.querySelectorAll('.ps-toggle')).forEach(function (t) {
      t.setAttribute('role', 'switch');
      t.setAttribute('aria-checked', t.classList.contains('is-on') ? 'true' : 'false');
      t.addEventListener('click', function () {
        var on = t.classList.toggle('is-on');
        t.setAttribute('aria-checked', on ? 'true' : 'false');
        updateCount();
      });
    });
  }

  /* ---------- Segmented control ---------- */
  function initSegmented() {
    [].slice.call(document.querySelectorAll('.ps-seg')).forEach(function (group) {
      group.setAttribute('role', 'radiogroup');
      var btns = [].slice.call(group.querySelectorAll('.ps-seg-btn'));
      btns.forEach(function (b) {
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', b.classList.contains('is-on') ? 'true' : 'false');
        b.addEventListener('click', function () {
          btns.forEach(function (x) { x.classList.remove('is-on'); x.setAttribute('aria-checked', 'false'); });
          b.classList.add('is-on');
          b.setAttribute('aria-checked', 'true');
          updateCount();
        });
      });
    });
  }

  /* ---------- Active-filter count badge ---------- */
  function updateCount() {
    var n = 0;
    document.querySelectorAll('.ps-toggle.is-on').forEach(function () { n++; });
    document.querySelectorAll('.ps-seg-btn.is-on').forEach(function (b) {
      if (b.textContent.trim() !== 'Any') n++;
    });
    var badge = document.getElementById('ps-filter-count');
    if (!badge) return;
    if (n > 0) { badge.hidden = false; badge.textContent = n; }
    else { badge.hidden = true; }
  }

  /* ---------- Mode chips (single select) ---------- */
  function initModeChips() {
    var input = document.getElementById('ps-input');
    var chips = [].slice.call(document.querySelectorAll('.ps-chip'));
    chips.forEach(function (chip) {
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        var wasActive = chip.classList.contains('is-active');
        chips.forEach(function (c) { c.classList.remove('is-active'); c.setAttribute('aria-pressed', 'false'); });
        if (!wasActive) { chip.classList.add('is-active'); chip.setAttribute('aria-pressed', 'true'); }
        if (input) input.focus();
      });
    });
  }

  /* ---------- Reset filters ---------- */
  function initReset() {
    var btn = document.getElementById('ps-filter-reset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      /* toggles off */
      document.querySelectorAll('.ps-toggle.is-on').forEach(function (t) {
        t.classList.remove('is-on');
        t.setAttribute('aria-checked', 'false');
      });
      /* segmented controls back to first ("Any") */
      [].slice.call(document.querySelectorAll('.ps-seg')).forEach(function (group) {
        var btns = [].slice.call(group.querySelectorAll('.ps-seg-btn'));
        btns.forEach(function (b, i) {
          var on = i === 0;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      });
      /* selects + text inputs to defaults */
      document.querySelectorAll('.ps-drawer select').forEach(function (s) { s.selectedIndex = 0; });
      var minYear = document.querySelector('.ps-range-row .ps-input:first-of-type');
      if (minYear) minYear.value = '';
      var citations = document.querySelector('.ps-citation-row__input');
      if (citations) citations.value = '0';
      updateCount();
    });
  }

  /* ---------- Submit (Enter + go buttons) ---------- */
  function submitSearch() { window.location.href = RESULT_URL; }

  function initSubmit() {
    var input = document.getElementById('ps-input');
    if (input) {
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitSearch(); } });
    }
    /* The .ps-go anchors already navigate via href as a no-JS fallback. */
  }

  function init() {
    applyTweaks();
    initDrawer();
    initAccordion();
    initToggles();
    initSegmented();
    initModeChips();
    initReset();
    initSubmit();
    window.addEventListener('resize', refreshOpenPanels);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
