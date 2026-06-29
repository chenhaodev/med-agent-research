/* ============================================================
   Research Report — behaviours
   Ported from the design's DCLogic component, plus the
   previously non-functional controls (search, export, refs).
   No external framework required.
   ============================================================ */
(function () {
  'use strict';

  /* Default props (mirror the design's prop defaults). */
  var PROPS = { accent: '#0F766E', bodySerif: true, showToc: true };

  var prefersReducedMotion =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

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

  /* ---------- Scroll-spy table of contents ---------- */
  function initScrollSpy() {
    var links = [].slice.call(document.querySelectorAll('.rr-toc-link'));
    if (!links.length) return;
    var sections = links.map(function (l) { return document.getElementById(l.getAttribute('data-toc')); });

    function onScroll() {
      var active = 0;
      for (var i = 0; i < sections.length; i++) {
        var s = sections[i];
        if (s && s.getBoundingClientRect().top <= 140) active = i;
      }
      links.forEach(function (l, i) {
        var on = i === active;
        l.style.color = on ? 'var(--accent)' : '';
        l.style.fontWeight = on ? '600' : '';
        l.style.borderLeftColor = on ? 'var(--accent)' : 'transparent';
        if (on) { l.setAttribute('aria-current', 'true'); } else { l.removeAttribute('aria-current'); }
      });
    }

    links.forEach(function (l) {
      l.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToEl(document.getElementById(l.getAttribute('data-toc')));
      });
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function scrollToEl(el) {
    if (!el) return;
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80, behavior: scrollBehavior });
  }

  /* ---------- Accordion ---------- */
  function initAccordion() {
    [].slice.call(document.querySelectorAll('.rr-acc-btn')).forEach(function (btn) {
      var panel = btn.nextElementSibling;
      var icon = btn.querySelector('.rr-acc-icon');
      if (!panel) return;

      var panelId = panel.id || ('rr-acc-panel-' + Math.round(panel.getBoundingClientRect().top));
      panel.id = panelId;
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-controls', panelId);
      panel.setAttribute('role', 'region');

      function close() {
        panel.style.maxHeight = '0px';
        panel.style.paddingTop = '0px';
        panel.style.paddingBottom = '0px';
        if (icon) icon.style.transform = 'rotate(0deg)';
        btn.setAttribute('aria-expanded', 'false');
      }
      function open() {
        panel.style.paddingTop = '2px';
        panel.style.paddingBottom = '16px';
        panel.style.maxHeight = (panel.scrollHeight + 4) + 'px';
        if (icon) icon.style.transform = 'rotate(180deg)';
        btn.setAttribute('aria-expanded', 'true');
      }

      close();
      btn.addEventListener('click', function () {
        var isOpen = panel.style.maxHeight && panel.style.maxHeight !== '0px';
        if (isOpen) { close(); } else { open(); }
      });
    });
  }

  /* ---------- Citation tooltips (mouse + keyboard) ---------- */
  function initCitations() {
    var colors = { Yes: '#2FA98C', Possibly: '#E0A93B', Mixed: '#DB7B4B' };

    var tip = document.createElement('div');
    tip.className = 'rr-tooltip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);

    function show(c) {
      c.classList.add('is-active');
      var m = c.getAttribute('data-meter') || '';
      var dot = colors[m] || '#888';
      tip.innerHTML =
        '<div class="rr-tooltip__meter"><span class="rr-tooltip__dot" style="background:' + dot + '"></span>' +
        '<span class="rr-tooltip__label">' + m + '</span></div>' +
        (c.getAttribute('data-title') || '');
      var r = c.getBoundingClientRect();
      tip.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 300)) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      tip.classList.add('is-visible');
    }
    function hide(c) {
      c.classList.remove('is-active');
      tip.classList.remove('is-visible');
    }

    [].slice.call(document.querySelectorAll('.rr-cite')).forEach(function (c) {
      var num = c.textContent.trim();
      var m = c.getAttribute('data-meter') || '';
      c.setAttribute('tabindex', '0');
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', 'Reference ' + num + (m ? ', evidence: ' + m : ''));

      c.addEventListener('mouseenter', function () { show(c); });
      c.addEventListener('mouseleave', function () { hide(c); });
      c.addEventListener('focus', function () { show(c); });
      c.addEventListener('blur', function () { hide(c); });
    });
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

  /* ---------- References: progressive "show all" ----------
     Baseline 3 refs are server-rendered in the HTML. The remaining
     entries are generated here as template placeholders so the
     "Show all N" control is functional and the list stays generic.
     Swap buildPlaceholderRefs() for real data when wiring a backend. */
  var TOTAL_REFS = 50;
  var SHOWN_BY_DEFAULT = 3;

  function buildPlaceholderRefs(from, to) {
    var refs = [];
    for (var n = from; n <= to; n++) {
      refs.push({
        n: n,
        authors: 'Author ' + String.fromCharCode(64 + ((n % 26) || 26)) + ' et al.',
        year: 2018 + (n % 8),
        title: 'Placeholder title for corpus entry ' + n + '.',
        venue: 'Journal Name',
        vol: (n % 18) + 1,
        issue: (n % 4) + 1
      });
    }
    return refs;
  }

  function refMarkup(r) {
    return (
      '<div class="rr-ref">' +
      '<span class="rr-num">' + r.n + '</span>' +
      '<div class="rr-ref__text"><span class="rr-ref__authors">' + r.authors + '</span> (' + r.year + '). ' +
      r.title + ' <em>' + r.venue + '</em>, ' + r.vol + '(' + r.issue + ').</div>' +
      '</div>'
    );
  }

  function initReferences() {
    var btn = document.getElementById('rr-refs-toggle');
    var more = document.getElementById('rr-refs-more');
    if (!btn || !more) return;

    var extra = buildPlaceholderRefs(SHOWN_BY_DEFAULT + 1, TOTAL_REFS);
    more.innerHTML = extra.map(refMarkup).join('');

    var labelEl = btn.querySelector('.rr-refs-toggle__label');
    btn.setAttribute('aria-controls', 'rr-refs-more');
    btn.setAttribute('aria-expanded', 'false');
    more.hidden = true;

    btn.addEventListener('click', function () {
      var open = !more.hidden;
      if (open) {
        more.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        if (labelEl) labelEl.textContent = 'Show all ' + TOTAL_REFS + ' references';
        scrollToEl(document.getElementById('sec-references'));
      } else {
        more.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        if (labelEl) labelEl.textContent = 'Show fewer references';
      }
    });
  }

  /* ---------- Init ---------- */
  function init() {
    applyTweaks();
    initScrollSpy();
    initAccordion();
    initCitations();
    initSearch();
    initNav();
    initReferences();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
