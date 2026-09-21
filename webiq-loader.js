/*!
 * WebIQ Agent — progressive loader
 * -----------------------------------------
 * Host this file on any static endpoint (CDN, blob storage, GitHub Pages, etc.).
 * Clients embed the agent with a single async <script> tag:
 *
 *   <script async src="https://your-host.example.com/webiq-loader.js"></script>
 *
 * Optional per-page overrides via data-* attributes on the same tag, e.g.:
 *
 *   <script async src=".../webiq-loader.js"
 *           data-wiq-title="Acme Health Assistant"
 *           data-wiq-proxy-url="https://acme.com/api/webiq"></script>
 *
 * Or programmatically before the script tag:
 *
 *   <script>window.WebIQConfig = { title: "..." };</script>
 *
 * Defaults (including API keys for the POC) are baked in below.
 */
(function () {
  if (window.__webiqLoaded) return;
  window.__webiqLoaded = true;

  var currentScript = document.currentScript ||
    (function () {
      var s = document.getElementsByTagName("script");
      return s[s.length - 1];
    })();

  // Base URL for sibling assets like the domain-list .txt files.
  var loaderBaseUrl = "";
  if (currentScript && currentScript.src) {
    loaderBaseUrl = currentScript.src.replace(/[^/]+(?:\?.*)?$/, "");
  }

  var attrCfg = {};
  if (currentScript && currentScript.getAttribute) {
    var map = {
      "data-wiq-webiq-key":         "webiqApiKey",
      "data-wiq-azure-key":         "azureApiKey",
      "data-wiq-azure-endpoint":    "azureEndpoint",
      "data-wiq-azure-api-version": "azureApiVersion",
      "data-wiq-azure-model":       "azureModel",
      "data-wiq-proxy-url":         "proxyUrl",
      "data-wiq-title":             "title",
      "data-wiq-subtitle":          "subtitle",
      "data-wiq-greeting":          "greeting",
      "data-wiq-disclaimer":        "disclaimer",
      "data-wiq-include-domains":   "includeDomains",
      "data-wiq-exclude-domains":   "excludeDomains"
    };
    for (var attr in map) {
      var v = currentScript.getAttribute(attr);
      if (v !== null) attrCfg[map[attr]] = v;
    }
  }

  var DEFAULTS = {
    webiqApiKey: "REPLACE_WITH_WEBIQ_API_KEY",
    webiqEndpoint:
      "https://api.microsoft.ai/v3/auto" +
      "?debugoptions=VerboseLogs%7CWriteAllLogs" +
      "&visibilities=ppe" +
      "&ISQUERYEO14117COMPLIANT=TRUE" +
      "&features=speedbird,gndsupersonicapi,snccalendaron,orcarcslmmodelon," +
      "orcarctfmodelon,rcorca,1s-rcentitymap" +
      "&setapplicationendpoint=ceto-snr-neu.binguxlivesite.net",
    maxResults: 10,
    contentFormat: "text",
    maxContentLength: 1500,
    language: "en",
    region: "US",
    includeDomains: [],
    excludeDomains: [],

    azureApiKey: "REPLACE_WITH_AZURE_AI_FOUNDRY_API_KEY",
    azureEndpoint: "https://YOUR-AZURE-AI-RESOURCE.services.ai.azure.com/models/chat/completions",
    azureApiVersion: "2024-05-01-preview",
    azureModel: "mistral-medium-3-5",
    maxTokens: 800,

    proxyUrl: "",

    title: "WebIQ Agent",
    subtitle: "Ask me anything",
    greeting: "Hi! Ask me a question and I'll answer using live web search results with cited sources.",
    disclaimer: "The response is LLM generated based on WebIQ results for demo purposes only. Consult a medical professional for advice."
  };

  var CFG = assign({}, DEFAULTS, window.WebIQConfig || {}, attrCfg);
  CFG.includeDomains = normalizeDomains(CFG.includeDomains);
  CFG.excludeDomains = normalizeDomains(CFG.excludeDomains);

  function normalizeDomains(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(function (d) { return String(d).trim(); }).filter(Boolean);
    return splitDomainsSmart(String(v));
  }

  // Comma-split that keeps bracketed tags (e.g. "[Client Domain, Credible Domains]") intact.
  function splitDomainsSmart(str) {
    var out = [], buf = "", depth = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (c === "[") depth++;
      else if (c === "]") depth = Math.max(0, depth - 1);
      if (c === "," && depth === 0) {
        var t = buf.trim(); if (t) out.push(t);
        buf = "";
      } else {
        buf += c;
      }
    }
    var last = buf.trim(); if (last) out.push(last);
    return out;
  }

  // Named domain-list tags that map to sibling .txt files or runtime values.
  var DOMAIN_TAG_MAP = {
    "[credible domains]":
      function () { return fetchDomainList(loaderBaseUrl + "CredibleHealthHostsV2.txt"); },
    "[credible domains preferred by clinicians]":
      function () { return fetchDomainList(loaderBaseUrl + "cliniciansDomains.txt"); },
    "[clinician domains]":
      function () { return fetchDomainList(loaderBaseUrl + "cliniciansDomains.txt"); },
    "[client domain]":
      function () { return Promise.resolve([location.hostname]); },
    "[client domain, credible domains]":
      function () {
        return fetchDomainList(loaderBaseUrl + "CredibleHealthHostsV2.txt")
          .then(function (list) { return [location.hostname].concat(list); });
      }
  };

  var domainListCache = {};
  function fetchDomainList(url) {
    if (domainListCache[url]) return domainListCache[url];
    domainListCache[url] = fetch(url, { credentials: "omit" })
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) {
        return t.split(/\r?\n/)
          .map(function (s) { return s.split("\t", 1)[0].trim(); })
          .filter(function (s) { return s && s.charAt(0) !== "#"; });
      })
      .catch(function () { return []; });
    return domainListCache[url];
  }

  function resolveDomainList(items) {
    if (!items || !items.length) return Promise.resolve([]);
    var tasks = items.map(function (item) {
      var key = String(item).toLowerCase();
      var fn = DOMAIN_TAG_MAP[key];
      if (fn) return fn();
      return Promise.resolve([item]);
    });
    return Promise.all(tasks).then(function (arrays) {
      var seen = {}, out = [];
      arrays.forEach(function (arr) {
        arr.forEach(function (d) {
          if (!d) return;
          var k = String(d).toLowerCase();
          if (seen[k]) return;
          seen[k] = true; out.push(d);
        });
      });
      return out;
    });
  }

  var resolvedDomainsPromise = null;
  function ensureResolvedDomains() {
    if (resolvedDomainsPromise) return resolvedDomainsPromise;
    resolvedDomainsPromise = Promise.all([
      resolveDomainList(CFG.includeDomains),
      resolveDomainList(CFG.excludeDomains)
    ]).then(function (arr) {
      CFG._includeDomainsResolved = arr[0];
      CFG._excludeDomainsResolved = arr[1];
    });
    return resolvedDomainsPromise;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ---------------------------------------------------------------
  function init() {
    if (document.getElementById("webiq-widget-root")) return;
    injectStyles();
    var root = document.createElement("div");
    root.id = "webiq-widget-root";
    document.body.appendChild(root);
    render(root);
    wire(root);
  }

  function injectStyles() {
    if (document.getElementById("webiq-widget-styles")) return;
    var css = [
      '#webiq-widget-root, #webiq-widget-root * { box-sizing: border-box; }',
      '#webiq-widget-root { position: fixed; bottom: 20px; right: 20px; z-index: 2147483000;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
      '  color: #e6ecf7; }',

      /* launcher bubble */
      '.wiq-bubble { width:60px; height:60px; border-radius:50%;',
      '  background: linear-gradient(135deg,#8b7dff 0%,#5a4fe0 100%); color:#fff;',
      '  display:flex; align-items:center; justify-content:center;',
      '  box-shadow: 0 12px 28px rgba(90,79,224,0.45); cursor:pointer; border:none;',
      '  transition: transform 0.15s ease; }',
      '.wiq-bubble:hover { transform: scale(1.05); }',
      '.wiq-bubble svg { width:28px; height:28px; }',

      /* panel — 1/3rd of viewport, Copilot-dark */
      '.wiq-panel { position:absolute; bottom:76px; right:0;',
      '  width: 33vw; min-width: 380px; max-width: 640px;',
      '  height: 85vh; max-height: 900px;',
      '  background:#0e1330; border-radius:20px;',
      '  box-shadow: 0 24px 60px rgba(0,0,0,0.35);',
      '  display:none; flex-direction:column; overflow:hidden;',
      '  border:1px solid #1e2447; color:#e6ecf7; }',
      '.wiq-panel.wiq-open { display:flex; }',
      '@media (max-width:900px){ .wiq-panel { width: calc(100vw - 40px); height: calc(100vh - 120px); } }',

      /* header */
      '.wiq-header { padding:14px 16px 12px; display:flex; align-items:center; gap:12px;',
      '  border-bottom:1px solid #1e2447; background:#0e1330; }',
      '.wiq-header-mark { width:32px; height:32px; border-radius:50%;',
      '  background: linear-gradient(135deg,#8b7dff 0%,#5a4fe0 100%);',
      '  display:grid; place-items:center; color:#fff; flex:0 0 32px; }',
      '.wiq-header-title { font-weight:600; font-size:15px; line-height:1.2; color:#e6ecf7; }',
      '.wiq-header-sub { font-size:12px; color:#8b93aa; margin-top:1px; }',
      '.wiq-header-close { margin-left:auto; background:transparent; border:none;',
      '  color:#8b93aa; cursor:pointer; font-size:22px; padding:2px 6px; line-height:1;',
      '  border-radius:6px; }',
      '.wiq-header-close:hover { background:#1a2044; color:#e6ecf7; }',

      /* messages area */
      '.wiq-messages { flex:1; overflow-y:auto; padding:22px 20px 16px; background:#0e1330;',
      '  display:flex; flex-direction:column; gap:22px; }',
      '.wiq-messages::-webkit-scrollbar { width:8px; }',
      '.wiq-messages::-webkit-scrollbar-thumb { background:#1e2447; border-radius:4px; }',

      /* user message = right-aligned pill */
      '.wiq-msg-user { align-self:flex-end; background:#262c4d; color:#e6ecf7;',
      '  padding:10px 16px; border-radius:18px; font-size:15px; line-height:1.45;',
      '  max-width:85%; word-wrap:break-word; }',

      /* bot message = no bubble, plain flowing text */
      '.wiq-msg-bot { align-self:stretch; color:#e6ecf7; font-size:15.5px; line-height:1.6;',
      '  word-wrap:break-word; }',
      '.wiq-msg-bot p { margin: 0 0 10px; }',
      '.wiq-msg-bot p:last-child { margin-bottom: 0; }',
      '.wiq-msg-bot strong { font-weight:700; color:#ffffff; }',
      '.wiq-msg-bot a { color:#a89bff; text-decoration:none; }',
      '.wiq-msg-bot a:hover { text-decoration:underline; }',
      '.wiq-msg-bot sup { color:#a89bff; font-weight:700; font-size:11px; margin:0 1px; }',

      /* error message */
      '.wiq-msg-error { align-self:stretch; background:rgba(248,113,113,0.08);',
      '  color:#fca5a5; border:1px solid rgba(248,113,113,0.25);',
      '  border-radius:12px; padding:10px 12px; font-size:13.5px; }',

      /* source pills row */
      '.wiq-sources { margin-top:16px; display:flex; flex-wrap:wrap; gap:8px; }',
      '.wiq-source-pill { display:inline-flex; align-items:center; gap:8px;',
      '  background:#1a2044; border:1px solid #2a3160; border-radius:14px;',
      '  padding:6px 12px 6px 8px; text-decoration:none; color:#e6ecf7;',
      '  font-size:12.5px; max-width:100%; transition: background 0.15s; }',
      '.wiq-source-pill:hover { background:#232a52; }',
      '.wiq-source-pill img { width:16px; height:16px; border-radius:3px; flex:0 0 16px;',
      '  background:#0e1330; }',
      '.wiq-source-pill .wiq-src-num { color:#a89bff; font-weight:700; font-size:11px; }',
      '.wiq-source-pill .wiq-src-host { color:#8b93aa; font-size:12px; white-space:nowrap;',
      '  overflow:hidden; text-overflow:ellipsis; max-width:180px; }',

      /* typing */
      '.wiq-typing { display:inline-flex; gap:5px; align-items:center; padding:6px 0; }',
      '.wiq-typing span { width:7px; height:7px; background:#8b93aa; border-radius:50%;',
      '  animation: wiq-blink 1.2s infinite ease-in-out; }',
      '.wiq-typing span:nth-child(2) { animation-delay: 0.15s; }',
      '.wiq-typing span:nth-child(3) { animation-delay: 0.30s; }',
      '@keyframes wiq-blink { 0%,80%,100% { opacity:0.25; transform:translateY(0); }',
      '  40% { opacity:1; transform:translateY(-2px); } }',

      /* input dock */
      '.wiq-input-row { padding:12px 16px 8px; background:#0e1330;',
      '  border-top:1px solid #1e2447; }',
      '.wiq-input-pill { display:flex; align-items:flex-end; gap:10px;',
      '  background:#1a2044; border:1px solid #2a3160; border-radius:24px;',
      '  padding:8px 8px 8px 14px; transition: border-color 0.15s; }',
      '.wiq-input-pill:focus-within { border-color:#8b7dff; }',
      '.wiq-input-plus { width:32px; height:32px; border-radius:50%;',
      '  border:1px solid #2a3160; background:transparent; color:#8b93aa;',
      '  display:grid; place-items:center; cursor:pointer; font-size:18px; line-height:1;',
      '  flex:0 0 32px; }',
      '.wiq-input { flex:1; background:transparent; border:0; outline:0;',
      '  color:#e6ecf7; font-family:inherit; font-size:15px; resize:none;',
      '  min-height:24px; max-height:120px; padding:6px 4px; line-height:1.4; }',
      '.wiq-input::placeholder { color:#8b93aa; }',
      '.wiq-send { width:36px; height:36px; border-radius:50%; border:0; cursor:pointer;',
      '  background: linear-gradient(135deg,#8b7dff 0%,#5a4fe0 100%); color:#fff;',
      '  display:grid; place-items:center; flex:0 0 36px; transition: transform 0.15s; }',
      '.wiq-send:hover:not(:disabled) { transform: scale(1.05); }',
      '.wiq-send:disabled { opacity:0.5; cursor:not-allowed; }',
      '.wiq-send svg { width:16px; height:16px; }',

      /* disclaimer */
      '.wiq-disclaimer { font-size:11px; color:#8b93aa; padding:6px 20px 12px;',
      '  text-align:center; background:#0e1330; line-height:1.4; }'
    ].join("\n");
    var style = document.createElement("style");
    style.id = "webiq-widget-styles";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function render(root) {
    root.innerHTML =
      '<button class="wiq-bubble" id="wiq-bubble-btn" aria-label="Open WebIQ Agent">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
        ' stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>' +
        '</svg>' +
      '</button>' +
      '<div class="wiq-panel" id="wiq-panel" role="dialog" aria-label="WebIQ Agent">' +
        '<div class="wiq-header">' +
          '<div class="wiq-header-mark">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"' +
            ' stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' +
            '</svg>' +
          '</div>' +
          '<div>' +
            '<div class="wiq-header-title">' + esc(CFG.title) + '</div>' +
            '<div class="wiq-header-sub">' + esc(CFG.subtitle) + '</div>' +
          '</div>' +
          '<button class="wiq-header-close" id="wiq-close-btn" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="wiq-messages" id="wiq-messages"></div>' +
        '<div class="wiq-input-row">' +
          '<div class="wiq-input-pill">' +
            '<button class="wiq-input-plus" type="button" aria-label="Add" tabindex="-1">+</button>' +
            '<textarea class="wiq-input" id="wiq-input" rows="1" placeholder="Message ' + esc(CFG.title) + '"></textarea>' +
            '<button class="wiq-send" id="wiq-send-btn" aria-label="Send">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"' +
              ' stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M5 12l14 0"></path><path d="M13 6l6 6-6 6"></path>' +
              '</svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="wiq-disclaimer">' + esc(CFG.disclaimer) + '</div>' +
      '</div>';
  }

  function wire(root) {
    var bubbleBtn = root.querySelector("#wiq-bubble-btn");
    var panel     = root.querySelector("#wiq-panel");
    var closeBtn  = root.querySelector("#wiq-close-btn");
    var messages  = root.querySelector("#wiq-messages");
    var input     = root.querySelector("#wiq-input");
    var sendBtn   = root.querySelector("#wiq-send-btn");

    addBot(messages, CFG.greeting);

    bubbleBtn.addEventListener("click", function () {
      panel.classList.toggle("wiq-open");
      if (panel.classList.contains("wiq-open")) input.focus();
    });
    closeBtn.addEventListener("click", function () { panel.classList.remove("wiq-open"); });
    sendBtn.addEventListener("click", handleSend);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });

    function handleSend() {
      var query = (input.value || "").trim();
      if (!query) return;
      input.value = "";
      input.style.height = "auto";
      sendBtn.disabled = true;

      addUser(messages, query);
      var typing = addTyping(messages);

      runPipeline(query)
        .then(function (result) {
          typing.remove();
          addBot(messages, result.answer, result.sources);
        })
        .catch(function (err) {
          typing.remove();
          addError(messages, (err && err.message) ? err.message : String(err));
          console.error("[WebIQ]", err);
        })
        .then(function () {
          sendBtn.disabled = false;
          input.focus();
        });
    }
  }

  // ---------------------------------------------------------------
  function runPipeline(query) {
    if (CFG.proxyUrl) {
      return callProxy(query).then(function (data) {
        return { answer: data.answer, sources: data.sources || [] };
      });
    }
    return callWebIQ(query).then(function (results) {
      if (!results.length) {
        throw new Error("No relevant web results were found. Try broadening your question or source selection.");
      }
      var sources = results.map(function (r) { return { title: r.title, url: r.url }; });
      return callAzureFoundry(query, results).then(function (answer) {
        return { answer: answer, sources: sources };
      });
    });
  }

  function fetchWithRetry(label, url, options) {
    return fetch(url, options).catch(function () {
      return new Promise(function (resolve) { setTimeout(resolve, 500); })
        .then(function () { return fetch(url, options); });
    }).catch(function (err) {
      var detail = (err && err.message) ? err.message : String(err);
      throw new Error(label + " network request failed after retry: " + detail);
    });
  }

  function isMissingCredential(value) {
    return !value || /^REPLACE_WITH_|^YOUR_/i.test(String(value));
  }

  function callWebIQ(query) {
    if (isMissingCredential(CFG.webiqApiKey)) {
      return Promise.reject(new Error("WebIQ API key not configured. Set data-wiq-webiq-key or use data-wiq-proxy-url."));
    }
    return ensureResolvedDomains().then(function () {
      var payload = {
        query: query,
        maxResults: CFG.maxResults,
        language: CFG.language,
        region: CFG.region,
        contentFormat: CFG.contentFormat,
        maxLength: CFG.maxContentLength
      };
      var inc = CFG._includeDomainsResolved || [];
      var exc = CFG._excludeDomainsResolved || [];
      // WebIQ caps each domain list at 250 entries.
      if (inc.length > 250) inc = inc.slice(0, 250);
      if (exc.length > 250) exc = exc.slice(0, 250);
      if (inc.length) payload.includeDomains = inc;
      if (exc.length) payload.excludeDomains = exc;
      return fetchWithRetry("WebIQ", CFG.webiqEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-apikey": CFG.webiqApiKey },
        body: JSON.stringify(payload)
      });
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) {
        throw new Error("WebIQ " + res.status + ": " + t.slice(0, 200));
      });
      return res.json();
    }).then(function (json) {
      if (Array.isArray(json.webResults)) return json.webResults;
      if (!Array.isArray(json.results)) return [];
      return json.results.map(function (result) {
        var citation = Array.isArray(result.citations) ? result.citations[0] : null;
        var evidence = result.evidence || {};
        return {
          title: (citation && citation.title) || result.title || "Untitled",
          url: (citation && citation.url) || result.url || "",
          content: evidence.content || result.content || ""
        };
      }).filter(function (result) {
        return result.content || result.url;
      });
    });
  }

  function callAzureFoundry(query, results) {
    if (isMissingCredential(CFG.azureApiKey) || /^https:\/\/YOUR-/i.test(CFG.azureEndpoint)) {
      return Promise.reject(new Error("Azure Foundry is not configured. Set its key and endpoint, or use data-wiq-proxy-url."));
    }
    var context = results.map(function (r, i) {
      var content = (r.content || "").slice(0, CFG.maxContentLength);
      return "[Source " + (i + 1) + "] " + (r.title || "Untitled") +
             "\nURL: " + (r.url || "") + "\n" + content;
    }).join("\n\n---\n\n");
    var systemPrompt =
      "You are WebIQ, a helpful assistant that answers questions on any topic " +
      "using ONLY the provided web search results. Be concise, structured, and " +
      "neutral. When you use a fact from a source, cite it inline like [1], [2] " +
      "matching the source numbers. If the sources do not contain enough " +
      "information to answer, say so plainly. Do not invent facts that are not " +
      "in the sources.";
    var userContent =
      "User question: " + query + "\n\n" +
      "Web search results:\n\n" + context + "\n\n" +
      "Answer the question using the sources above and cite them as [n].";
    var url = CFG.azureEndpoint +
      (CFG.azureApiVersion ? "?api-version=" + encodeURIComponent(CFG.azureApiVersion) : "");
    return fetchWithRetry("Azure Foundry", url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": CFG.azureApiKey,
        "Authorization": "Bearer " + CFG.azureApiKey
      },
      body: JSON.stringify({
        model: CFG.azureModel,
        max_tokens: CFG.maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userContent }
        ]
      })
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) {
        throw new Error("Azure Foundry " + res.status + ": " + t.slice(0, 300));
      });
      return res.json();
    }).then(function (json) {
      var choice = (json.choices && json.choices[0]) || {};
      var msg = choice.message || {};
      var text = typeof msg.content === "string" ? msg.content :
                 Array.isArray(msg.content) ?
                   msg.content.filter(function (c) { return c && c.type === "text"; })
                              .map(function (c) { return c.text; }).join("\n")
                   : "";
      return (text || "").trim() || "(No answer returned.)";
    });
  }

  function callProxy(query) {
    return fetchWithRetry("Proxy", CFG.proxyUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: query })
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) {
        throw new Error("Proxy " + res.status + ": " + t.slice(0, 200));
      });
      return res.json();
    });
  }

  // ---------------------------------------------------------------
  function addUser(container, text) {
    var el = document.createElement("div");
    el.className = "wiq-msg wiq-msg-user";
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function addBot(container, text, sources) {
    var el = document.createElement("div");
    el.className = "wiq-msg wiq-msg-bot";
    el.innerHTML = mdLite(text);
    if (sources && sources.length) {
      var s = document.createElement("div");
      s.className = "wiq-sources";
      s.innerHTML = sources.map(function (src, i) {
        var host = hostOf(src.url);
        var favicon = host
          ? "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=64"
          : "";
        return '<a class="wiq-source-pill" href="' + esc(src.url || "#") +
               '" target="_blank" rel="noopener noreferrer" title="' +
               esc(src.title || host || "source") + '">' +
                 (favicon ? '<img src="' + esc(favicon) + '" alt="" loading="lazy">' : "") +
                 '<span class="wiq-src-num">[' + (i + 1) + ']</span>' +
                 '<span class="wiq-src-host">' + esc(host || "source") + '</span>' +
               '</a>';
      }).join("");
      el.appendChild(s);
    }
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { return ""; }
  }

  function addError(container, text) {
    var el = document.createElement("div");
    el.className = "wiq-msg-error";
    el.textContent = "Something went wrong: " + text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function addTyping(container) {
    var el = document.createElement("div");
    el.className = "wiq-msg wiq-msg-bot";
    el.innerHTML = '<div class="wiq-typing"><span></span><span></span><span></span></div>';
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function mdLite(text) {
    var s = String(text == null ? "" : text).trim();
    var paras = s.split(/\n{2,}/).map(function (p) {
      var html = esc(p);
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\[(\d+)\]/g, "<sup>[$1]</sup>");
      html = html.replace(/\n/g, "<br>");
      return "<p>" + html + "</p>";
    });
    return paras.join("");
  }

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i] || {};
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }
})();
