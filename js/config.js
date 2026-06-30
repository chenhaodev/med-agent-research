/* ============================================================================
   Corpus runtime config — a single, overridable API base.

   Load this BEFORE js/api.js. The default points at the local mock server; a
   deployment (or a test harness) can override it by setting window.CORPUS_API_BASE
   earlier — e.g. an inline <script> in the page, or via the `?api=` query param,
   which the pages forward into CorpusApi. Keeping the base in one place lets the
   same static pages point at any backend with zero code edits.
   ========================================================================== */
(function (global) {
  'use strict';
  if (typeof global.CORPUS_API_BASE !== 'string' || !global.CORPUS_API_BASE) {
    global.CORPUS_API_BASE = 'http://localhost:8787/api/v1';
  }
})(window);
