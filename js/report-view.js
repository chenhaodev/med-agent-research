/* ============================================================================
   Corpus Report View — shared streaming + render + behavior re-init.

   The single home for "turn a reportId into a live Research Report". Both
   demo.html and report.html consume it, so the streaming mechanics and the
   interaction behaviors (citation tooltips, accordions, scroll-spy) live in one
   place instead of being copy-pasted per page.

   Depends on: js/api.js (window.CorpusApi, window.CorpusRender). Load after it.

   Public surface (window.CorpusReportView):
     mount(options)            -> stream a report into a container, returns a
                                  handle with .close().
     behaviors.initCitations(root)
     behaviors.initAccordion(root)
     behaviors.initScrollSpy()  -> the static fallback (js/app.js) reuses these
                                  so streamed and static content behave identically.
   ========================================================================== */
(function (global) {
  'use strict';

  var Render = global.CorpusRender;

  /* References shown before the "Show all N" toggle reveals the rest. */
  var REFS_SHOWN_BY_DEFAULT = 8;
  var METER_COLORS = { Yes: '#2FA98C', Possibly: '#E0A93B', Mixed: '#DB7B4B' };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var prefersReducedMotion =
    global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SCROLL_BEHAVIOR = prefersReducedMotion ? 'auto' : 'smooth';

  /* ------------------------------------------------------------------ *
   * Behaviors — idempotent, reusable across streamed + static content. *
   * Each guards already-wired nodes with a dataset flag so repeated     *
   * calls during streaming never double-bind.                           *
   * ------------------------------------------------------------------ */

  var tooltipEl = null;
  function ensureTooltip() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'rr-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  /** Rich citation tooltips (mouse + keyboard). Safe to call repeatedly. */
  function initCitations(root) {
    root = root || document;
    var tip = ensureTooltip();

    function show(c) {
      c.classList.add('is-active');
      var m = c.getAttribute('data-meter') || '';
      var dot = METER_COLORS[m] || '#888';
      tip.innerHTML =
        '<div class="rr-tooltip__meter"><span class="rr-tooltip__dot" style="background:' + dot + '"></span>' +
        '<span class="rr-tooltip__label">' + esc(m) + '</span></div>' +
        (c.getAttribute('data-title') || '');
      var r = c.getBoundingClientRect();
      tip.style.left = Math.max(12, Math.min(r.left, global.innerWidth - 300)) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      tip.classList.add('is-visible');
    }
    function hide(c) {
      c.classList.remove('is-active');
      tip.classList.remove('is-visible');
    }

    [].slice.call(root.querySelectorAll('.rr-cite')).forEach(function (c) {
      if (c.dataset.rrvCite === '1') return;
      c.dataset.rrvCite = '1';
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

  /** Expand/collapse accordions (Open research questions). Idempotent. */
  function initAccordion(root) {
    root = root || document;
    [].slice.call(root.querySelectorAll('.rr-acc-btn')).forEach(function (btn) {
      if (btn.dataset.rrvAcc === '1') return;
      btn.dataset.rrvAcc = '1';
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
        if (isOpen) close(); else open();
      });
    });
  }

  /** Scroll-spy over `.rr-toc-link[data-toc]`. Re-reads the DOM on each call so
   *  it tracks a TOC that is built up as headings stream in. The scroll/click
   *  listeners bind once; the link/section snapshot refreshes per call. */
  var spyLinks = [];
  var spySections = [];
  var spyBound = false;
  function spyOnScroll() {
    if (!spyLinks.length) return;
    var active = 0;
    for (var i = 0; i < spySections.length; i++) {
      var s = spySections[i];
      if (s && s.getBoundingClientRect().top <= 140) active = i;
    }
    spyLinks.forEach(function (l, i) {
      var on = i === active;
      l.style.color = on ? 'var(--accent)' : '';
      l.style.fontWeight = on ? '600' : '';
      l.style.borderLeftColor = on ? 'var(--accent)' : 'transparent';
      if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
    });
  }
  function scrollToEl(el) {
    if (!el) return;
    global.scrollTo({ top: global.scrollY + el.getBoundingClientRect().top - 80, behavior: SCROLL_BEHAVIOR });
  }
  function initScrollSpy() {
    spyLinks = [].slice.call(document.querySelectorAll('.rr-toc-link'));
    spySections = spyLinks.map(function (l) { return document.getElementById(l.getAttribute('data-toc')); });
    spyLinks.forEach(function (l) {
      if (l.dataset.rrvSpy === '1') return;
      l.dataset.rrvSpy = '1';
      l.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToEl(document.getElementById(l.getAttribute('data-toc')));
      });
    });
    if (!spyBound) {
      spyBound = true;
      global.addEventListener('scroll', spyOnScroll, { passive: true });
    }
    spyOnScroll();
  }

  /* ------------------------------------------------------------------ *
   * Skeleton + headline                                                 *
   * ------------------------------------------------------------------ */

  /** Build the canonical inner structure inside `root` and return its parts. */
  function buildSkeleton(root) {
    root.innerHTML =
      '<div class="rrv-status" data-rrv="status" hidden>' +
        '<span class="rrv-status__phase" data-rrv="phase">queued</span>' +
        '<span class="rrv-status__bar"><span class="rrv-status__fill" data-rrv="fill"></span></span>' +
      '</div>' +
      '<div data-rrv="title"></div>' +
      '<div data-rrv="blocks"></div>' +
      '<section id="sec-references" class="rr-refs" data-rrv="refs" hidden>' +
        '<div class="rr-refs__head"><h2 class="rr-refs__title">References</h2>' +
          '<span class="rr-refs__count" data-rrv="refcount">0</span></div>' +
        '<div class="rr-refs__list" data-rrv="refs-list"></div>' +
      '</section>';
    var q = function (sel) { return root.querySelector(sel); };
    return {
      status: q('[data-rrv="status"]'),
      phase: q('[data-rrv="phase"]'),
      fill: q('[data-rrv="fill"]'),
      title: q('[data-rrv="title"]'),
      blocks: q('[data-rrv="blocks"]'),
      refsSection: q('[data-rrv="refs"]'),
      refsList: q('[data-rrv="refs-list"]'),
      refCount: q('[data-rrv="refcount"]'),
    };
  }

  function renderHeadline(report) {
    var generated = report.generatedAt
      ? new Date(report.generatedAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })
      : '';
    var consensus = (report.consensus && report.consensus.label) || '';
    var studies = report.metrics ? report.metrics.contributingStudies : 0;
    return '' +
      '<div class="rr-kicker"><span class="rr-kicker__accent">Synthesis Report</span>' +
        (generated ? '<span>·</span><span>Generated ' + esc(generated) + '</span>' : '') +
        '<span>·</span><span>~' + (report.readingTimeMin || 0) + ' min read</span></div>' +
      '<h1 class="rr-title">What does the current evidence say about ' +
        '<span class="rr-title__accent">' + esc(report.topic || '') + '</span>?</h1>' +
      '<div class="rr-chips">' +
        (consensus ? '<span class="rr-chip"><span class="rr-chip__dot"></span>' + esc(consensus) + '</span>' : '') +
        '<span class="rr-chip">' + studies + ' contributing studies</span>' +
        (report.cadence === 'weekly' ? '<span class="rr-chip">Updated weekly</span>' : '') +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   * Table of contents (optional; populated from streamed h2 headings)   *
   * ------------------------------------------------------------------ */

  function slugify(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  }

  function makeToc(tocRoot) {
    if (!tocRoot) return { addHeading: function () {}, finalize: function () {} };
    /* Clear any static links, keep the label + corpus card. */
    [].slice.call(tocRoot.querySelectorAll('.rr-toc-link')).forEach(function (l) { l.remove(); });
    var corpusCard = tocRoot.querySelector('.rr-corpus-card');
    var used = {};
    return {
      /** Register a streamed h2; assigns the heading a stable id + a TOC link. */
      addHeading: function (headingEl, number, text) {
        var base = 'sec-' + slugify(text);
        var id = base;
        var n = 2;
        while (used[id]) { id = base + '-' + n++; }
        used[id] = true;
        headingEl.id = id;
        var link = document.createElement('a');
        link.className = 'rr-toc-link';
        link.setAttribute('data-toc', id);
        link.href = '#' + id;
        link.innerHTML = (number ? esc(number) + '&nbsp;&nbsp;' : '') + esc(text);
        if (corpusCard) tocRoot.insertBefore(link, corpusCard);
        else tocRoot.appendChild(link);
      },
      finalize: function () {},
    };
  }

  function updateCorpusCard(tocRoot, report) {
    if (!tocRoot) return;
    var num = tocRoot.querySelector('.rr-corpus-card__num');
    if (num && report.metrics) num.textContent = report.metrics.corpusSize;
    var note = tocRoot.querySelector('.rr-corpus-card__note');
    var retrieved = report.funnel && report.funnel.stages && report.funnel.stages[0];
    if (note && retrieved) {
      note.innerHTML = 'Generated from <strong>' + esc(fmtCount(retrieved.count)) + '</strong> retrieved records.';
    }
  }

  function fmtCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }

  /* ------------------------------------------------------------------ *
   * References list + "Show all N" toggle (driven by the real list)     *
   * ------------------------------------------------------------------ */

  function renderReferences(parts, refs) {
    var shown = refs.slice(0, REFS_SHOWN_BY_DEFAULT);
    var rest = refs.slice(REFS_SHOWN_BY_DEFAULT);

    var html = shown.map(Render.reference).join('');
    if (rest.length) {
      html += '<div class="rr-refs__more" id="rr-refs-more" hidden>' + rest.map(Render.reference).join('') + '</div>' +
        '<button id="rr-refs-toggle" class="rr-ghost-btn rr-refs-toggle" type="button" ' +
          'aria-controls="rr-refs-more" aria-expanded="false">' +
          '<span class="rr-refs-toggle__label">Show all ' + refs.length + ' references</span>' +
          '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
            'stroke-linecap="round" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg></button>';
    }
    parts.refsList.innerHTML = html;
    parts.refCount.textContent = refs.length;
    parts.refsSection.hidden = false;

    var btn = parts.refsList.querySelector('#rr-refs-toggle');
    var more = parts.refsList.querySelector('#rr-refs-more');
    if (btn && more) {
      var label = btn.querySelector('.rr-refs-toggle__label');
      btn.addEventListener('click', function () {
        var open = !more.hidden;
        if (open) {
          more.hidden = true;
          btn.setAttribute('aria-expanded', 'false');
          if (label) label.textContent = 'Show all ' + refs.length + ' references';
          scrollToEl(parts.refsSection);
        } else {
          more.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          if (label) label.textContent = 'Show fewer references';
        }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Block append (captures the heading element for the TOC)             *
   * ------------------------------------------------------------------ */

  function appendBlock(container, block) {
    var html = Render.block(block);
    if (!html) return null; // unknown block type -> skipped, never crashes
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var first = wrap.firstElementChild;
    while (wrap.firstChild) container.appendChild(wrap.firstChild);
    return first;
  }

  /* ------------------------------------------------------------------ *
   * mount() — the public orchestrator                                   *
   * ------------------------------------------------------------------ */

  function mount(options) {
    options = options || {};
    var root = options.root;
    if (!root) throw new Error('CorpusReportView.mount: options.root is required');
    var reportId = options.reportId;
    if (!reportId) throw new Error('CorpusReportView.mount: options.reportId is required');

    var api = options.api || new global.CorpusApi({ baseUrl: options.baseUrl });
    var tocRoot = options.tocRoot || null;
    var onStatus = options.onStatus || function () {};
    var onDone = options.onDone || function () {};
    var onError = options.onError || function () {};

    var parts = buildSkeleton(root);
    var toc = makeToc(tocRoot);

    function setStatus(phase, progress) {
      parts.status.hidden = false;
      parts.phase.textContent = phase;
      parts.fill.style.width = Math.round((progress || 0) * 100) + '%';
    }
    function fail(err) {
      parts.phase.textContent = 'error: ' + (err && (err.message || err.code) || 'unknown');
      parts.status.classList.add('is-error');
      onError(err);
    }

    setStatus('queued', 0.02);

    api.getReport(reportId)
      .then(function (shell) {
        parts.title.innerHTML = renderHeadline(shell);
      })
      .catch(function () { /* headline is best-effort; the stream carries the body */ });

    var source = api.streamReport(reportId, {
      status: function (d) {
        setStatus(d.phase, d.progress);
        onStatus(d);
      },
      block: function (d) {
        var el = appendBlock(parts.blocks, d.block);
        if (el && d.block.type === 'heading' && d.block.level === 2) {
          toc.addHeading(el, d.block.number, d.block.text);
        }
        initCitations(parts.blocks); // citations can appear mid-stream
      },
      references: function (d) {
        renderReferences(parts, d.added || []);
      },
      done: function (d) {
        var report = d.report;
        if (report && report.references && report.references.length) {
          renderReferences(parts, report.references);
        }
        // Headline may have been a partial shell; refresh from the final report.
        if (report) {
          parts.title.innerHTML = renderHeadline(report);
          updateCorpusCard(tocRoot, report);
        }
        initCitations(root);
        initAccordion(root);
        toc.finalize();
        initScrollSpy();
        setStatus('complete', 1);
        parts.status.hidden = true;
        onDone(report);
      },
      error: function (e) {
        fail(e);
      },
    });

    return {
      close: function () { if (source && source.close) source.close(); },
    };
  }

  global.CorpusReportView = {
    mount: mount,
    behaviors: {
      initCitations: initCitations,
      initAccordion: initAccordion,
      initScrollSpy: initScrollSpy,
    },
    scrollToEl: scrollToEl,
  };
})(window);
