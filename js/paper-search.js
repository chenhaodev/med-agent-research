/* ============================================================
   Paper Search — behaviours (index.html)

   Wires the search hero + filter drawer to the live API:
     • readQuery()   reads the drawer + searchbox into a ResearchQuery.
     • loadFacets()  populates the drawer catalogs from GET /facets.
     • submitSearch  POST /reports, then navigates to report.html?reportId=…
                     (the static href stays as a no-JS fallback).

   readQuery() is exposed on window.PaperSearch for unit testing; it is a pure
   DOM read (no network), so it can be exercised in jsdom.

   Depends on: js/config.js, js/api.js (loaded before this).
   ============================================================ */
(function () {
  'use strict';

  var PROPS = { accent: '#0F766E' };
  var RESULT_URL = 'report.html'; /* the Research Report page (no-JS fallback) */

  var params = new URLSearchParams(window.location.search);
  var api = (typeof window.CorpusApi === 'function')
    ? new window.CorpusApi({ baseUrl: params.get('api') || undefined })
    : null;

  function applyTweaks() {
    var root = document.getElementById('ps-root');
    if (root) root.style.setProperty('--accent', PROPS.accent || '#0F766E');
  }

  /* ---------------------------------------------------------------- *
   * readQuery — drawer + searchbox  ->  ResearchQuery                 *
   * A pure DOM read so it is unit-testable in isolation.             *
   * ---------------------------------------------------------------- */
  function readQuery(root) {
    root = root || document;
    var q = function (sel) { return root.querySelector(sel); };
    var all = function (sel) { return [].slice.call(root.querySelectorAll(sel)); };

    function intOrUndef(sel) {
      var el = q(sel);
      if (!el) return undefined;
      var v = parseInt(String(el.value).trim(), 10);
      return isNaN(v) ? undefined : v;
    }
    function selectedIds(facet) {
      return all('.ps-fos[data-facet="' + facet + '"] .ps-tag.is-on').map(function (t) {
        return t.getAttribute('data-id');
      });
    }

    var input = q('#ps-input');
    var question = input ? input.value.trim() : '';

    var activeChip = q('.ps-chip.is-active');
    var mode = (activeChip && activeChip.getAttribute('data-mode')) || 'keyword';

    var activeSeg = q('.ps-seg-btn.is-on');
    var yearPreset = (activeSeg && activeSeg.getAttribute('data-preset')) || 'any';

    var rankEl = q('.ps-select[data-field="journalRank"]');
    var journalRank = rankEl ? rankEl.value : 'any';

    var minCitations = intOrUndef('[data-field="minCitations"]');
    var yearMin = intOrUndef('[data-field="yearMin"]');
    var yearMax = intOrUndef('[data-field="yearMax"]');

    var excludePreprints = !!q('.ps-toggle[data-field="excludePreprints"].is-on');
    var openAccess = !!q('.ps-toggle[data-field="openAccess"].is-on');

    var fields = selectedIds('fieldsOfStudy');
    var sources = selectedIds('sources');
    var countries = selectedIds('countries');
    var studyDesigns = selectedIds('studyDesigns');

    /* Build filters, omitting defaults/empties so payloads stay tidy. */
    var filters = {};
    if (yearPreset && yearPreset !== 'any') filters.yearPreset = yearPreset;
    if (yearMin !== undefined) filters.yearMin = yearMin;
    if (yearMax !== undefined) filters.yearMax = yearMax;
    if (journalRank && journalRank !== 'any') filters.journalRank = journalRank;
    if (minCitations !== undefined && minCitations > 0) filters.minCitations = minCitations;
    if (excludePreprints) filters.excludePreprints = true;
    if (openAccess) filters.openAccess = true;
    if (fields.length) filters.fields = fields;
    if (sources.length) filters.sources = sources;
    if (countries.length) filters.countries = countries;
    if (studyDesigns.length) filters.studyDesigns = studyDesigns;

    return { question: question, mode: mode, filters: filters };
  }

  /* ---------------------------------------------------------------- *
   * Facet catalogs — populate the drawer from GET /facets            *
   * ---------------------------------------------------------------- */
  var FACET_NOUNS = {
    fieldsOfStudy: 'fields of study',
    countries: 'countries',
    sources: 'publishers',
    studyDesigns: 'study designs',
  };

  function renderFacetTags(container, items) {
    container.innerHTML = '';
    items.forEach(function (item) {
      var tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'ps-tag';
      tag.setAttribute('data-id', item.id);
      tag.setAttribute('aria-pressed', 'false');
      tag.textContent = item.label;
      tag.addEventListener('click', function () {
        var on = tag.classList.toggle('is-on');
        tag.setAttribute('aria-pressed', on ? 'true' : 'false');
        updateCount();
        refreshOpenPanels();
      });
      container.appendChild(tag);
    });
  }

  function loadFacets() {
    if (!api || typeof window.fetch !== 'function') return;
    api.getFacets().then(function (facets) {
      Object.keys(FACET_NOUNS).forEach(function (facet) {
        var container = document.querySelector('.ps-fos[data-facet="' + facet + '"]');
        var items = facets[facet];
        if (!container || !Array.isArray(items)) return;
        renderFacetTags(container, items);
        var sub = document.querySelector('[data-count-for="' + facet + '"]');
        if (sub) sub.textContent = items.length + ' ' + FACET_NOUNS[facet];
      });
      refreshOpenPanels();
    }).catch(function () {
      /* Facets unavailable (offline / no backend) — the drawer still works with
         the General filters; catalog accordions simply stay empty. */
    });
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
      refreshOpenPanels();
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

  /* Recompute open panels' heights after layout/resize/catalog-load. */
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
      if ((b.getAttribute('data-preset') || b.textContent.trim()) !== 'any' && b.textContent.trim() !== 'Any') n++;
    });
    document.querySelectorAll('.ps-fos .ps-tag.is-on').forEach(function () { n++; });
    var rank = document.querySelector('.ps-select[data-field="journalRank"]');
    if (rank && rank.value && rank.value !== 'any') n++;
    var cit = document.querySelector('[data-field="minCitations"]');
    if (cit && parseInt(cit.value, 10) > 0) n++;
    var yMin = document.querySelector('[data-field="yearMin"]');
    if (yMin && String(yMin.value).trim() !== '') n++;

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
      document.querySelectorAll('.ps-toggle.is-on').forEach(function (t) {
        t.classList.remove('is-on');
        t.setAttribute('aria-checked', 'false');
      });
      [].slice.call(document.querySelectorAll('.ps-seg')).forEach(function (group) {
        var btns = [].slice.call(group.querySelectorAll('.ps-seg-btn'));
        btns.forEach(function (b, i) {
          var on = i === 0;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
      });
      document.querySelectorAll('.ps-fos .ps-tag.is-on').forEach(function (t) {
        t.classList.remove('is-on');
        t.setAttribute('aria-pressed', 'false');
      });
      document.querySelectorAll('.ps-drawer select').forEach(function (s) { s.selectedIndex = 0; });
      var minYear = document.querySelector('[data-field="yearMin"]');
      if (minYear) minYear.value = '';
      var citations = document.querySelector('[data-field="minCitations"]');
      if (citations) citations.value = '0';
      updateCount();
    });
  }

  /* ---------- Submit: create a report, then navigate to it ---------- */
  var submitting = false;
  function submitSearch() {
    if (submitting) return;
    if (!api) { window.location.href = RESULT_URL; return; } // no client -> static fallback

    submitting = true;
    setBusy(true);
    var query = readQuery(document);

    api.createReport(query).then(function (job) {
      var qs = 'reportId=' + encodeURIComponent(job.reportId);
      if (params.get('api')) qs += '&api=' + encodeURIComponent(params.get('api'));
      window.location.href = RESULT_URL + '?' + qs;
    }).catch(function (err) {
      submitting = false;
      setBusy(false);
      announce('Could not start the report: ' + (err && err.message ? err.message : 'request failed'));
    });
  }

  function setBusy(on) {
    [].slice.call(document.querySelectorAll('.ps-go')).forEach(function (go) {
      go.setAttribute('aria-busy', on ? 'true' : 'false');
      go.style.pointerEvents = on ? 'none' : '';
      go.style.opacity = on ? '0.65' : '';
    });
  }

  function announce(msg) {
    var input = document.getElementById('ps-input');
    if (input) input.setAttribute('aria-label', msg);
  }

  function initSubmit() {
    var input = document.getElementById('ps-input');
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitSearch(); }
      });
    }
    /* Intercept the .ps-go anchors; keep their href as a no-JS fallback. */
    [].slice.call(document.querySelectorAll('.ps-go')).forEach(function (go) {
      go.addEventListener('click', function (e) {
        e.preventDefault();
        submitSearch();
      });
    });
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
    loadFacets();
    window.addEventListener('resize', refreshOpenPanels);
  }

  /* Expose the pure read for unit tests. */
  window.PaperSearch = { readQuery: readQuery };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
