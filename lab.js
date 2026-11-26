(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (text != null) e.textContent = text; return e; }
  var SITE = window.HRSite, CDN = !!window.LAB_CDN, BASE = CDN ? "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/" : new URL("py/", location.href).href, MAN = null;
  // Python's archives (.zip/.whl) are stored on the site as base64 text parts; this shim serves them to Pyodide.
  function b64bytes(str) { var bin = atob(str), n = bin.length, u = new Uint8Array(n); for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u; }
  function installShim() {
    if (CDN || window.__pyShim) return Promise.resolve(); window.__pyShim = true; var real = window.fetch.bind(window);
    return real(BASE + "manifest.json").then(function (r) { return r.json(); }).then(function (m) { MAN = m;
      window.fetch = function (input, init) { var url = typeof input === "string" ? input : input && input.url || String(input);
        if (url.indexOf(BASE) === 0) { var name = decodeURIComponent(url.slice(BASE.length).split("?")[0]), ent = MAN[name];
          if (ent) return Promise.all(ent.parts.map(function (p) { return real(BASE + p).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status + " for " + p); return r.text(); }); }))
            .then(function (txt) { return new Response(b64bytes(txt.join("")), { status: 200, headers: { "Content-Type": name.slice(-4) === ".zip" ? "application/zip" : "application/octet-stream" } }); }); }
        return real(input, init); }; }); }
  var py = null, pyLoading = null, queue = Promise.resolve(), cells = [], tabs = [], active = null, tabSeq = 1, nextId = 1, dataStale = true;

  // ---------- Python engine ----------
  var RUNNER = [
    "import ast, io, sys, json, base64, traceback",
    "import matplotlib",
    "matplotlib.use('Agg')",
    "import matplotlib.pyplot as plt",
    "NS = {'__name__': '__main__'}",
    "def _lab_run(code):",
    "    out = []",
    "    buf = io.StringIO()",
    "    o, e = sys.stdout, sys.stderr",
    "    sys.stdout = sys.stderr = buf",
    "    val = None",
    "    err = None",
    "    try:",
    "        tree = ast.parse(code)",
    "        last = None",
    "        if tree.body and isinstance(tree.body[-1], ast.Expr):",
    "            last = ast.Expression(tree.body.pop().value)",
    "        exec(compile(tree, '<cell>', 'exec'), NS)",
    "        if last is not None:",
    "            val = eval(compile(last, '<cell>', 'eval'), NS)",
    "    except BaseException:",
    "        err = traceback.format_exc(limit=3)",
    "    finally:",
    "        sys.stdout, sys.stderr = o, e",
    "    t = buf.getvalue()",
    "    if t: out.append({'t': 'text', 'v': t[-20000:]})",
    "    if val is not None:",
    "        mod = type(val).__module__ or ''",
    "        if mod.startswith('pandas') and (hasattr(val, 'to_html') or hasattr(val, 'to_frame')):",
    "            import pandas as pd",
    "            v = val.to_frame() if hasattr(val, 'to_frame') and not hasattr(val, 'columns') else val",
    "            out.append({'t': 'html', 'v': v.to_html(max_rows=30, max_cols=25, border=0), 'plain': v.to_string(max_rows=30, max_cols=12)[:3000]})",
    "        else:",
    "            out.append({'t': 'text', 'v': repr(val)[:20000]})",
    "    for n in plt.get_fignums():",
    "        f = plt.figure(n)",
    "        b = io.BytesIO()",
    "        f.savefig(b, format='png', dpi=96, bbox_inches='tight')",
    "        out.append({'t': 'img', 'v': base64.b64encode(b.getvalue()).decode()})",
    "    plt.close('all')",
    "    if err: out.append({'t': 'err', 'v': err[-6000:]})",
    "    return json.dumps(out)"
  ].join("\n");

  function status(t, state) { var s = $("pystat"); s.className = "pystat " + (state || ""); s.lastChild.textContent = t; }
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("Could not load " + src)); }; document.head.appendChild(s); }); }
  function startPython() {
    if (py) return Promise.resolve(py);
    if (pyLoading) return pyLoading;
    $("py-start").disabled = true; status("Loading Python… (first time can take 20–60 s)", "busy");
    var step = function (t) { status(t, "busy"); };
    var guard = setTimeout(function () { if (!py) status("Still loading after 90 s…", "busy"); }, 90000);
    pyLoading = installShim().then(function () { return loadScript(BASE + "pyodide.js"); }).then(function () { step("Starting Python (engine)…"); return window.loadPyodide({ indexURL: BASE, stdout: function () {}, stderr: function (t) { $("pymsg").textContent = String(t).slice(0, 200); } }); })
      .then(function (p) { status("Loading pandas, NumPy, matplotlib…", "busy"); return p.loadPackage(["numpy", "pandas", "matplotlib"]).then(function () { return p; }); })
      .then(function (p) { return p.runPythonAsync(RUNNER).then(function () { py = p; return loadData(); }); })
      .then(function () { clearTimeout(guard); status("Python ready · df loaded", "ok"); $("py-start").hidden = true; $("py-runall").disabled = false; return py; })
      .catch(function (e) { clearTimeout(guard); pyLoading = null; $("py-start").disabled = false; status("Python could not start: " + (e && e.message || e), "bad"); throw e; });
    return pyLoading;
  }
  function loadData() {
    if (!py) return Promise.resolve();
    py.FS.writeFile("/data.csv", SITE.csv());
    return py.runPythonAsync("import pandas as pd\nNS['pd'] = pd\nNS['df'] = pd.read_csv('/data.csv')\nNS['df'].shape").then(function (shape) {
      dataStale = false; var s = shape.toJs ? shape.toJs() : shape; if (shape.destroy) shape.destroy();
      $("pymsg").textContent = "df = " + SITE.info().name + " (" + s[0] + " rows × " + s[1] + " columns)"; });
  }
  SITE.onData(function () { dataStale = true; if (py) enqueue(function () { return loadData().then(function () { status("Python ready · df reloaded", "ok"); }); }); });

  function enqueue(fn) { var p = queue.then(fn, fn); queue = p.catch(function () {}); return p; }
  function runCode(code) {
    return startPython().then(function () { return enqueue(function () {
      return (dataStale ? loadData() : Promise.resolve())
        .then(function () { return py.loadPackagesFromImports(code).catch(function () {}); })
        .then(function () { var f = py.globals.get("_lab_run"); var r = f(code); f.destroy(); return JSON.parse(r); }); }); });
  }

  // ---------- notebook UI ----------
  function newTab(name, codes) { var t = { id: tabSeq++, name: name || "Notebook " + tabSeq, cells: [] }; tabs.push(t); switchTab(t);
    (codes && codes.length ? codes : [""]).forEach(function (c) { addCell(c); }); drawTabs(); return t; }
  function switchTab(t) { active = t; cells = t.cells; drawTabs(); drawCells(); }
  function closeTab(t) { var i = tabs.indexOf(t); if (i < 0) return; tabs.splice(i, 1); if (!tabs.length) { newTab("Notebook 1", ["# df holds the data from the Data workspace\ndf.head()"]); return; } if (active === t) switchTab(tabs[Math.max(0, i - 1)]); else drawTabs(); }
  function drawTabs() { var bar = $("labtabs"); if (!bar) return; bar.textContent = "";
    tabs.forEach(function (t) { var w = el("div", { class: "ltb" + (t === active ? " on" : ""), role: "tab", "aria-selected": t === active ? "true" : "false" });
      var b = el("button", { type: "button", class: "ltn", title: t.name }, t.name); b.addEventListener("click", function () { switchTab(t); });
      var x = el("button", { type: "button", class: "ltx", "aria-label": "Close tab " + t.name }, "×"); x.addEventListener("click", function () { closeTab(t); });
      w.appendChild(b); w.appendChild(x); bar.appendChild(w); });
    var add = el("button", { type: "button", class: "ltadd", "aria-label": "New tab" }, "+ New tab"); add.addEventListener("click", function () { newTab("Notebook " + tabSeq, [""]); }); bar.appendChild(add); }
  function cellById(id) { for (var i = 0; i < cells.length; i++) if (cells[i].id === id) return i; return -1; }
  function addCell(code, at) {
    var c = { id: nextId++, code: code || "", out: [], n: null };
    if (at == null || at >= cells.length) cells.push(c); else cells.splice(Math.max(0, at), 0, c);
    drawCells(); return c;
  }
  function autosize(t) { t.style.height = "auto"; t.style.height = Math.min(600, t.scrollHeight + 2) + "px"; }
  var execCount = 0;
  function runCell(c) {
    var i = cellById(c.id); if (i < 0) return Promise.reject(new Error("cell missing"));
    c.running = true; drawOne(c);
    return runCode(c.code).then(function (out) { c.out = out; c.n = ++execCount; c.running = false; drawOne(c); return out; },
      function (e) { c.running = false; c.out = [{ t: "err", v: String(e && e.message || e) }]; drawOne(c); return c.out; });
  }
  function drawCells() { var box = $("cellsbox"); box.textContent = ""; cells.forEach(function (c) { box.appendChild(cellNode(c)); }); }
  function drawOne(c) { var old = document.querySelector("[data-cell='" + c.id + "']"); if (old) old.replaceWith(cellNode(c)); }
  function cellNode(c) {
    var i = cellById(c.id), w = el("div", { class: "lc" + (c.running ? " run" : ""), "data-cell": String(c.id) });
    var hd = el("div", { class: "lch" }); hd.appendChild(el("span", { class: "lcn" }, "[" + (c.running ? "*" : c.n || " ") + "]  cell " + (i + 1)));
    var acts = el("span", { class: "lca" });
    var rb = el("button", { type: "button", class: "lcb run", "aria-label": "Run cell " + (i + 1) }, "▶ Run"); rb.addEventListener("click", function () { runCell(c); });
    var ab = el("button", { type: "button", class: "lcb", "aria-label": "Add cell below" }, "+ below"); ab.addEventListener("click", function () { var n = addCell("", cellById(c.id) + 1); focusCell(n); });
    var db = el("button", { type: "button", class: "lcb", "aria-label": "Delete cell " + (i + 1) }, "Delete"); db.addEventListener("click", function () { cells.splice(cellById(c.id), 1); drawCells(); });
    acts.appendChild(rb); acts.appendChild(ab); acts.appendChild(db); hd.appendChild(acts); w.appendChild(hd);
    var ta = el("textarea", { class: "lct", spellcheck: "false", "aria-label": "Code, cell " + (i + 1) }); ta.value = c.code;
    ta.addEventListener("input", function () { c.code = ta.value; autosize(ta); });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); runCell(c).then(function () { var j = cellById(c.id); if (j === cells.length - 1) focusCell(addCell("", j + 1)); else focusCell(cells[j + 1]); }); }
      else if (e.key === "Tab") { e.preventDefault(); var s = ta.selectionStart; ta.value = ta.value.slice(0, s) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + 4; c.code = ta.value; } });
    w.appendChild(ta); setTimeout(function () { autosize(ta); }, 0);
    if (c.out.length) { var o = el("div", { class: "lco" });
      c.out.forEach(function (x) {
        if (x.t === "text") o.appendChild(el("pre", null, x.v));
        else if (x.t === "err") o.appendChild(el("pre", { class: "lerr" }, x.v));
        else if (x.t === "img") { var im = el("img", { alt: "Figure output of cell " + (i + 1) }); im.src = "data:image/png;base64," + x.v; o.appendChild(im); }
        else if (x.t === "html") { var d = el("div", { class: "ltab" }); d.innerHTML = x.v; d.querySelectorAll("script,iframe,object,embed,link,style").forEach(function (n) { n.remove(); }); o.appendChild(d); } });
      w.appendChild(o); }
    return w;
  }
  function focusCell(c) { var n = document.querySelector("[data-cell='" + c.id + "'] textarea"); if (n) n.focus(); }
  function summary(out) { return out.map(function (x) { return x.t === "img" ? "[figure displayed]" : x.t === "html" ? x.plain : x.t === "err" ? "ERROR:\n" + x.v : x.v; }).join("\n").slice(0, 4000) || "(no output)"; }

  $("py-start").addEventListener("click", function () { startPython().catch(function () {}); });
  $("py-add").addEventListener("click", function () { focusCell(addCell("")); });
  $("py-runall").addEventListener("click", function () { cells.reduce(function (p, c) { return p.then(function () { return runCell(c); }); }, Promise.resolve()); });
  $("py-dl").addEventListener("click", function () {
    var nb = { nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { name: "python3", display_name: "Python 3" } },
      cells: [{ cell_type: "markdown", id: "m0", metadata: {}, source: ["# Lab · " + SITE.info().name + "\n", "Upload the CSV to Colab or load it from your Drive, then run the cells."] },
        { cell_type: "code", id: "c0", metadata: {}, execution_count: null, outputs: [], source: ["import pandas as pd\n", "df = pd.read_csv(\"" + SITE.info().name.replace(/["\\]/g, "_") + "\")  # change the path if needed"] }]
        .concat(cells.map(function (c, k) { return { cell_type: "code", id: "c" + (k + 1), metadata: {}, execution_count: null, outputs: [], source: c.code.split("\n").map(function (l, j, a) { return j < a.length - 1 ? l + "\n" : l; }) }; })) };
    var name = "Lab_" + SITE.nbName() + ".ipynb", data = JSON.stringify(nb, null, 1);
    (window.claude && window.claude.use ? window.claude.use("downloads") : Promise.resolve(null)).then(function (d) {
      if (!d) { var u = URL.createObjectURL(new Blob([data], { type: "application/json" })), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); $("pymsg").textContent = "Downloaded " + name + "."; return; }
      return d.save({ filename: name, data: new Blob([data], { type: "application/json" }) }).then(function () { $("pymsg").textContent = "Saved " + name + "."; });
    }).catch(function (e) { $("pymsg").textContent = e && e.code === "declined" ? "Download cancelled." : "Download failed."; });
  });
  newTab("Notebook 1", ["# df holds the data from the Data workspace\ndf.head()"]);

  // ---------- Claude ----------
  var turns = [], ctl = null, sampleP = null;
  var RULES = [
    "You are the teaching assistant inside the Data Science Academy website (Statistics and Machine Learning class).",
    "The page has: (1) a Data workspace with descriptive analytics (numerical metrics, categorical frequencies), (2) a Data quality part (missing values, outliers), (3) this Lab: a Python notebook running in the browser with Pyodide.",
    "In the Lab, a pandas DataFrame named df already holds the current data. Available libraries: pandas, numpy, scipy, statsmodels, scikit-learn, xgboost, matplotlib. NOT available: seaborn, tensorflow, pytorch, pip installs, internet access. For deep learning, tell the user to use the site's Open in Colab button.",
    "Use your tools: write code into notebook cells and run them (add_cell / edit_cell / run_cell), read the output, fix errors yourself, then explain the result briefly. Prefer one focused cell per step. Use plt for charts. Never reload df from a file path other than what the tools say.",
    "When the user asks for descriptive statistics, frequencies or data-quality views on the site itself, use the site_* tools.",
    "Answer in the user's language (English or Azerbaijani). Keep answers short and concrete; name the cell numbers you created. Plain text, no markdown headings."
  ].join("\n");
  function ctx() { var I = SITE.info(); return "Current data: " + I.name + (I.sample ? " (HR sample)" : " (uploaded)") + ", " + I.rows + " rows. Columns: " + I.columns.join(", ").slice(0, 6000) +
    "\nSite state: " + JSON.stringify(I.site) + "\nLab tabs: " + tabs.map(function (t) { return (t === active ? "*" : "") + t.name; }).join(", ") + " (* = active; cell tools act on the active tab)\nNotebook: " + (cells.length ? cells.map(function (c, k) { return "cell " + (k + 1) + (c.n ? " (ran)" : " (not run)") + ": " + c.code.slice(0, 300).replace(/\n/g, "⏎"); }).join(" | ").slice(0, 6000) : "empty") +
    "\nPython: " + (py ? "ready" : "not started yet (it starts automatically when you run a cell)"); }
  function idx(n) { var i = Math.round(Number(n)) - 1; if (!(i >= 0 && i < cells.length)) throw new Error("There is no cell " + n + ". The notebook has " + cells.length + " cells."); return i; }
  function note(t) { $("aistat").textContent = t; }
  var TOOLS = [
    { name: "add_cell", description: "Add a Python code cell to the Lab notebook (at the end, or after cell `after`) and run it unless run=false. Returns the cell number and its output text (tables as text, '[figure displayed]' for charts, errors with traceback).",
      inputSchema: { type: "object", properties: { code: { type: "string" }, run: { type: "boolean" }, after: { type: "integer", description: "1-based cell number to insert after" } }, required: ["code"] },
      execute: function (a) { var at = a.after != null ? Math.round(Number(a.after)) : null; var c = addCell(String(a.code || ""), at); var n = cellById(c.id) + 1; note("Claude added cell " + n + (a.run === false ? "" : " and is running it…"));
        document.querySelector("[data-cell='" + c.id + "']").scrollIntoView({ behavior: "smooth", block: "nearest" });
        if (a.run === false) return { cell: n }; return runCell(c).then(function (o) { return { cell: cellById(c.id) + 1, output: summary(o) }; }); } },
    { name: "edit_cell", description: "Replace the code of an existing cell (1-based number) and run it unless run=false. Returns the output text.",
      inputSchema: { type: "object", properties: { cell: { type: "integer" }, code: { type: "string" }, run: { type: "boolean" } }, required: ["cell", "code"] },
      execute: function (a) { var c = cells[idx(a.cell)]; c.code = String(a.code || ""); c.out = []; drawOne(c); note("Claude edited cell " + a.cell);
        if (a.run === false) return { cell: a.cell }; return runCell(c).then(function (o) { return { cell: a.cell, output: summary(o) }; }); } },
    { name: "run_cell", description: "Run an existing cell (1-based) and return its output text.", inputSchema: { type: "object", properties: { cell: { type: "integer" } }, required: ["cell"] },
      execute: function (a) { var c = cells[idx(a.cell)]; note("Claude is running cell " + a.cell + "…"); return runCell(c).then(function (o) { return { cell: a.cell, output: summary(o) }; }); } },
    { name: "delete_cell", description: "Delete a cell (1-based). Later cells move up by one.", inputSchema: { type: "object", properties: { cell: { type: "integer" } }, required: ["cell"] },
      execute: function (a) { cells.splice(idx(a.cell), 1); drawCells(); return { deleted: a.cell, cells_now: cells.length }; } },
    { name: "site_descriptive", description: "Operate the site's Descriptive analytics (Numerical): select features and metrics and press Apply. Metrics: count, missing, min, max, mean, median, mode, std, var, q1, q3, iqr, range, skew, kurt; percentiles as numbers. Returns the result table.",
      inputSchema: { type: "object", properties: { features: { type: "array", items: { type: "string" } }, metrics: { type: "array", items: { type: "string" } }, percentiles: { type: "array", items: { type: "number" } } }, required: ["features", "metrics"] },
      execute: function (a) { note("Claude is setting the site’s descriptive analytics…"); var r = SITE.descriptive(a.features, a.metrics, (a.percentiles || []).map(Number).filter(function (p) { return p > 0 && p < 100; })); $("descout").scrollIntoView({ behavior: "smooth", block: "start" }); return r; } },
    { name: "site_frequencies", description: "Operate the site's Categorical frequencies: select categorical features and a chart type (bar, pie or donut) and show them.",
      inputSchema: { type: "object", properties: { features: { type: "array", items: { type: "string" } }, chart: { type: "string", enum: ["bar", "pie", "donut"] } }, required: ["features"] },
      execute: function (a) { note("Claude is showing frequencies on the site…"); return SITE.frequencies(a.features, a.chart); } },
    { name: "site_quality", description: "Show the site's Data quality part with either missing values or outliers (IQR and z-score per feature).", inputSchema: { type: "object", properties: { view: { type: "string", enum: ["missing", "outliers"] } }, required: ["view"] },
      execute: function (a) { return SITE.quality(a.view); } }
  ];
  function bubble(role, text) { var b = el("div", { class: "msg " + role }); b.appendChild(el("p", null, text)); $("aimsgs").appendChild(b); b.scrollIntoView({ block: "end" }); return b; }
  function busy(on) { $("aisend").disabled = on; $("aistop").hidden = !on; $("aiin").disabled = on; }
  function copyFor(e) { var c = e && e.code;
    return c === "no_claude" ? "The Claude assistant is not connected on this site yet." : c === "not_granted" ? "Claude is not allowed for this page. Allow it when claude.ai asks, then try again." :
      c === "rate_limited" ? "Too many requests or your usage limit was reached. Please wait and try again." :
      c === "sampling_disabled" ? "Claude is not available for this account." : c === "tools_unavailable" ? "This view cannot let Claude use the page’s tools." :
      c === "session_expired" ? "Please sign in to claude.ai again." : c === "refused" ? "Claude declined this request. Try asking differently." :
      c === "prompt_too_large" ? "The conversation is too long. Click New chat." : "Something went wrong (" + (c || "error") + "). Try again."; }
  function send(text) {
    text = String(text || "").trim(); if (!text || ctl) return;
    var sug = document.querySelector(".aisug"); if (sug) sug.remove();
    bubble("user", text); turns.push({ role: "user", content: text });
    while (JSON.stringify(turns).length > 60000 && turns.length > 2) turns.splice(0, 2);
    var b = bubble("ai", "Thinking…"), p = b.firstChild; busy(true); note("");
    ctl = new AbortController();
    (sampleP || (sampleP = window.claude && window.claude.use ? window.claude.use("sample") : Promise.resolve(null))).then(function (S) {
      if (!S) throw { code: "no_claude" };
      var input = [{ role: "user", content: RULES + "\n\n" + ctx() + "\n\nThe conversation follows." }].concat(turns);
      return S(input, { cache: false, signal: ctl.signal, tools: TOOLS, onText: function (u) { p.textContent = u.text; b.scrollIntoView({ block: "end" }); } });
    }).then(function (r) { p.textContent = r.text; turns.push({ role: "assistant", content: r.text }); if (r.truncated) note("The answer was cut short."); else note(""); })
      .catch(function (e) { if (e && e.text) p.textContent = e.text; else if (e && e.code === "cancelled") p.textContent = "(stopped)"; else p.textContent = copyFor(e);
        if (e && e.text) turns.push({ role: "assistant", content: e.text }); else turns.pop(); note(e && e.code === "cancelled" ? "Stopped." : ""); })
      .then(function () { ctl = null; busy(false); $("aiin").focus(); });
  }
  $("aiform").addEventListener("submit", function (e) { e.preventDefault(); var v = $("aiin").value; $("aiin").value = ""; send(v); });
  $("aiin").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("aiform").requestSubmit(); } });
  $("aistop").addEventListener("click", function () { if (ctl) ctl.abort(); });
  $("aiclear").addEventListener("click", function () { if (ctl) ctl.abort(); turns = []; $("aimsgs").textContent = ""; note("New chat started."); });
  document.querySelectorAll(".sug").forEach(function (b) { b.addEventListener("click", function () { send(b.textContent); }); });
  function labMode() { var on = location.hash === "#lab"; document.body.classList.toggle("labmode", on); if (on) window.scrollTo(0, 0); }
  window.addEventListener("hashchange", labMode); labMode();
  $("labback").addEventListener("click", function () { history.pushState("", document.title, location.pathname + location.search); labMode(); });
  window.HRLab = { addTab: function (name, codes) { var t = newTab(name, codes); if (location.hash !== "#lab") location.hash = "lab"; else labMode(); startPython().catch(function () {}); return t; }, run: function (code) { return runCode(code); }, cells: function () { return cells; }, tools: TOOLS, ctx: ctx };
})();
