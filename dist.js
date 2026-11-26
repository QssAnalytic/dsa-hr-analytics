(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("dsgrid") || !window.HRSite) return;
  var SITE = window.HRSite, NS = "http://www.w3.org/2000/svg", fmt = window.HRUpload.fmt;
  var INK = "#2E2E38", Y = "#FFE600", BLUE = "#188CE5", RED = "#E0362C", GRID = "#E6E6EE", MUTED = "#747480";
  var TYPES = { hist: "Histogram", norm: "Histogram + normal curve", box: "Boxplot", kde: "Density (KDE)", ecdf: "ECDF", qq: "Q–Q plot" };
  var PREF = ["Age", "MonthlyIncome", "TotalWorkingYears", "YearsAtCompany"], sel = null;
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (text != null) e.textContent = text; return e; }
  function sv(tag, a, text) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (text != null) e.textContent = text; return e; }

  // ---------- math ----------
  function sorted(c) { return c.d.sorted || c.nums.slice().sort(function (a, b) { return a - b; }); }
  function q(s, p) { var h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo); }
  function bins(s) { var n = s.length, iqr = q(s, .75) - q(s, .25), lo = s[0], hi = s[n - 1], uniq = 0, prev = NaN;
    for (var i = 0; i < n; i++) if (s[i] !== prev) { uniq++; prev = s[i]; if (uniq > 40) break; }
    if (uniq <= 25) { var vals = []; prev = NaN; s.forEach(function (v) { if (v !== prev) { vals.push(v); prev = v; } }); var step = vals.length > 1 ? Math.min.apply(null, vals.slice(1).map(function (v, k) { return v - vals[k]; })) : 1;
      return { lo: vals[0] - step / 2, w: step, k: Math.round((vals[vals.length - 1] - vals[0]) / step) + 1 }; }
    var w = iqr > 0 ? 2 * iqr / Math.cbrt(n) : (hi - lo) / Math.sqrt(n), k = Math.max(8, Math.min(45, Math.ceil((hi - lo) / (w || 1))));
    return { lo: lo, w: (hi - lo) / k || 1, k: k }; }
  function counts(s, b) { var c = new Array(b.k).fill(0); s.forEach(function (v) { var i = Math.floor((v - b.lo) / b.w); if (i >= b.k) i = b.k - 1; if (i < 0) i = 0; c[i]++; }); return c; }
  function npdf(x, m, sd) { var z = (x - m) / sd; return Math.exp(-.5 * z * z) / (sd * Math.sqrt(2 * Math.PI)); }
  function invNorm(p) { var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-.007784894002430293, -.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [.007784695709041462, .3224671290700398, 2.445134137142996, 3.754408661907416], pl = .02425, r, qq;
    if (p < pl) { qq = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * qq + c[1]) * qq + c[2]) * qq + c[3]) * qq + c[4]) * qq + c[5]) / ((((d[0] * qq + d[1]) * qq + d[2]) * qq + d[3]) * qq + 1); }
    if (p > 1 - pl) { qq = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * qq + c[1]) * qq + c[2]) * qq + c[3]) * qq + c[4]) * qq + c[5]) / ((((d[0] * qq + d[1]) * qq + d[2]) * qq + d[3]) * qq + 1); }
    qq = p - .5; r = qq * qq; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * qq / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  function kde(s, sd, lo, hi, m) { var n = s.length, iqr = q(s, .75) - q(s, .25), h = 0.9 * Math.min(sd, iqr / 1.34 || sd) * Math.pow(n, -0.2) || 1, xs = [], ys = [], step = Math.max(1, Math.floor(n / 1500));
    for (var i = 0; i < m; i++) { var x = lo + (hi - lo) * i / (m - 1), t = 0, cnt = 0; for (var j = 0; j < n; j += step) { var z = (x - s[j]) / h; t += Math.exp(-.5 * z * z); cnt++; } xs.push(x); ys.push(t / (cnt * h * Math.sqrt(2 * Math.PI))); } return { xs: xs, ys: ys }; }

  function dfmt(v) { return v === 0 ? "0" : v < 0.001 ? v.toExponential(1) : v.toPrecision(2); }
  // ---------- drawing ----------
  var W = 440, H = 250, L = 54, R = 14, T = 14, B = 34;
  function frame(svg, x0, x1, y0, y1, ylab) { var X = function (v) { return L + (v - x0) / (x1 - x0 || 1) * (W - L - R); }, Yf = function (v) { return H - B - (v - y0) / (y1 - y0 || 1) * (H - T - B); };
    for (var i = 0; i <= 4; i++) { var yv = y0 + (y1 - y0) * i / 4, yy = Yf(yv); svg.appendChild(sv("line", { x1: L, x2: W - R, y1: yy, y2: yy, stroke: GRID, "stroke-width": 1 })); svg.appendChild(sv("text", { x: L - 6, y: yy + 4, "text-anchor": "end", class: "dsax" }, ylab ? ylab(yv) : fmt(yv))); }
    for (var k = 0; k <= 4; k++) { var xv = x0 + (x1 - x0) * k / 4; svg.appendChild(sv("text", { x: X(xv), y: H - B + 16, "text-anchor": k === 0 ? "start" : k === 4 ? "end" : "middle", class: "dsax" }, fmt(xv, Math.abs(x1 - x0) < 10 ? 1 : 0))); }
    svg.appendChild(sv("line", { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: "#B8B8C4", "stroke-width": 1 })); return { X: X, Y: Yf }; }
  function vline(svg, x, y0, y1, color, dash, label) { var l = sv("line", { x1: x, x2: x, y1: y0, y2: y1, stroke: color, "stroke-width": 2 }); if (dash) l.setAttribute("stroke-dasharray", "5 4"); svg.appendChild(l); }
  function draw(type, c) { var s = sorted(c), d = c.d, n = s.length, svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "dssvg", role: "img", "aria-label": TYPES[type] + " of " + c.name });
    if (type === "hist" || type === "norm") { var b = bins(s), ct = counts(s, b), dens = type === "norm", ys = ct.map(function (v) { return dens ? v / (n * b.w) : v; }), lo = b.lo, hi = b.lo + b.w * b.k;
      var top = Math.max.apply(null, ys); if (dens) top = Math.max(top, npdf(d.mean, d.mean, d.std)); top *= 1.08;
      var F = frame(svg, lo, hi, 0, top, dens ? dfmt : function (v) { return Math.round(v).toLocaleString("en-US"); }), bw = (W - L - R) / b.k;
      ys.forEach(function (v, i) { if (!ct[i]) return; var x = F.X(lo + i * b.w), y = F.Y(v), r = sv("rect", { x: x + 1, y: y, width: Math.max(1, bw - 2), height: H - B - y, fill: dens ? "#C4C4CD" : INK, rx: 1 });
        r.appendChild(sv("title", {}, fmt(lo + i * b.w) + " – " + fmt(lo + (i + 1) * b.w) + ": " + ct[i] + " (" + (100 * ct[i] / n).toFixed(1) + "%)")); svg.appendChild(r); });
      if (dens) { var pts = []; for (var k = 0; k <= 80; k++) { var xv = lo + (hi - lo) * k / 80; pts.push(F.X(xv).toFixed(1) + "," + F.Y(npdf(xv, d.mean, d.std)).toFixed(1)); } svg.appendChild(sv("polyline", { points: pts.join(" "), fill: "none", stroke: Y, "stroke-width": 3 })); }
      vline(svg, F.X(d.mean), T, H - B, dens ? INK : Y); vline(svg, F.X(d.median), T, H - B, BLUE, true); return svg; }
    if (type === "box") { var q1 = d.q1, q3 = d.q3, iq = q3 - q1, lw = Math.max(s[0], q1 - 1.5 * iq), hw = Math.min(s[n - 1], q3 + 1.5 * iq);
      lw = s.filter(function (v) { return v >= q1 - 1.5 * iq; })[0]; hw = s.filter(function (v) { return v <= q3 + 1.5 * iq; }).slice(-1)[0];
      var F2 = frame(svg, s[0], s[n - 1], 0, 1, function () { return ""; }), cy = (H - B + T) / 2, bh = 60;
      svg.appendChild(sv("line", { x1: F2.X(lw), x2: F2.X(hw), y1: cy, y2: cy, stroke: INK, "stroke-width": 2 }));
      [lw, hw].forEach(function (v) { svg.appendChild(sv("line", { x1: F2.X(v), x2: F2.X(v), y1: cy - 16, y2: cy + 16, stroke: INK, "stroke-width": 2 })); });
      var bx = sv("rect", { x: F2.X(q1), y: cy - bh / 2, width: Math.max(2, F2.X(q3) - F2.X(q1)), height: bh, fill: Y, stroke: INK, "stroke-width": 2, rx: 3 }); bx.appendChild(sv("title", {}, "Q1 " + fmt(q1) + " · median " + fmt(d.median) + " · Q3 " + fmt(q3))); svg.appendChild(bx);
      svg.appendChild(sv("line", { x1: F2.X(d.median), x2: F2.X(d.median), y1: cy - bh / 2, y2: cy + bh / 2, stroke: INK, "stroke-width": 3 }));
      var outs = s.filter(function (v) { return v < q1 - 1.5 * iq || v > q3 + 1.5 * iq; });
      outs.forEach(function (v, i) { var c2 = sv("circle", { cx: F2.X(v), cy: cy + ((i % 7) - 3) * 4, r: 4, fill: RED, "fill-opacity": .55, stroke: "#fff", "stroke-width": 1 }); c2.appendChild(sv("title", {}, "Outlier: " + fmt(v))); svg.appendChild(c2); });
      svg.appendChild(sv("text", { x: L, y: T + 10, class: "dsax" }, outs.length + " IQR outliers")); return svg; }
    if (type === "kde") { var pad = (s[n - 1] - s[0]) * .05, K = kde(s, d.std, s[0] - pad, s[n - 1] + pad, 120), mx = Math.max.apply(null, K.ys) * 1.1, F3 = frame(svg, K.xs[0], K.xs[119], 0, mx, dfmt);
      var pp = K.xs.map(function (x, i) { return F3.X(x).toFixed(1) + "," + F3.Y(K.ys[i]).toFixed(1); }); svg.appendChild(sv("polygon", { points: F3.X(K.xs[0]) + "," + (H - B) + " " + pp.join(" ") + " " + F3.X(K.xs[119]) + "," + (H - B), fill: "#C4C4CD", "fill-opacity": .6 }));
      svg.appendChild(sv("polyline", { points: pp.join(" "), fill: "none", stroke: INK, "stroke-width": 2.5 })); vline(svg, F3.X(d.mean), T, H - B, Y); vline(svg, F3.X(d.median), T, H - B, BLUE, true); return svg; }
    if (type === "ecdf") { var F4 = frame(svg, s[0], s[n - 1], 0, 1, function (v) { return Math.round(v * 100) + "%"; }), pts2 = [], step = Math.max(1, Math.floor(n / 600));
      for (var i = 0; i < n; i += step) pts2.push(F4.X(s[i]).toFixed(1) + "," + F4.Y((i + 1) / n).toFixed(1)); pts2.push(F4.X(s[n - 1]).toFixed(1) + "," + F4.Y(1).toFixed(1));
      svg.appendChild(sv("polyline", { points: pts2.join(" "), fill: "none", stroke: INK, "stroke-width": 2.5 })); vline(svg, F4.X(d.median), T, H - B, BLUE, true); return svg; }
    if (type === "qq") { var step2 = Math.max(1, Math.floor(n / 500)), th = [], ob = []; for (var j = 0; j < n; j += step2) { th.push(invNorm((j + .5) / n)); ob.push((s[j] - d.mean) / d.std); }
      var lim = Math.max(3, Math.ceil(Math.max(Math.abs(ob[0]), Math.abs(ob[ob.length - 1])))), F5 = frame(svg, -3.2, 3.2, -lim, lim, function (v) { return v.toFixed(1); });
      svg.appendChild(sv("line", { x1: F5.X(-3.2), y1: F5.Y(-3.2), x2: F5.X(3.2), y2: F5.Y(3.2), stroke: Y, "stroke-width": 3 }));
      th.forEach(function (t, k) { svg.appendChild(sv("circle", { cx: F5.X(t), cy: F5.Y(Math.max(-lim, Math.min(lim, ob[k]))), r: 2.6, fill: INK, "fill-opacity": .6 })); });
      svg.appendChild(sv("text", { x: W - R, y: H - 4, "text-anchor": "end", class: "dsax" }, "theoretical z")); svg.appendChild(sv("text", { x: L, y: T + 8, class: "dsax" }, "sample z")); return svg; }
  }
  var KEYS = { hist: "dark bars = counts · yellow = mean · blue dashed = median", norm: "grey = density · yellow = normal curve with the same mean and std", box: "yellow box = Q1–Q3 · black line = median · red = IQR outliers",
    kde: "smoothed density · yellow = mean · blue dashed = median", ecdf: "share of values at or below x · blue dashed = median", qq: "points on the yellow line = normal; curving away = skew or heavy tails" };

  // ---------- UI ----------
  function cols() { return SITE.numCols(); }
  function buildList() { var L = $("ds-flist"), cs = cols(); L.textContent = "";
    if (!sel) { sel = {}; var has = cs.some(function (c) { return PREF.indexOf(c.name) >= 0; }); cs.forEach(function (c, i) { if (has ? PREF.indexOf(c.name) >= 0 : i < 4) sel[c.name] = 1; }); }
    cs.forEach(function (c) { var lab = el("label", { class: "chk" }), cb = el("input", { type: "checkbox", value: c.name }); cb.checked = !!sel[c.name];
      cb.addEventListener("change", function () { if (cb.checked) sel[c.name] = 1; else delete sel[c.name]; render(); }); lab.appendChild(cb); lab.appendChild(el("span", null, c.name)); L.appendChild(lab); });
    if (!cs.length) L.appendChild(el("p", { class: "muted" }, "No numerical features in this data.")); }
  function types() { return [].slice.call(document.querySelectorAll(".dstypes input:checked")).map(function (x) { return x.value; }); }
  function render() { var cs = cols().filter(function (c) { return sel[c.name]; }), ts = types(), g = $("dsgrid"); g.textContent = "";
    $("ds-fcount").textContent = cs.length; $("dslede").textContent = "Choose the features and the chart types. Only the selected combinations are drawn, for " + SITE.dsName() + ".";
    if (!cs.length || !ts.length) { $("dsmsg").textContent = !cs.length ? "Open Features and select at least one feature." : "Select at least one chart type."; return; }
    $("dsmsg").textContent = cs.length + " feature" + (cs.length > 1 ? "s" : "") + " × " + ts.length + " chart type" + (ts.length > 1 ? "s" : "") + " = " + cs.length * ts.length + " charts";
    cs.forEach(function (c) { ts.forEach(function (t) { var card = el("figure", { class: "dscard" }), h = el("figcaption", { class: "dsch" });
      h.appendChild(el("b", null, c.name)); h.appendChild(el("span", null, TYPES[t])); card.appendChild(h);
      card.appendChild(draw(t, c));
      card.appendChild(el("p", { class: "dsst" }, "n " + c.d.n.toLocaleString("en-US") + " · mean " + fmt(c.d.mean) + " · median " + fmt(c.d.median) + " · skew " + fmt(c.d.skew) + " · kurt " + fmt(c.d.kurt)));
      card.appendChild(el("p", { class: "dskey" }, KEYS[t])); g.appendChild(card); }); }); }
  function togglePanel(open) { var p = $("ds-fpanel"); p.hidden = !open; $("ds-fbtn").setAttribute("aria-expanded", open ? "true" : "false"); if (open) $("ds-fsearch").focus(); }
  $("ds-fbtn").addEventListener("click", function () { togglePanel($("ds-fpanel").hidden); });
  $("ds-fdone").addEventListener("click", function () { togglePanel(false); $("ds-fbtn").focus(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("ds-fpanel").hidden) { togglePanel(false); $("ds-fbtn").focus(); } });
  document.addEventListener("click", function (e) { if (!$("ds-fpanel").hidden && !e.target.closest(".dsdd")) togglePanel(false); });
  $("ds-fsearch").addEventListener("input", function () { var v = this.value.toLowerCase(); $("ds-flist").querySelectorAll("label").forEach(function (l) { l.hidden = v && l.textContent.toLowerCase().indexOf(v) < 0; }); });
  $("ds-fall").addEventListener("click", function () { $("ds-flist").querySelectorAll("label:not([hidden]) input").forEach(function (c) { c.checked = true; sel[c.value] = 1; }); render(); });
  $("ds-fnone").addEventListener("click", function () { sel = {}; $("ds-flist").querySelectorAll("input").forEach(function (c) { c.checked = false; }); render(); });
  document.querySelectorAll(".dstypes input").forEach(function (x) { x.addEventListener("change", render); });
  SITE.onData(function () { sel = null; buildList(); render(); });
  buildList(); render();
  window.HRDist = { select: function (features, chartTypes) { sel = {}; (features || []).forEach(function (f) { sel[f] = 1; }); document.querySelectorAll(".dstypes input").forEach(function (x) { x.checked = (chartTypes || ["hist"]).indexOf(x.value) >= 0; }); buildList(); render(); } };
})();
