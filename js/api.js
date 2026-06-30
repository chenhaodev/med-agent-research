/* ============================================================================
   Corpus API client — browser integration point for the /api/v1 contract.
   Plain classic script (no bundler): exposes window.CorpusApi (HTTP + SSE) and
   window.CorpusRender (ContentBlock -> DOM). Types live in /api/types.ts.

   The renderer switches on block.type and ignores unknown types, so new block
   kinds ship backend-first without breaking this client.
   ========================================================================== */
(function (global) {
  'use strict';

  var FALLBACK_BASE = 'http://localhost:8787/api/v1';

  /* Resolve the API base at call time: explicit option > window.CORPUS_API_BASE
     (set by js/config.js) > hard fallback. Keeps the base in one place. */
  function resolveBase(explicit) {
    if (explicit) return explicit;
    if (typeof global.CORPUS_API_BASE === 'string' && global.CORPUS_API_BASE) {
      return global.CORPUS_API_BASE;
    }
    return FALLBACK_BASE;
  }

  /* ----------------------------- HTTP client ----------------------------- */

  function CorpusApi(options) {
    options = options || {};
    this.baseUrl = resolveBase(options.baseUrl);
    this.token = options.token || null;
  }

  CorpusApi.prototype._headers = function (extra) {
    var h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
    if (this.token) h['Authorization'] = 'Bearer ' + this.token;
    return h;
  };

  CorpusApi.prototype._request = function (method, path, body, extraHeaders) {
    var self = this;
    return fetch(this.baseUrl + path, {
      method: method,
      headers: this._headers(extraHeaders),
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = (data && data.error) || { code: 'http_' + res.status, message: res.statusText };
          var e = new Error(err.message);
          e.code = err.code;
          e.status = res.status;
          e.details = err.details;
          throw e;
        }
        return data;
      });
    });
  };

  /* ---- Facets ---- */
  CorpusApi.prototype.getFacets = function () {
    return this._request('GET', '/facets');
  };

  /* ---- Papers ---- */
  CorpusApi.prototype.searchPapers = function (query, page) {
    return this._request('GET', '/papers' + buildPaperQueryString(query, page));
  };
  CorpusApi.prototype.getPaper = function (id) {
    return this._request('GET', '/papers/' + encodeURIComponent(id));
  };

  /* ---- Reports ---- */
  CorpusApi.prototype.createReport = function (query, idempotencyKey) {
    var headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined;
    return this._request('POST', '/reports', { query: query }, headers);
  };
  CorpusApi.prototype.getReport = function (id) {
    return this._request('GET', '/reports/' + encodeURIComponent(id));
  };
  CorpusApi.prototype.listReports = function () {
    return this._request('GET', '/reports');
  };
  CorpusApi.prototype.deleteReport = function (id) {
    return this._request('DELETE', '/reports/' + encodeURIComponent(id));
  };

  /**
   * Stream report generation over SSE.
   * handlers: { status, funnel, meter, block, references, done, error }
   * Returns an object with .close().
   */
  CorpusApi.prototype.streamReport = function (id, handlers) {
    handlers = handlers || {};
    var url = this.baseUrl + '/reports/' + encodeURIComponent(id) + '/events';
    var source = new EventSource(url);
    var types = ['status', 'funnel', 'meter', 'block', 'references', 'done', 'error'];

    types.forEach(function (type) {
      source.addEventListener(type, function (evt) {
        var payload;
        try { payload = JSON.parse(evt.data); } catch (e) { payload = evt.data; }
        if (handlers[type]) handlers[type](payload);
        if (type === 'done' || type === 'error') source.close();
      });
    });
    source.onerror = function (e) {
      // EventSource auto-retries; surface only if the stream is closed.
      if (source.readyState === EventSource.CLOSED && handlers.error) {
        handlers.error({ code: 'stream_closed', message: 'Event stream closed' });
      }
    };
    return source;
  };

  /* ---- Auth ---- */
  CorpusApi.prototype.login = function (email, password) {
    var self = this;
    return this._request('POST', '/auth/login', { email: email, password: password }).then(function (res) {
      self.token = res.token;
      return res;
    });
  };
  CorpusApi.prototype.logout = function () {
    var self = this;
    return this._request('POST', '/auth/logout').then(function () { self.token = null; });
  };
  CorpusApi.prototype.me = function () {
    return this._request('GET', '/me');
  };

  /* ---- Saved searches / history ---- */
  CorpusApi.prototype.listSavedSearches = function () { return this._request('GET', '/saved-searches'); };
  CorpusApi.prototype.saveSearch = function (name, query) {
    return this._request('POST', '/saved-searches', { name: name, query: query });
  };
  CorpusApi.prototype.deleteSavedSearch = function (id) {
    return this._request('DELETE', '/saved-searches/' + encodeURIComponent(id));
  };
  CorpusApi.prototype.getHistory = function () { return this._request('GET', '/history'); };

  /* ---- Collections ---- */
  CorpusApi.prototype.listCollections = function () { return this._request('GET', '/collections'); };
  CorpusApi.prototype.createCollection = function (name) {
    return this._request('POST', '/collections', { name: name });
  };
  CorpusApi.prototype.getCollection = function (id) {
    return this._request('GET', '/collections/' + encodeURIComponent(id));
  };
  CorpusApi.prototype.addCollectionItem = function (id, ref, notes) {
    return this._request('POST', '/collections/' + encodeURIComponent(id) + '/items', { ref: ref, notes: notes });
  };
  CorpusApi.prototype.removeCollectionItem = function (id, itemId) {
    return this._request('DELETE', '/collections/' + encodeURIComponent(id) + '/items/' + encodeURIComponent(itemId));
  };

  /* --------------------- Query-string serialization ---------------------- */

  function buildPaperQueryString(query, page) {
    query = query || { question: '', mode: 'keyword', filters: {} };
    var f = query.filters || {};
    var params = [];
    function add(k, v) {
      if (v === undefined || v === null || v === '') return;
      params.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    }
    function addArray(k, arr) {
      (arr || []).forEach(function (v) { add(k, v); });
    }
    add('query', query.question);
    add('mode', query.mode);
    add('yearMin', f.yearMin);
    add('yearMax', f.yearMax);
    add('journalRank', f.journalRank);
    add('minCitations', f.minCitations);
    add('excludePreprints', f.excludePreprints);
    add('openAccess', f.openAccess);
    addArray('fields', f.fields);
    addArray('sources', f.sources);
    addArray('countries', f.countries);
    addArray('studyDesigns', f.studyDesigns);
    add('sampleSizeMin', f.sampleSizeMin);
    add('followUpMonthsMin', f.followUpMonthsMin);
    if (page) { add('cursor', page.cursor); add('limit', page.limit); }
    return params.length ? '?' + params.join('&') : '';
  }

  /* ============================ Block renderer ============================ */

  var STANCE_LABEL = { yes: 'Yes', possibly: 'Possibly', mixed: 'Mixed', no: 'No', na: 'NA' };
  var GRADE_CLASS = {
    strong: 'is-strong', moderate: 'is-moderate', weak: 'is-weak',
    emerging: 'is-emerging', mixed: 'is-moderate'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Replace {{cite:N}} tokens in prose HTML with .rr-cite markers carrying the
     matching CitationRef's stance + tooltip (mirrors report.html markup). */
  function injectCitations(html, citations) {
    var byNumber = {};
    (citations || []).forEach(function (c) { byNumber[c.number] = c; });
    return String(html || '').replace(/\{\{cite:(\d+)\}\}/g, function (_, n) {
      var c = byNumber[n];
      if (!c) return '';
      var meter = STANCE_LABEL[c.stance] || c.stance;
      return '<span class="rr-cite" data-meter="' + esc(meter) + '" data-title="' +
        esc(c.tooltip || '') + '">' + n + '</span>';
    });
  }

  function figcap(text) {
    if (!text) return '';
    var parts = String(text).split('—');
    var tag = parts.length > 1 ? parts[0].trim() : '';
    var rest = parts.length > 1 ? parts.slice(1).join('—').trim() : text;
    return '<figcaption class="rr-figcap rr-figcap--tableflow">' +
      (tag ? '<span class="rr-figcap__tag">' + esc(tag) + '</span>' : '') + esc(rest) + '</figcaption>';
  }

  function renderHeading(b) {
    var num = b.number ? esc(b.number) + '&nbsp;&nbsp;' : '';
    if (b.level === 3) return '<h3 class="rr-h3">' + num + esc(b.text) + '</h3>';
    return '<h2 class="rr-h2">' + num + esc(b.text) + '</h2>';
  }

  function renderTldr(b) {
    return '<div class="rr-tldr"><div class="rr-tldr__label">' + esc(b.label) +
      '</div><p class="rr-tldr__text">' + b.html + '</p></div>';
  }

  function renderProse(b) {
    return '<p class="rr-body">' + injectCitations(b.html, b.citations) + '</p>';
  }

  function renderMeter(b) {
    var segs = b.buckets.map(function (bk) {
      var pct = b.n ? (bk.count / b.n * 100).toFixed(1) : 0;
      return '<div class="rr-meter__seg is-' + esc(bk.stance) + '" style="width:' + pct + '%;"><span>' +
        bk.count + '</span></div>';
    }).join('');
    var legend = b.buckets.map(function (bk) {
      return '<span class="rr-legend-item"><span class="rr-legend-item__sw is-' + esc(bk.stance) +
        '"></span>' + esc(bk.label || STANCE_LABEL[bk.stance] || bk.stance) + '</span>';
    }).join('');
    return '<figure class="rr-figure"><div class="rr-card"><div class="rr-meter__head">' +
      '<div class="rr-meter__q">' + esc(b.question) + '</div><span class="rr-meter__n">N = ' + b.n + '</span></div>' +
      '<div class="rr-meter__bar">' + segs + '</div><div class="rr-meter__legend">' + legend + '</div></div>' +
      figcap(b.caption) + '</figure>';
  }

  function fmtCount(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }

  function renderFunnel(b) {
    var steps = b.stages.map(function (s, i) {
      var last = i === b.stages.length - 1;
      return (i ? '<div class="rr-funnel__arrow">→</div>' : '') +
        '<div class="rr-funnel__step' + (last ? ' is-final' : '') + '"><div class="rr-funnel__num">' +
        fmtCount(s.count) + '</div><div class="rr-funnel__label">' + esc(s.label) + '</div></div>';
    }).join('');
    return '<div class="rr-funnel">' + steps + '</div>' + figcap(b.caption);
  }

  function renderKeyPapers(b) {
    var rows = b.items.map(function (it) {
      return '<tr><td class="rr-paper__cell"><div class="rr-paper"><span class="rr-num">' + it.citationCount +
        '</span><div><div class="rr-paper__title">' + esc(it.title) + '</div><div class="rr-paper__meta">' +
        esc(it.authors) + ' · ' + it.year + ' · ' + esc(it.venue) + '</div></div></div></td>' +
        '<td class="rr-paper__summary">' + esc(it.summary) + '</td></tr>';
    }).join('');
    return '<table class="rr-table"><thead><tr><th class="rr-table__th" style="width:46%;">Paper</th>' +
      '<th class="rr-table__th is-last">Summary</th></tr></thead><tbody>' + rows + '</tbody></table>' + figcap(b.caption);
  }

  function renderEvidenceMatrix(b) {
    var rows = b.rows.map(function (r) {
      var label = r.grade.charAt(0).toUpperCase() + r.grade.slice(1);
      return '<tr><td class="rr-table__td is-lead">' + esc(r.direction) + '</td><td class="rr-table__td">' +
        esc(r.outcomes) + '</td><td class="rr-table__td"><span class="rr-evi"><span class="rr-evi__dot ' +
        (GRADE_CLASS[r.grade] || '') + '"></span>' + esc(label) + '</span></td><td class="rr-table__td is-num">' +
        r.paperCount + '</td></tr>';
    }).join('');
    return '<div class="rr-scroll-x"><table class="rr-table rr-table--wide"><thead><tr>' +
      '<th class="rr-table__th">Direction</th><th class="rr-table__th">Typical outcomes</th>' +
      '<th class="rr-table__th">Evidence</th><th class="rr-table__th is-right">Papers</th></tr></thead><tbody>' +
      rows + '</tbody></table></div>' + figcap(b.caption);
  }

  function renderTimeline(b) {
    var from = b.axis.from, to = b.axis.to;
    var x = function (year) { return 80 + (year - from) / (to - from) * 600; };
    var circles = b.points.map(function (p) {
      var r = Math.max(4, Math.min(22, p.citationCount));
      var cy = 220 - r * 7;
      return '<circle cx="' + x(p.year).toFixed(0) + '" cy="' + Math.max(20, cy).toFixed(0) + '" r="' + r +
        '" fill="var(--accent)" fill-opacity="0.65" stroke="#fff" stroke-width="1.5"></circle>';
    }).join('');
    var ticks = '';
    for (var yr = from; yr <= to; yr += 5) {
      ticks += '<text x="' + x(yr).toFixed(0) + '" y="238" fill="#9A9A93" font-size="11" text-anchor="middle">' + yr + '</text>';
    }
    return '<figure class="rr-figure--chart"><svg viewBox="0 0 700 260" style="width:100%;height:auto;display:block;" ' +
      'role="img" aria-label="Publications over time; larger markers indicate more citations.">' +
      '<line x1="10" y1="220" x2="700" y2="220" stroke="#D8D5CD" stroke-width="1"></line>' +
      circles + ticks + '</svg></figure>' + figcap(b.caption);
  }

  function renderClaims(b) {
    var rows = b.rows.map(function (r) {
      var label = r.strength.charAt(0).toUpperCase() + r.strength.slice(1);
      return '<tr><td class="rr-table__td is-claim">' + esc(r.claim) + '</td><td class="rr-table__td is-pillcell">' +
        '<span class="rr-pill ' + (GRADE_CLASS[r.strength] || '') + '"><span class="rr-pill__dot"></span>' + esc(label) +
        '</span></td><td class="rr-table__td is-reason">' + esc(r.reasoning) + '</td></tr>';
    }).join('');
    return '<table class="rr-table"><thead><tr><th class="rr-table__th" style="width:42%;">Claim</th>' +
      '<th class="rr-table__th">Strength</th><th class="rr-table__th is-last">Reasoning</th></tr></thead><tbody>' +
      rows + '</tbody></table>' + figcap(b.caption);
  }

  function renderGapHeatmap(b) {
    var head = b.dimensions.map(function (d) {
      return '<th class="rr-table__th is-center">' + esc(d) + '</th>';
    }).join('');
    var rows = b.rows.map(function (r) {
      var cells = r.cells.map(function (c, i) {
        var lvl = c.level === 'high' ? 'is-high' : c.level === 'med' ? 'is-med' : 'is-low';
        var txt = c.level.toUpperCase();
        return '<td class="rr-heat-cell' + (i === r.cells.length - 1 ? ' is-last' : '') + '"><div class="rr-heat ' +
          lvl + '">' + txt + '</div></td>';
      }).join('');
      return '<tr><td class="rr-heat-label"><div>' + esc(r.topic) + '</div></td>' + cells + '</tr>';
    }).join('');
    return '<div class="rr-scroll-x"><table class="rr-table rr-table--heat"><thead><tr>' +
      '<th class="rr-table__th">Topic</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div>' + figcap(b.caption);
  }

  function renderOpenQuestions(b) {
    var items = b.items.map(function (q) {
      return '<div class="rr-acc__item"><button class="rr-acc-btn" type="button"><span class="rr-acc__q">' +
        esc(q.question) + '</span></button><div class="rr-acc-panel" style="max-height:none;padding:2px 0 16px;">' +
        esc(q.answer) + '</div></div>';
    }).join('');
    return '<div class="rr-acc">' + items + '</div>';
  }

  var RENDERERS = {
    heading: renderHeading,
    prose: renderProse,
    tldr: renderTldr,
    consensusMeter: renderMeter,
    funnel: renderFunnel,
    keyPapers: renderKeyPapers,
    evidenceMatrix: renderEvidenceMatrix,
    timeline: renderTimeline,
    claims: renderClaims,
    gapHeatmap: renderGapHeatmap,
    openQuestions: renderOpenQuestions
  };

  var CorpusRender = {
    injectCitations: injectCitations,
    /** Render one ContentBlock to an HTML string. Unknown types -> '' (skipped). */
    block: function (b) {
      var fn = RENDERERS[b && b.type];
      return fn ? fn(b) : '';
    },
    /** Render a reference list entry. */
    reference: function (r) {
      var vol = r.volume ? ' <em>' + esc(r.venue) + '</em>, ' + esc(r.volume) + (r.issue ? '(' + esc(r.issue) + ')' : '') +
        (r.pages ? ', ' + esc(r.pages) : '') + '.' : ' <em>' + esc(r.venue) + '</em>.';
      return '<div class="rr-ref"><span class="rr-num">' + r.number + '</span><div class="rr-ref__text">' +
        '<span class="rr-ref__authors">' + esc((r.authors || []).join(', ')) + '</span> (' + r.year + '). ' +
        esc(r.title) + vol + '</div></div>';
    }
  };

  global.CorpusApi = CorpusApi;
  global.CorpusRender = CorpusRender;
})(window);
