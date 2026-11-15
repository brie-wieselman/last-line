/* Last Line · app logic.
   Everything runs in the browser. The Gemini key, inputs, voiceprint and history
   live in localStorage and are sent only to generativelanguage.googleapis.com.
   All model output and imported text is rendered with textContent, never as HTML. */
(function () {
  'use strict';

  var API = 'https://generativelanguage.googleapis.com/v1beta';
  // Local testing only: point at a mock Gemini server (ignored on any non-localhost host).
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { try { API = localStorage.getItem('ll.mockApi') || API; } catch (e) { /* no storage */ } }
  var MODEL_PREFS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  var VP_HOSTS = ['raw.githubusercontent.com', 'gist.githubusercontent.com'];
  var VP_MAX = 40000; // characters
  var EXAMPLE_VP = 'https://raw.githubusercontent.com/brie-wieselman/voiceprint/main/examples/example-fingerprint.md';
  var WPS = 2.5; // spoken words per second

  var REFINE = {
    shorter: 'Make this script about 25% shorter. Keep every beat, the hook and the last line. Cut filler first.',
    lastline: 'Rewrite only the final beats so the script ends on a stronger last line: one sentence that stands alone, is inarguable, and lands quietly. Keep everything before it.',
    specific: 'Make this script more specific: swap any abstraction for a concrete number, timeframe, body part, lab value or object. Use [YOUR NUMBER] placeholders instead of inventing facts.'
  };

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('ll.' + k); if (v === null) localStorage.removeItem('ll.' + k); else localStorage.setItem('ll.' + k, v); } catch (e) { return null; } }
  function storeJSON(k, v) { if (v === undefined) { try { return JSON.parse(store(k) || 'null'); } catch (e) { return null; } } store(k, JSON.stringify(v)); }
  function val(id) { var n = $(id); return n ? n.value.trim() : ''; }
  function setStatus(id, msg, kind) { var n = $(id); n.textContent = msg || ''; n.className = 'status' + (kind ? ' ' + kind : ''); if (id === 'runStatus' && $('outStatus')) setStatus('outStatus', msg, kind); }
  function setErr(id, msg, field) { $(id).textContent = msg || ''; if (field) $(field).setAttribute('aria-invalid', msg ? 'true' : 'false'); }
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function scrollTo(node, block) { node.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: block || 'start' }); }
  function words(t) { return (t.match(/[A-Za-z0-9'’]+/g) || []).length; }

  var state = {
    key: store('key') || '',
    model: store('model') || '',
    mode: 'write',
    voice: store('voice') || 'none',
    vp: storeJSON('vp'),          // {text, source} — accepted voiceprint
    vpDraft: null,                // previewed, not yet accepted
    busy: false,
    cards: []
  };

  // ---------- format menu from playbook ----------
  (function buildFormats() {
    var sel = $('format'), groups = {};
    Object.keys(FORMATS).forEach(function (k) {
      var f = FORMATS[k];
      if (!groups[f.group]) { groups[f.group] = el('optgroup'); groups[f.group].label = f.group; sel.appendChild(groups[f.group]); }
      var o = el('option', null, f.label); o.value = k; groups[f.group].appendChild(o);
    });
  })();

  // ---------- remember form fields ----------
  var REMEMBER = ['format', 'goal', 'length', 'platform', 'audience', 'cta', 'avoid'];
  var saved = storeJSON('form') || {};
  REMEMBER.forEach(function (id) { if (saved[id]) $(id).value = saved[id]; $(id).addEventListener('change', saveForm); });
  function saveForm() { var o = {}; REMEMBER.forEach(function (id) { o[id] = $(id).value; }); storeJSON('form', o); }

  // ---------- Gemini key ----------
  function renderKey() {
    if (engine()) { $('keyPill').classList.add('on'); $('keyPillTxt').textContent = engine().label; $('keyBox').hidden = true; return; }
    var on = !!state.key;
    $('keyPill').classList.toggle('on', on);
    $('keyPillTxt').textContent = on ? 'Connected · ' + (state.model || 'Gemini') : 'Add Gemini key';
    $('keyPill').setAttribute('aria-label', on ? 'Gemini connected. Click to disconnect.' : 'Add a Gemini key');
    $('keyBox').hidden = on;
  }
  function friendly(status, data) {
    var msg = data && data.error && data.error.message || '';
    if (status === 400 && /API key/i.test(msg)) return 'Google says that key is not valid. Copy it again from AI Studio.';
    if (status === 403) return 'That key does not have access to Gemini. Make a new one in AI Studio.';
    if (/prepayment|credits are depleted/i.test(msg)) return 'This key belongs to a Google project with billing turned on but no credits left, so Google blocks it. Fix: in AI Studio, go to API Keys, choose Create API key, then "Create in new project". New projects use the free tier.';
    if (status === 429 && /per ?day|PerDay|daily/i.test(msg)) return 'Your free key has used today\'s Gemini requests for the models it can use. It resets at midnight Pacific time. Each Write uses about 5 requests.';
    if (status === 429) return 'Free-tier limit reached for now (too many requests a minute). Wait a minute and try again.';
    if (status >= 500) return 'Google\'s Gemini servers are overloaded right now (' + status + '). I retried and tried backup models. Wait a minute and press Write again.';
    return msg || ('Request failed (' + status + ').');
  }
  function apiError(status, data) { var e = new Error(friendly(status, data)); e.status = status; return e; }

  // Models this key can call; cached so fallbacks only try names that exist.
  function listModels(key) {
    return fetch(API + '/models?pageSize=200&key=' + encodeURIComponent(key)).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (!r.ok) throw apiError(r.status, d);
        var names = ((d && d.models) || []).filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') > -1; })
          .map(function (m) { return String(m.name).replace(/^models\//, ''); });
        state.models = names; storeJSON('models', names);
        return names;
      });
    });
  }
  function pickModel(key) {
    return listModels(key).then(function (names) {
      {
        for (var i = 0; i < MODEL_PREFS.length; i++) if (names.indexOf(MODEL_PREFS[i]) > -1) return MODEL_PREFS[i];
        var flash = names.filter(function (n) { return /^gemini-[\d.]+-flash$/.test(n); }).sort().reverse();
        return flash[0] || names.filter(function (n) { return /^gemini/.test(n) && !/embed/.test(n); })[0] || MODEL_PREFS[0];
      }
    });
  }
  // FALLBACKS filtered to what the key lists, then any other text flash model it lists.
  function fallbackModels() {
    var have = state.models || storeJSON('models');
    if (!have || !have.length) return FALLBACKS;
    // Preview flash models go last: some keys list only those for newer versions.
    var extra = have.filter(function (n) { return /^gemini-.*flash/.test(n) && !/embed|image|tts|live|audio/.test(n); })
      .sort(function (a, b) { return /preview/.test(a) - /preview/.test(b); });
    return FALLBACKS.filter(function (m) { return have.indexOf(m) > -1; }).concat(extra.filter(function (m) { return FALLBACKS.indexOf(m) === -1; }));
  }
  $('connectBtn').addEventListener('click', function () {
    var k = val('apiKey'), btn = this;
    if (!k) return setStatus('keyStatus', 'Paste your key first.', 'bad');
    btn.disabled = true; setStatus('keyStatus', 'Checking with Google…');
    pickModel(k).then(function (m) {
      state.key = k; state.model = m; store('key', k); store('model', m);
      $('apiKey').value = ''; setStatus('keyStatus', ''); renderKey(); $('topic').focus();
    }).catch(function (e) { setStatus('keyStatus', e.message, 'bad'); })
      .then(function () { btn.disabled = false; });
  });
  $('apiKey').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('connectBtn').click(); } });
  $('keyPill').addEventListener('click', function () {
    if (!state.key) { $('apiKey').focus(); return; }
    if (confirm('Disconnect this Gemini key from this browser?')) {
      state.key = ''; state.model = ''; store('key', null); store('model', null); renderKey();
    }
  });

  // ---------- streaming call ----------
  // Optional local add-on can supply its own engine: window.LL_ENGINE = {label, call(system, user, temp, onText)}.
  function engine() { return window.LL_ENGINE && typeof window.LL_ENGINE.call === 'function' ? window.LL_ENGINE : null; }
  function ready() { return !!(state.key || engine()); }
  // Retry Google's temporary errors (500/503 overloaded), then fall back to other models.
  var FALLBACKS = ['gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash'];
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function call(system, user, temp, onText) {
    if (engine()) return engine().call(system, user, temp, onText);
    var tried = [state.model || MODEL_PREFS[0]], late = false;
    function attempt(n) {
      return once(system, user, temp, onText).catch(function (e) {
        if (e && e.name === 'AbortError') throw new Error('Gemini sent nothing for 90 seconds, so I stopped waiting. Try again, or pick a shorter length. If it keeps happening, your key may be rate-limited for a few minutes.');
        if (e.status === 404) return pickModel(state.key).then(function (m) { state.model = m; store('model', m); renderKey(); return once(system, user, temp, onText); });
        if (e.status >= 500 || e.status === 429) {
          if (n < 2) { setStatus('runStatus', 'Google is busy. Retrying (' + (n + 1) + ' of 2)…'); return wait(3000 * (n + 1)).then(function () { return attempt(n + 1); }); }
          if (e.status < 500 && e.status !== 429) throw e;
          return (state.models ? Promise.resolve() : listModels(state.key).catch(function () {})).then(function () {
            var next = fallbackModels().filter(function (m) { return tried.indexOf(m) === -1; })[0];
            if (!next) {
              // Every model was busy: one last slow try on the first, since 503s often clear in seconds.
              if (late || e.status < 500) throw e;
              late = true; tried = [tried[0]]; state.model = tried[0]; store('model', tried[0]); renderKey();
              setStatus('runStatus', 'Google is busy on every model. One more try in 20 seconds…');
              return wait(20000).then(function () { return attempt(0); });
            }
            tried.push(next); state.model = next; store('model', next); renderKey();
            setStatus('runStatus', 'That model is busy or out of free requests. Switching to ' + next + '…');
            return attempt(0);
          });
        }
        throw e;
      });
    }
    return attempt(0);
  }

  function once(system, user, temp, onText) {
    var url = API + '/models/' + encodeURIComponent(state.model || MODEL_PREFS[0]) + ':streamGenerateContent?alt=sse&key=' + encodeURIComponent(state.key);
    var ctl = window.AbortController ? new AbortController() : null, firstText = false;
    var guard = ctl && setTimeout(function () { if (!firstText) ctl.abort(); }, 90000);
    return fetch(url, {
      signal: ctl ? ctl.signal : undefined,
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: temp, topP: 0.95, maxOutputTokens: 8192 }
      })
    }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return null; }).then(function (d) { throw apiError(r.status, d); });
      var reader = r.body.getReader(), dec = new TextDecoder(), buf = '', full = '';
      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) { if (!full) throw new Error('Nothing came back. Try again.'); return full; }
          buf += dec.decode(chunk.value, { stream: true });
          var lines = buf.split('\n'); buf = lines.pop();
          lines.forEach(function (line) {
            line = line.trim(); if (line.indexOf('data:') !== 0) return;
            try {
              var j = JSON.parse(line.slice(5));
              var parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
              parts.forEach(function (p) { if (p.text) full += p.text; });
            } catch (e) { /* partial frame */ }
          });
          if (full) { firstText = true; if (guard) clearTimeout(guard); }
          if (onText && full) onText(full);
          return pump();
        });
      }
      return pump();
    });
  }

  // ---------- voice ----------
  // Optional local add-on (personal.js, never deployed) can append rules or decorate cards.
  function systemFor(template) {
    var extra = typeof window.LL_EXTRA === 'function' ? window.LL_EXTRA(val('topic')) : '';
    return buildSystem(template, state.voice, state.vp && state.vp.text) + (extra ? '\n\n' + extra : '');
  }
  function renderVoice() {
    document.querySelectorAll('input[name="voice"]').forEach(function (r) { r.checked = r.value === state.voice; });
    $('importer').hidden = state.voice !== 'import';
    $('importDesc').textContent = state.vp ? 'Using: ' + state.vp.source : 'Make one from your own writing in about a minute, or import one.';
    var show = state.vpDraft || state.vp;
    $('vpPreview').hidden = !show;
    if (show) {
      $('vpSource').textContent = show.source;
      $('vpSize').textContent = words(show.text) + ' words';
      $('vpText').textContent = show.text;
      $('vpUse').hidden = !state.vpDraft;
      $('vpKeep').hidden = !/^Made in Last Line/.test(show.source);
    }
  }
  document.querySelectorAll('input[name="voice"]').forEach(function (r) {
    r.addEventListener('change', function () { state.voice = r.value; store('voice', r.value); renderVoice(); });
  });

  // Turn a GitHub/Gist page link into its raw-file URL, and refuse anything else.
  function toRaw(input) {
    var u;
    try { u = new URL(input); } catch (e) { throw new Error('That does not look like a full link. It should start with https://'); }
    if (u.protocol !== 'https:') throw new Error('Only https links are allowed.');
    if (u.username || u.password) throw new Error('Links with a login inside them are not allowed.');
    var p = u.pathname.split('/').filter(Boolean);
    if (u.hostname === 'github.com' && p[2] === 'blob' && p.length >= 5) {
      u = new URL('https://raw.githubusercontent.com/' + [p[0], p[1]].concat(p.slice(3)).join('/'));
    } else if (u.hostname === 'gist.github.com' && p.length >= 2) {
      u = new URL('https://gist.githubusercontent.com/' + p[0] + '/' + p[1] + '/raw');
    }
    if (VP_HOSTS.indexOf(u.hostname) === -1) throw new Error('Use a GitHub file or Gist link. Other sites are blocked so nothing unexpected gets loaded.');
    u.search = ''; u.hash = '';
    return u.toString();
  }
  // Clean untrusted text: drop control characters, cap length, refuse web pages.
  function cleanVoiceprint(text) {
    text = String(text).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
    if (!text) throw new Error('That file is empty.');
    if (/<\s*(html|script|iframe|body)\b/i.test(text.slice(0, 2000))) throw new Error('That looks like a web page, not a voiceprint file. Use the "Raw" file link.');
    if (text.length > VP_MAX) throw new Error('That file is too long (' + text.length.toLocaleString() + ' characters). A voiceprint should be under ' + VP_MAX.toLocaleString() + '.');
    return text;
  }
  function draft(text, source) {
    state.vpDraft = { text: cleanVoiceprint(text), source: source };
    setErr('vpErr', '', 'vpUrl'); renderVoice(); $('vpText').focus();
  }
  function loadUrl(raw, label) {
    var btn = $('vpFetch'); btn.disabled = true; setErr('vpErr', '', 'vpUrl');
    var url;
    try { url = toRaw(raw); } catch (e) { btn.disabled = false; return setErr('vpErr', e.message, 'vpUrl'); }
    fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(r.status === 404 ? 'File not found. Is the repo public?' : 'Could not load that file (' + r.status + ').');
      var host = new URL(r.url).hostname;
      if (VP_HOSTS.indexOf(host) === -1) throw new Error('That link redirected somewhere unexpected, so it was blocked.');
      var len = +r.headers.get('content-length');
      if (len && len > VP_MAX * 4) throw new Error('That file is too large to be a voiceprint.');
      return r.text();
    }).then(function (t) { draft(t, label || url.replace('https://', '')); })
      .catch(function (e) { setErr('vpErr', e.message === 'Failed to fetch' ? 'Could not reach that link.' : e.message, 'vpUrl'); })
      .then(function () { btn.disabled = false; });
  }
  $('vpFetch').addEventListener('click', function () { loadUrl(val('vpUrl')); });
  $('vpUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); loadUrl(val('vpUrl')); } });
  $('vpExample').addEventListener('click', function () { loadUrl(EXAMPLE_VP, 'Voiceprint example (brie-wieselman/voiceprint)'); });
  $('vpFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    if (f.size > VP_MAX * 4) return setErr('vpErr', 'That file is too large to be a voiceprint.');
    if (!/\.(md|txt|markdown)$/i.test(f.name)) return setErr('vpErr', 'Use a .md or .txt file.');
    f.text().then(function (t) { draft(t, f.name); }).catch(function (e) { setErr('vpErr', e.message); });
  });
  $('vpPasteBtn').addEventListener('click', function () { $('vpPasteWrap').hidden = false; $('vpPaste').focus(); });
  $('vpPasteUse').addEventListener('click', function () { try { draft($('vpPaste').value, 'Pasted text'); } catch (e) { setErr('vpErr', e.message); } });
  $('vpUse').addEventListener('click', function () {
    state.vp = state.vpDraft; state.vpDraft = null; storeJSON('vp', state.vp); renderVoice();
    setStatus('runStatus', 'Voiceprint saved. Your next run uses it.', 'ok');
  });
  $('vpClear').addEventListener('click', function () {
    state.vp = null; state.vpDraft = null; store('vp', null); $('vpPaste').value = ''; $('vpPasteWrap').hidden = true; renderVoice();
  });
  // wrap draft() errors from file/paste paths
  $('vpDownload').addEventListener('click', function () {
    var v = state.vpDraft || state.vp; if (!v) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([v.text], { type: 'text/markdown' }));
    a.download = 'voice-fingerprint.md'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });

  // ---------- make a voiceprint from samples ----------
  var MK_MIN = 4, MK_MAX = 6, MK_WORDS = 30;
  var MK_CONTEXTS = ['Work (email, post, article)', 'Personal (letter, journal, message)', 'Persuasive (pitch, rant, opinion)', 'Casual (text, quick comment)', 'Other'];
  // Writing about your own voice is not evidence (Voiceprint's one hard rule).
  var SELF_DESC = /\b(my (writing |brand |personal )?(voice|tone|style) is|i (write|sound|speak|come across) (in a |like |as )|my style (is|would be)|i('m| am) (very |pretty |quite |really )?(witty|warm|direct|funny|professional|authoritative|casual|friendly|punchy|conversational)\b)/i;
  function mkAddSample(ctx) {
    var box = $('mkSamples'), n = box.children.length;
    if (n >= MK_MAX) return;
    var wrap = el('div', 'mksample'), head = el('div', 'mkhead'), id = 'mkS' + (n + 1);
    var lab = el('label', null, 'Sample ' + (n + 1)); lab.htmlFor = id;
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'Sample ' + (n + 1) + ' context');
    MK_CONTEXTS.forEach(function (c) { var o = el('option', null, c); o.value = c; sel.appendChild(o); });
    sel.value = MK_CONTEXTS[ctx != null ? ctx : Math.min(n, MK_CONTEXTS.length - 1)];
    var ta = document.createElement('textarea'); ta.id = id; ta.rows = 4; ta.placeholder = 'Paste something you actually wrote.';
    head.appendChild(lab); head.appendChild(sel); wrap.appendChild(head); wrap.appendChild(ta); box.appendChild(wrap);
    $('mkAdd').hidden = box.children.length >= MK_MAX;
    return ta;
  }
  for (var mi = 0; mi < MK_MIN; mi++) mkAddSample(mi);
  $('mkAdd').addEventListener('click', function () { var t = mkAddSample(); if (t) t.focus(); });
  $('mkGo').addEventListener('click', function () {
    setErr('mkErr', ''); setStatus('mkStatus', '');
    if (state.busy) return;
    if (!ready()) { setErr('mkErr', 'Connect a Gemini key first (step 1, above).'); $('apiKey').focus(); return; }
    var samples = [], bad = null;
    document.querySelectorAll('#mkSamples .mksample').forEach(function (w, i) {
      var t = w.querySelector('textarea').value.trim(); if (!t) return;
      if (!bad && SELF_DESC.test(t) && words(t) < 120) bad = 'Sample ' + (i + 1) + ' describes your style instead of showing it. Paste something you actually wrote, like an email or a post.';
      else if (!bad && words(t) < MK_WORDS) bad = 'Sample ' + (i + 1) + ' is too short. Use at least ' + MK_WORDS + ' words so there is a pattern to find.';
      samples.push({ ctx: w.querySelector('select').value, text: cleanVoiceprint(t).slice(0, 8000) });
    });
    if (bad) return setErr('mkErr', bad);
    if (samples.length < MK_MIN) return setErr('mkErr', 'Add at least ' + MK_MIN + ' samples. You have ' + samples.length + '.');
    var ctxs = samples.map(function (x) { return x.ctx; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    var prompt = 'Build my voice fingerprint from these ' + samples.length + ' samples. Today is ' + new Date().toLocaleDateString('en-CA') + '.\n\n' +
      samples.map(function (x, i) { return '<<<SAMPLE ' + (i + 1) + ' (' + x.ctx + ')>>>\n' + x.text.replace(/<<<|>>>/g, '') + '\n<<<END SAMPLE ' + (i + 1) + '>>>'; }).join('\n\n');
    var btn = $('mkGo'); btn.disabled = true; state.busy = true;
    setStatus('mkStatus', 'Reading your samples… about 20 seconds.' + (ctxs.length < 2 ? ' All samples share one context, so the result will be weaker.' : ''));
    call(VOICEPRINT_MAKER, prompt, 0.3).then(function (t) {
      t = String(t).trim().replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/, '$1');
      var refused = t.match(/^\s*REFUSED:\s*(.+)/);
      if (refused) { setStatus('mkStatus', ''); return setErr('mkErr', refused[1].trim()); }
      try { cleanVoiceprint(t); } catch (err) { setStatus('mkStatus', ''); return setErr('mkErr', 'Gemini sent back something unusable. Try again.'); }
      draft(t, 'Made in Last Line from ' + samples.length + ' samples');
      setStatus('mkStatus', 'Done. Read it below. Does it feel like you, or a performance of you? Then use it or download it.', 'ok');
    }).catch(function (e) { setStatus('mkStatus', ''); setErr('mkErr', e.message); })
      .then(function () { btn.disabled = false; state.busy = false; });
  });

  var _draft = draft; draft = function (t, s) { try { _draft(t, s); } catch (e) { setErr('vpErr', e.message, 'vpUrl'); } };

  // ---------- mode tabs ----------
  var RUN_LABEL = { write: 'Write 3 scripts', hooks: 'Write 10 hooks', grade: 'Grade my script' };
  function setMode(m) {
    state.mode = m;
    document.querySelectorAll('.tabs [role="tab"]').forEach(function (t) { var on = t.dataset.mode === m; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    document.querySelectorAll('[data-for]').forEach(function (n) { n.hidden = n.dataset.for.split(' ').indexOf(m) === -1; });
    $('runBtn').textContent = RUN_LABEL[m];
    $('outTitle').textContent = m === 'hooks' ? 'Hooks' : m === 'grade' ? 'Grade' : 'Scripts';
  }
  document.querySelectorAll('.tabs [role="tab"]').forEach(function (t) {
    t.addEventListener('click', function () { setMode(t.dataset.mode); });
    t.addEventListener('keydown', function (e) {
      var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]')), i = tabs.indexOf(t);
      var n = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : e.key === 'ArrowLeft' ? tabs[(i + tabs.length - 1) % tabs.length] : e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[tabs.length - 1] : null;
      if (n) { e.preventDefault(); n.focus(); n.click(); }
    });
  });

  // ---------- prompt context ----------
  function context() {
    var f = FORMATS[$('format').value] || FORMATS.value;
    return [
      'TOPIC: ' + val('topic'),
      'VIDEO FORMAT: ' + f.label,
      'FORMAT BEAT MAP (follow exactly, in order): ' + f.beats,
      'PLATFORM: ' + $('platform').value,
      'TARGET LENGTH: ' + $('length').value,
      GOALS[$('goal').value] || GOALS.reach,
      'AUDIENCE: ' + (val('audience') || '(infer the most likely viewer)'),
      'REAL NUMBERS / FACTS TO USE (verbatim; never invent others): ' + (val('facts') || '(none given — use bracketed placeholders like [YOUR NUMBER])'),
      'DO NOT SAY: ' + (val('avoid') || '(nothing extra)'),
      'CALL TO ACTION: ' + (val('cta') || '(choose one that serves the goal)')
    ].join('\n');
  }

  // ---------- run ----------
  $('modePanel').addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.busy) return;
    if (!ready()) { setStatus('runStatus', 'Connect a Gemini key first (step 1, above).', 'bad'); $('apiKey').focus(); return; }
    if (state.voice === 'import' && !state.vp) { setStatus('runStatus', 'Load and accept a voiceprint, or pick another voice.', 'bad'); $('vpUrl').focus(); return; }
    var m = state.mode, system, prompt, temp = 0.95;
    if (m === 'grade') {
      if (!val('pasted')) { setErr('pastedErr', 'Paste a script to grade.', 'pasted'); $('pasted').focus(); return; }
      setErr('pastedErr', '', 'pasted');
      system = systemFor(AUDIT_TEMPLATE); temp = 0.4;
      prompt = 'Grade this script.\n\nSCRIPT:\n"""\n' + val('pasted') + '\n"""';
    } else {
      if (!val('topic')) { setErr('topicErr', 'Say what the video is about.', 'topic'); $('topic').focus(); return; }
      setErr('topicErr', '', 'topic');
      system = systemFor(PLAYBOOK_TEMPLATE);
      prompt = (m === 'hooks'
        ? 'Write 10 original hook options (the first spoken line only). Use at least 5 different hook families. Number them 1. to 10., one per line, ending each with the family in square brackets, e.g. [OBSERVATION]. Nothing else.'
        : 'Write THREE distinct original scripts. Put "=== VARIATION 1 ===", "=== VARIATION 2 ===" and "=== VARIATION 3 ===" on their own lines before each. Each uses a DIFFERENT hook family.') + '\n\n' + context();
    }
    if (m === 'write') return runWrite();
    run(system, prompt, temp, m);
  });

  // ---------- results view ----------
  var OUT_TITLE = { write: 'Your 3 scripts', hooks: 'Your 10 hooks', grade: 'Your grade' };
  function showResults(kind) {
    document.body.classList.add('results');
    $('outTitle').textContent = OUT_TITLE[kind] || 'Scripts';
    $('backBtn').hidden = false;
    window.scrollTo(0, 0);
  }
  function editInputs() {
    document.body.classList.remove('results');
    $('backBtn').hidden = true; $('outTitle').textContent = 'Scripts';
    scrollTo($('panelTop')); $('runBtn').focus({ preventScroll: true });
  }
  $('backBtn').addEventListener('click', editInputs);

  // Progress steps shown above the cards during a two-step write.
  var STEPS = ['Writing hooks', 'Picking the best 3', 'Writing scripts', 'Checking'];
  function steps(at, note) {
    var ol = $('steps'); ol.hidden = at == null; ol.textContent = '';
    if (at == null) return;
    STEPS.forEach(function (s, i) {
      var li = el('li', i < at ? 'done' : i === at ? 'now' : '', s + (i === at ? '…' + (note ? ' ' + note : '') : ''));
      if (i === at) li.setAttribute('aria-current', 'step');
      ol.appendChild(li);
    });
    setStatus('runStatus', STEPS[at] + '…' + (note ? ' ' + note : ''));
  }

  // Parse "1. hook text [PATTERN] STOP=7 LOOP=5 SPECIFIC=8" lines (scores optional).
  var COUNT = /\d|\b(two|three|four|five|six|seven|eight|nine|ten)\b/i;
  function parseHooks(text, needCount) {
    var out = [];
    text.split('\n').forEach(function (line) {
      var l = line.trim().replace(/\*\*/g, ''), sc = l.match(/STOP\s*=\s*(\d+)\D+LOOP\s*=\s*(\d+)\D+SPECIFIC\s*=\s*(\d+)/i);
      if (sc) l = l.slice(0, sc.index).replace(/[\s|,;-]+$/, '');
      var m = l.match(/^\d+[.)]\s*(.+?)\s*(?:\[([^\]]+)\])?\s*$/);
      if (m) out.push({ hook: m[1].replace(/^["“]|["”]$/g, ''), family: m[2] || '', score: (sc ? +sc[1] + +sc[2] + +sc[3] : 0) - (words(m[1]) > 12 ? 15 : 0) - (needCount && !COUNT.test(m[1]) ? 20 : 0) });
    });
    return out;
  }
  function pickTop(hooks, n) {
    return hooks.map(function (h, i) { return { h: h, i: i }; })
      .sort(function (a, b) { return b.h.score - a.h.score || a.i - b.i; })
      .slice(0, n || 3).map(function (x) { return x.h; });
  }

  // Three calls in total, to stay light on free keys that often return 503:
  // 1) 10 hooks + self-scores, 2) 3 scripts, 3) grade all 3 and rewrite any under 80.
  function runWrite() {
    var ctx = context(), sys = systemFor(PLAYBOOK_TEMPLATE);
    // The format's own opening beat decides the hook's shape (e.g. listicle = a count and a promise).
    var fmt = $('format').value, shape = ((FORMATS[fmt] || FORMATS.value).beats.match(/^[^(]*\(([^)]*)\)/) || [])[1] || '';
    var secs = LENGTH_SECONDS[$('length').value] || [30, 60], minW = Math.round(secs[0] * WPS), maxW = Math.round(secs[1] * WPS);
    var LEN = 'LENGTH RULE: ' + minW + ' to ' + maxW + ' spoken words in total (the target length at ' + WPS + ' words a second). Count before you finish; cut filler to fit.';
    var ONE = 'The VERBAL hook stays ONE sentence of 10 words or fewer.';
    busy(true, 'Writing…'); setStatus('runStatus', ''); showResults('write');
    $('empty').hidden = true; $('cards').textContent = ''; $('outActs').hidden = true;
    var stream = $('stream'); stream.hidden = true; stream.textContent = '';
    var sk = el('div', 'skeleton'); sk.setAttribute('aria-label', 'Writing your scripts');
    ['w60', 'w90', 'w75', 'w90', 'w40 last'].forEach(function (w) { sk.appendChild(el('span', 'gl ' + w)); });
    $('cards').appendChild(sk);
    function showOut() { var r0 = $('outTitle').getBoundingClientRect(); if (r0.top < 0 || r0.top > innerHeight - 160) window.scrollTo(0, Math.max(0, r0.top + window.pageYOffset - 16)); }
    showOut();
    var t0 = Date.now(), at = 0, hooks = null, parts = null;
    var tick = setInterval(function () { if (!/^(Google is busy|That model)/.test($('runStatus').textContent)) steps(at, Math.round((Date.now() - t0) / 1000) + 's'); }, 1000);
    steps(0);
    var hookPrompt = 'Write 10 original hook options for this video (the first spoken line only). Build each from a DIFFERENT pattern in the HOOK SWIPE FILE, filled with this topic\'s specifics; never copy a template\'s words. REQUIRED HOOK SHAPE for this format: ' + (shape || 'an observation') + (fmt === 'list' ? '. Every hook names a specific count (a digit) and the payoff, e.g. "4 [things] that [payoff]".' : '.') + ' HARD LIMIT: 10 spoken words or fewer, one sentence, no semicolons, no lists of three. Short beats clever.\n' +
      'Then score each one honestly from 0 to 10 on STOP (stops the scroll in under 4 seconds: a concrete image, number or named feeling), LOOP (opens a question the viewer needs closed) and SPECIFIC (could only open a video about this topic). Vague, polite or long hooks score low; any hook over 10 words gets STOP=2 at most.\n' +
      'Reply with exactly 10 lines and nothing else, in this form:\n1. <hook> [PATTERN NAME] STOP=7 LOOP=5 SPECIFIC=8\n\n' + ctx;
    call(sys, hookPrompt, 1.0).then(function (t) {
      hooks = parseHooks(t, fmt === 'list');
      if (hooks.length < 3) throw new Error('The hooks came back in a shape I could not read. Try again.');
      at = 1; steps(1);
      var top = pickTop(hooks);
      at = 2; steps(2);
      // One call per script, in parallel: each starts streaming sooner (inside the 90s guard),
      // and if one fails the others still show.
      var live = ['', '', ''];
      return Promise.all(top.map(function (h, i) {
        var prompt = 'Write ONE original script. It opens with this hook as the VERBAL line (you may tighten the wording, never soften or lengthen it): "' + h.hook + '"' + (h.family ? '\nThe FAMILY line is: ' + h.family : '') + '\n' + ONE + '\n' + LEN + '\n\n' + ctx;
        return call(sys, prompt, 0.9, function (t) { live[i] = t; if (sk.parentNode) sk.remove(); stream.hidden = false; stream.textContent = live.filter(Boolean).join('\n\n— — —\n\n'); })
          .then(function (t) { return t.trim(); }, function (e) { return { err: e }; });
      }));
    }).then(function (outs) {
      parts = outs.filter(function (o) { return typeof o === 'string' && o; });
      if (!parts.length) throw outs[0].err;
      var lost = outs.length - parts.length;
      at = 3; steps(3);
      var prompt = 'Grade each of the ' + parts.length + ' scripts below with your scoring rules (SCORE_TOTAL weighting as defined). A script outside ' + minW + '-' + maxW + ' spoken words, or whose VERBAL hook is more than one sentence or over 10 words, scores 75 at most.\n' +
        'For each script, in order, output:\n=== VARIATION n ===\nSCORE_TOTAL: <0-100>\nthen, if the score is 80 or more, the script exactly as given; if under 80, a rewrite that fixes its weaknesses, keeps the hook at least as strong, and would score 80 or more. In any rewrite: ' + ONE + (shape ? ' Keep the hook shape: ' + shape + '.' : '') + ' ' + LEN + ' Use the same OUTPUT FORMAT, including FAMILY and TITLE lines. Nothing else.\n\n' +
        parts.map(function (p, i) { return '=== VARIATION ' + (i + 1) + ' ===\n' + p; }).join('\n\n');
      // AUDIT_TEMPLATE judges; the playbook's output format shapes any rewrite.
      var checkSys = systemFor(AUDIT_TEMPLATE) + '\n\n# BATCH MODE\nThe user message holds several scripts. Ignore the single-script OUTPUT FORMAT above and follow the user message. Any rewrite follows the voice, bans and claim-safety rules and this script format:\n' + PLAYBOOK_TEMPLATE.slice(PLAYBOOK_TEMPLATE.indexOf('# 10. OUTPUT FORMAT'));
      return call(checkSys, prompt, 0.5).then(function (g) {
        var checked = g.split(/^\s*=+\s*VARIATION\s*\d*\s*=+\s*$/im).map(function (x) { return x.trim(); }).filter(Boolean);
        return parts.map(function (p, i) {
          var c = checked[i] || '', m = c.replace(/\*\*/g, '').match(/^SCORE_TOTAL:\s*(\d+)\s*$/m);
          var body = c.replace(/^.*SCORE_TOTAL:.*$\n?/m, '').trim();
          if (!m) return { text: p, score: null };
          var score = +m[1], ok = /FAMILY:|TITLE:|\d:\d\d/.test(body);
          if (score >= 80 || !ok) return { text: p, score: score };
          // Keep the original when the rewrite drifts further past the length target.
          var nb = words(spoken(body)), np = words(spoken(p));
          if (nb > maxW * 1.1 && nb > np) return { text: p, score: score };
          return { text: keepHook(body, p, fmt === 'list'), score: score, rewritten: true };
        });
      }, function (e) {
        // Keep the finished scripts if only the check failed.
        setStatus('runStatus', 'Scripts are ready, but the quality check failed (' + e.message + ')', 'bad');
        return parts.map(function (p) { return { text: p, score: null, unchecked: true }; });
      }).then(function (res) { res.lost = lost; return res; });
    }).then(function (res) {
      stream.hidden = true; if (sk.parentNode) sk.remove(); steps(null);
      var text = res.map(function (r) { return r.text; }).join('\n\n=== VARIATION ===\n\n');
      render('write', text);
      res.forEach(function (r, i) {
        var d = $('cards').children[i] && $('cards').children[i].querySelector('.dur');
        if (d && r.score != null) d.textContent += ' · ' + (r.rewritten ? 'rewritten (was ' + r.score + '/100)' : 'checked ' + r.score + '/100');
      });
      setTimeout(showOut, 0);
      saveHistory('write', val('topic'), text);
      if (res.lost) setStatus('runStatus', res.length + ' of 3 scripts finished. Google dropped the other one; press Write to try again.', 'bad');
      else if (!res[0].unchecked) setStatus('runStatus', 'Done in ' + Math.round((Date.now() - t0) / 1000) + 's.', 'ok');
    }).catch(function (e) {
      stream.hidden = true; if (sk.parentNode) sk.remove(); steps(null);
      var msg = e.message === 'Failed to fetch' ? 'Could not reach Gemini. Check your connection.' : e.message;
      if (hooks && hooks.length) {
        // The scripts step failed: show the hooks we already have.
        $('outTitle').textContent = 'Your 10 hooks';
        render('hooks', pickTop(hooks, 10).map(function (h, i) { return (i + 1) + '. ' + h.hook + (h.family ? ' [' + h.family + ']' : ''); }).join('\n'));
        saveHistory('hooks', val('topic'), state.raw);
        msg = 'Hooks are ready, but the scripts step failed: ' + msg + ' Or press Use on a hook to try the scripts again.';
      } else $('empty').hidden = false;
      setStatus('runStatus', msg, 'bad');
      if (e.status === 400 || e.status === 401 || e.status === 403) {
        state.key = ''; store('key', null); renderKey();
        setStatus('keyStatus', e.message, 'bad'); $('apiKey').setAttribute('aria-invalid', 'true');
      }
    }).then(function () { clearInterval(tick); busy(false); });
  }

  // A rewrite may not lengthen the chosen hook: if its VERBAL line breaks the one-sentence,
  // 10-word rule, put the original VERBAL line back.
  function keepHook(rewrite, original, needCount) {
    var re = /^(\s*VERBAL:\s*)(.*)$/m, r = rewrite.match(re), o = original.match(re);
    if (!r || !o) return rewrite;
    var bad = words(r[2]) > 10 || (r[2].match(/[.!?](\s|$)/g) || []).length > 1 || (needCount && !COUNT.test(r[2]));
    return bad ? rewrite.replace(re, '$1' + o[2].replace(/\$/g, '$$$$')) : rewrite;
  }

  function splitVariations(text) {
    var parts = text.split(/^\s*=+\s*VARIATION\s*\d*\s*=+\s*$/im).map(function (s) { return s.trim(); }).filter(function (s) { return /FAMILY:|TITLE:|\d:\d\d/.test(s); });
    return parts.length ? parts : [text.trim()];
  }

  function busy(on, label) {
    state.busy = on;
    var b = $('runBtn');
    b.disabled = on;
    if (on) { b.textContent = ''; b.appendChild(el('span', 'spin')); b.appendChild(document.createTextNode(' ' + label)); }
    else b.textContent = RUN_LABEL[state.mode];
  }

  function run(system, prompt, temp, kind) {
    busy(true, 'Writing…'); setStatus('runStatus', ''); showResults(kind);
    $('empty').hidden = true; $('cards').textContent = ''; $('outActs').hidden = true;
    var stream = $('stream'); stream.hidden = true; stream.textContent = '';
    var sk = el('div', 'skeleton'); sk.setAttribute('aria-label', 'Writing your scripts');
    ['w60', 'w90', 'w75', 'w90', 'w40 last'].forEach(function (w) { sk.appendChild(el('span', 'gl ' + w)); });
    $('cards').appendChild(sk);
    function showOut() { var r0 = $('outTitle').getBoundingClientRect(); if (r0.top < 0 || r0.top > innerHeight - 160) window.scrollTo(0, Math.max(0, r0.top + window.pageYOffset - 16)); var o = document.querySelector('.output'); if (o) o.scrollTop = 0; }
    showOut();
    var t0 = Date.now(), gotText = false;
    var tick = setInterval(function () { var sec = Math.round((Date.now() - t0) / 1000); setStatus('runStatus', gotText ? 'Writing… ' + sec + 's' : 'Waiting for Gemini… ' + sec + 's. First words usually arrive in 10–30 seconds.'); }, 1000);
    setStatus('runStatus', 'Waiting for Gemini… First words usually arrive in 10–30 seconds.');
    call(system, prompt, temp, function (t) { gotText = true; if (sk.parentNode) sk.remove(); stream.hidden = false; stream.textContent = t; stream.scrollTop = stream.scrollHeight; })
      .then(function (text) {
        stream.hidden = true; if (sk.parentNode) sk.remove(); setTimeout(showOut, 0);
        render(kind, text);
        saveHistory(kind, kind === 'grade' ? val('pasted').slice(0, 80) : val('topic'), text);
      })
      .catch(function (e) {
        stream.hidden = true; if (sk.parentNode) sk.remove(); $('empty').hidden = false;
        setStatus('runStatus', e.message === 'Failed to fetch' ? 'Could not reach Gemini. Check your connection.' : e.message, 'bad');
        if (e.status === 400 || e.status === 401 || e.status === 403) {
          state.key = ''; store('key', null); renderKey();
          setStatus('keyStatus', e.message, 'bad'); $('apiKey').setAttribute('aria-invalid', 'true'); $('apiKey').focus();
        }
      })
      .then(function () { clearInterval(tick); if (/^(Waiting|Writing|Google is busy|That model)/.test($('runStatus').textContent)) setStatus('runStatus', ''); busy(false); });
  }

  // ---------- renderers ----------
  function render(kind, text) {
    state.raw = text; state.kind = kind;
    $('outActs').hidden = false;
    if (kind === 'grade') return renderGrade(text);
    if (kind === 'hooks') return renderHooks(text);
    var parts = text.split(/^\s*=+\s*VARIATION\s*\d*\s*=+\s*$/im).map(function (s) { return s.trim(); }).filter(function (s) { return /FAMILY:|TITLE:|\d:\d\d/.test(s); });
    if (!parts.length) parts = [text.trim()];
    state.cards = parts.map(function (t) { return { text: t }; });
    state.cards.forEach(function (c, i) { $('cards').appendChild(card(c, i)); });
  }

  function parseScript(t) {
    var lines = t.replace(/\*\*/g, '').split('\n'), out = { family: '', title: '', beats: [], why: [] }, cur = null, inWhy = false;
    lines.forEach(function (raw) {
      var line = raw.trim(); if (!line) return;
      var m;
      if ((m = line.match(/^FAMILY:\s*(.+)/i))) { out.family = m[1]; return; }
      if ((m = line.match(/^TITLE:\s*(.+)/i))) { out.title = m[1]; return; }
      if (/^WHY THIS WORKS/i.test(line)) { inWhy = true; return; }
      if (inWhy) { out.why.push(line.replace(/^[-•*]\s*/, '')); return; }
      if ((m = line.match(/^\(?(\d+:\d\d\s*[-–]\s*\d+:\d\d)\)?\s*[:\-–]?\s*(.*)$/)) || (m = line.match(/^([A-Z][A-Z0-9 /&'’()-]{2,}):?$/))) {
        cur = { time: m[2] !== undefined ? m[1] : '', label: (m[2] !== undefined ? m[2] : m[1]).replace(/:$/, ''), lines: [], hook: {} };
        out.beats.push(cur); return;
      }
      if (!cur) { cur = { time: '', label: '', lines: [], hook: {} }; out.beats.push(cur); }
      if ((m = line.match(/^(VERBAL|WRITTEN|VISUAL):\s*(.*)/i))) { cur.hook[m[1].toUpperCase()] = m[2]; return; }
      cur.lines.push(line);
    });
    return out;
  }
  function spoken(t) {
    var p = parseScript(t), s = '';
    p.beats.forEach(function (b) { if (b.hook.VERBAL) s += ' ' + b.hook.VERBAL; s += ' ' + b.lines.join(' '); });
    return s;
  }

  function card(c, i) {
    var node = $('cardTpl').content.firstElementChild.cloneNode(true), p = parseScript(c.text);
    node.style.setProperty('--i', i);
    node.querySelector('.badge').textContent = p.family || 'Variation ' + (i + 1);
    var w = words(spoken(c.text));
    node.querySelector('.dur').textContent = w + ' words · ~' + Math.round(w / WPS) + 's';
    node.querySelector('.ctitle').textContent = p.title || 'Variation ' + (i + 1);
    var body = node.querySelector('.cbody');
    p.beats.forEach(function (b, bi) {
      var isHook = /HOOK|TEXT CARD|LINE 1|COLD OPEN/i.test(b.label) && (b.hook.VERBAL || bi === 0);
      var isFinal = /LAST LINE|PUNCHLINE|LINE 3/i.test(b.label);
      var box = el('section', 'beat' + (isHook ? ' hook' : '') + (isFinal ? ' final' : ''));
      if (b.label || b.time) box.appendChild(el('h4', null, [b.time, b.label].filter(Boolean).join('  ·  ')));
      ['VERBAL', 'WRITTEN', 'VISUAL'].forEach(function (k) {
        if (!b.hook[k]) return;
        var r = el('div', 'hookrow'); r.appendChild(el('b', null, k)); r.appendChild(el('span', null, b.hook[k])); box.appendChild(r);
      });
      b.lines.forEach(function (l) { box.appendChild(el('p', null, l)); });
      body.appendChild(box);
    });
    if (p.why.length) {
      var why = el('div', 'why'); why.appendChild(el('strong', null, 'Why this works'));
      var ul = el('ul'); p.why.forEach(function (x) { ul.appendChild(el('li', null, x)); }); why.appendChild(ul); body.appendChild(why);
    }
    node.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () { b.dataset.act === 'copy' ? copy(c.text, b) : refine(i, b.dataset.act, b); });
    });
    if (typeof window.LL_CARD === 'function') window.LL_CARD(node, c);
    return node;
  }

  function refine(i, kind, btn) {
    if (state.busy) return;
    var c = state.cards[i], old = $('cards').children[i];
    state.busy = true; var label = btn.textContent; btn.textContent = ''; btn.appendChild(el('span', 'spin'));
    old.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    var prompt = REFINE[kind] + '\n\nReturn ONLY the revised script in the same OUTPUT FORMAT, including FAMILY and TITLE lines. No notes.\n\nSCRIPT:\n"""\n' + c.text + '\n"""';
    call(systemFor(PLAYBOOK_TEMPLATE), prompt, 0.85).then(function (t) {
      c.text = t.trim(); var n = card(c, 0); n.style.animationDelay = '0ms'; $('cards').replaceChild(n, old);
      state.raw = state.cards.map(function (x) { return x.text; }).join('\n\n=== VARIATION ===\n\n');
    }).catch(function (e) {
      setStatus('runStatus', e.message, 'bad'); btn.textContent = label;
      old.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
    }).then(function () { state.busy = false; });
  }

  function renderHooks(text) {
    var ol = el('ol', 'hooklist');
    text.split('\n').forEach(function (line) {
      var m = line.trim().replace(/\*\*/g, '').match(/^\d+[.)]\s*(.+?)\s*(?:\[([^\]]+)\])?\s*$/);
      if (!m) return;
      var li = el('li'), txt = el('div'); txt.appendChild(el('span', null, m[1].replace(/^["“]|["”]$/g, '')));
      if (m[2]) txt.appendChild(el('span', 'fam', m[2]));
      var b = el('button', 'btn ghost sm', 'Use'); b.type = 'button';
      b.addEventListener('click', function () {
        setMode('write'); editInputs();
        $('facts').value = (val('facts') ? val('facts') + '\n' : '') + 'OPEN WITH THIS EXACT HOOK as the VERBAL line in all three scripts: "' + m[1] + '"';
        $('modePanel').querySelector('details').open = true;
        $('runBtn').focus();
        setStatus('runStatus', 'Hook added. Press Write 3 scripts.', 'ok');
      });
      li.appendChild(txt); li.appendChild(b); ol.appendChild(li);
    });
    if (!ol.children.length) { var pre = el('pre', 'stream', text); $('cards').appendChild(pre); return; }
    var wrap = el('article', 'card'); wrap.appendChild(ol); $('cards').appendChild(wrap);
  }

  function renderGrade(text) {
    var g = {}, notes = [], rewrite = '', sec = '';
    text.replace(/\*\*/g, '').split('\n').forEach(function (line) {
      var l = line.trim(), m;
      if (/^---\s*NOTES/i.test(l)) { sec = 'notes'; return; }
      if (/^---\s*REWRITE/i.test(l)) { sec = 'rewrite'; return; }
      if (sec === 'rewrite') { rewrite += line + '\n'; return; }
      if (sec === 'notes') { if (l) notes.push(l.replace(/^[-•*]\s*/, '')); return; }
      if ((m = l.match(/^SCORE_(\w+):\s*(\d+)/))) g[m[1].toLowerCase()] = +m[2];
      else if ((m = l.match(/^VERDICT:\s*(.+)/))) g.verdict = m[1];
      else if ((m = l.match(/^DROPOFF:\s*(.+)/))) (g.drop = g.drop || []).push(m[1]);
    });
    var c = el('article', 'card'), sc = el('div', 'scores');
    var tot = el('div', 'total'), big = el('strong', null, '0'); tot.appendChild(big); tot.appendChild(el('span', null, '/ 100'));
    sc.appendChild(tot);
    if (g.verdict) sc.appendChild(el('p', 'verdict', g.verdict));
    [['hook', 'Hook'], ['retention', 'Retention'], ['specificity', 'Specificity'], ['clarity', 'Clarity'], ['cta', 'CTA']].forEach(function (k) {
      if (g[k[0]] == null) return;
      var row = el('div', 'meter'); row.appendChild(el('span', null, k[1]));
      var bar = el('span', 'bar'), fill = el('i'); bar.appendChild(fill); row.appendChild(bar);
      row.appendChild(el('output', null, String(g[k[0]])));
      sc.appendChild(row);
      requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = Math.min(100, g[k[0]] * 10) + '%'; }); });
    });
    (g.drop || []).forEach(function (d) { sc.appendChild(el('p', 'hint', 'Drop-off ' + d)); });
    c.appendChild(sc);
    if (notes.length) { var ul = el('ul', 'notes'); notes.forEach(function (n) { ul.appendChild(el('li', null, n)); }); c.appendChild(el('h3', 'ctitle', 'What to fix')); c.appendChild(ul); }
    $('cards').appendChild(c);
    countUp(big, g.total || 0);
    if (rewrite.trim()) { state.cards = [{ text: rewrite.trim() }]; var rc = card(state.cards[0], 1); rc.querySelector('.badge').textContent = 'Rewrite'; $('cards').appendChild(rc); }
  }
  function countUp(node, to) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = to; return; }
    var start = performance.now(), dur = 300;
    (function tick(now) { var p = Math.min(1, (now - start) / dur); node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); })(start);
  }

  // ---------- copy ----------
  function copy(text, btn) {
    var done = function () { var l = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = l; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
    else { fallback(text); done(); }
  }
  function fallback(text) { var t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); }
  $('copyAll').addEventListener('click', function () { copy(state.raw || '', this); });

  // ---------- history ----------
  function hist() { return storeJSON('history') || []; }
  function saveHistory(kind, title, text) {
    var h = hist(); h.unshift({ kind: kind, title: title || 'Untitled', text: text, at: Date.now(), voice: state.voice });
    storeJSON('history', h.slice(0, 20)); renderHistory();
  }
  function renderHistory() {
    var h = hist(), ol = $('histList'); ol.textContent = '';
    $('histEmpty').hidden = !!h.length; $('histClear').hidden = !h.length;
    h.forEach(function (it) {
      var li = el('li'), b = el('button'); b.type = 'button';
      b.appendChild(el('span', 'ht', it.title));
      b.appendChild(el('span', 'hm', ({ write: '3 scripts', hooks: '10 hooks', grade: 'Grade' })[it.kind] + ' · ' + new Date(it.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })));
      b.addEventListener('click', function () { $('empty').hidden = true; $('cards').textContent = ''; setMode(it.kind); showResults(it.kind); render(it.kind, it.text); scrollTo($('outTitle')); });
      li.appendChild(b); ol.appendChild(li);
    });
  }
  $('histClear').addEventListener('click', function () { if (confirm('Clear saved runs from this browser?')) { store('history', null); renderHistory(); } });

  // ---------- format cards ----------
  function syncCards() {
    document.querySelectorAll('.chip[data-format]').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.format === $('format').value)); });
  }
  document.querySelectorAll('.chip[data-format]').forEach(function (c) {
    c.addEventListener('click', function () {
      if (!FORMATS[c.dataset.format]) return;
      $('format').value = c.dataset.format; saveForm(); syncCards(); setMode('write');
      if (/^yt/.test(c.dataset.format)) { $('platform').value = 'YouTube'; $('length').value = '5–10 minutes'; }
      $('topic').focus();
    });
  });
  $('format').addEventListener('change', syncCards);
  var moreChip = document.querySelector('.chip[data-action="more"]');
  if (moreChip) moreChip.addEventListener('click', function () { setMode('write'); scrollTo($('format'), 'center'); $('format').focus({ preventScroll: true }); });

  // ---------- hero quick start ----------
  $('quick').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = val('quickTopic');
    if (!t) { $('quickHint').textContent = 'Type what your video is about first.'; $('quickTopic').setAttribute('aria-invalid', 'true'); $('quickTopic').focus(); return; }
    $('quickTopic').setAttribute('aria-invalid', 'false');
    setMode('write'); $('topic').value = t; setErr('topicErr', '', 'topic');
    if (!ready()) { scrollTo($('keyBox'), 'center'); $('apiKey').focus({ preventScroll: true }); setStatus('keyStatus', 'Add your key, then press Write 3 scripts.'); return; }
    scrollTo($('panelTop'));
    $('modePanel').requestSubmit ? $('modePanel').requestSubmit() : $('runBtn').click();
  });

  // ---------- check fields when people leave them ----------
  $('topic').addEventListener('blur', function () { if (state.mode !== 'grade' && $('topic').value && !val('topic')) setErr('topicErr', 'Say what the video is about.', 'topic'); else if (val('topic')) setErr('topicErr', '', 'topic'); });
  $('pasted').addEventListener('blur', function () { if (val('pasted')) setErr('pastedErr', '', 'pasted'); });
  $('vpUrl').addEventListener('blur', function () { if (!val('vpUrl')) return setErr('vpErr', '', 'vpUrl'); try { toRaw(val('vpUrl')); setErr('vpErr', '', 'vpUrl'); } catch (err) { setErr('vpErr', err.message, 'vpUrl'); } });
  $('apiKey').addEventListener('input', function () { $('apiKey').setAttribute('aria-invalid', 'false'); });

  // ---------- first-visit intro video ----------
  var dlg = $('introDlg'), vid = $('introVideo'), opener = null;
  function openIntro() {
    if (!dlg.showModal) return;
    opener = document.activeElement;
    // Nothing loads until someone asks for the video.
    if (!vid.getAttribute('src')) { vid.poster = vid.dataset.poster; vid.src = vid.dataset.src; }
    dlg.showModal();
    if (!REDUCED) try { vid.currentTime = 0; var p = vid.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }
  function closeIntro() { vid.pause(); if (dlg.open) dlg.close(); }
  dlg.addEventListener('close', function () { vid.pause(); store('introSeen', '1'); if (opener && opener.focus && opener !== document.body) opener.focus(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeIntro(); }); // click outside
  $('introClose').addEventListener('click', closeIntro);
  $('introSkip').addEventListener('click', closeIntro);
  vid.addEventListener('ended', function () { $('introSkip').focus(); });
  function syncSound() { $('introSound').querySelector('span').textContent = vid.muted ? 'Turn sound on' : 'Mute'; $('introSound').setAttribute('aria-pressed', String(!vid.muted)); }
  $('introSound').addEventListener('click', function () { vid.muted = !vid.muted; if (!vid.muted && vid.paused) { var p = vid.play(); if (p && p.catch) p.catch(function () {}); } syncSound(); });
  vid.addEventListener('volumechange', syncSound);
  $('introOpen').addEventListener('click', openIntro);
  $('introHero').addEventListener('click', openIntro);

  // ---------- boot ----------
  setMode('write'); renderKey(); renderVoice(); renderHistory(); syncCards();
})();
