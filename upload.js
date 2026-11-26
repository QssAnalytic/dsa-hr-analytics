(function () {
  "use strict";
  var S = window.HRStats;
  var INK = "#2E2E38", Y = "#FFE600", G = "#747480", LG = "#C4C4CD", RED = "#EA011B", BLUE = "#188CE5";
  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (text != null) e.textContent = text; return e; }
  function sv(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function fmt(v, d) { if (v == null || isNaN(v)) return "–"; var dd = d == null ? 2 : d; if (Math.abs(v) < 0.5 * Math.pow(10, -dd)) v = 0; if (Math.abs(v) < 1e-9) return "0"; if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(v).toLocaleString("en-US"); return v.toLocaleString("en-US", { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }); }
  function fp(p) { return p < 0.001 ? "p < 0.001" : "p = " + p.toFixed(3); }
  var MISSING = { "": 1, "na": 1, "n/a": 1, "nan": 1, "null": 1, "none": 1, "-": 1, "?": 1 };
  function isMissing(v) { return v == null || (typeof v === "string" && MISSING[v.trim().toLowerCase()] === 1) || (typeof v === "number" && isNaN(v)); }
  function toNum(v) { if (typeof v === "number") return v; var t = String(v).trim().replace(/,/g, ""); if (t === "") return NaN; var n = Number(t); return isFinite(n) ? n : NaN; }

  // ---------- parse ----------
  function parseTable(rows) {
    rows = rows.filter(function (r) { return r && r.some(function (c) { return !isMissing(c); }); });
    if (rows.length < 2) throw new Error("The file needs a header row and at least one data row.");
    var head = rows[0].map(function (h, i) { h = String(h == null ? "" : h).trim(); return h || "Column " + (i + 1); });
    var body = rows.slice(1, 200001), cols = [];
    head.forEach(function (h, j) {
      var vals = body.map(function (r) { return r[j]; }), miss = 0, nums = [], numOk = 0, nonMiss = 0;
      vals.forEach(function (v) { if (isMissing(v)) { miss++; return; } nonMiss++; var n = toNum(v); if (!isNaN(n)) { numOk++; nums.push(n); } });
      var numeric = nonMiss > 0 && numOk / nonMiss >= 0.95;
      cols.push({ name: h, raw: vals, missing: miss, numeric: numeric, nums: numeric ? nums : null });
    });
    return { head: head, rows: body, cols: cols, n: body.length };
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var first = text.slice(0, text.indexOf("\n") > 0 ? text.indexOf("\n") : text.length), delim = ",";
    [";", "\t", "|"].forEach(function (d) { if (first.split(d).length > first.split(delim).length) delim = d; });
    var rows = [], row = [], cur = "", q = false;
    for (var i = 0; i < text.length; i++) { var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch; }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function inflate(bytes) { var ds = new DecompressionStream("deflate-raw"); return new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer(); }
  function unzip(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), eocd = -1;
    for (var i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a valid .xlsx file");
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), files = {}, dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el2 = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      var ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      files[name] = { method: method, data: u8.slice(ds, ds + csize) };
      p += 46 + nl + el2 + cl;
    }
    return files;
  }
  function entryText(f) { if (!f) return Promise.resolve(null); var dec = new TextDecoder();
    return (f.method === 0 ? Promise.resolve(f.data.buffer) : inflate(f.data)).then(function (b) { return dec.decode(b); }); }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref || ""), c = 0; if (!m) return -1; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64; return c - 1; }
  function readXlsx(buf) {
    var files = unzip(buf), sheets = Object.keys(files).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); }).sort(function (a, b) { return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); });
    if (!sheets.length) throw new Error("no worksheet found");
    return Promise.all([entryText(files["xl/sharedStrings.xml"]), entryText(files[sheets[0]])]).then(function (t) {
      var P = new DOMParser(), shared = [];
      if (t[0]) { var sd = P.parseFromString(t[0], "application/xml"), si = sd.getElementsByTagName("si");
        for (var i = 0; i < si.length; i++) { var ts = si[i].getElementsByTagName("t"), s = ""; for (var j = 0; j < ts.length; j++) s += ts[j].textContent; shared.push(s); } }
      var doc = P.parseFromString(t[1], "application/xml"), rws = doc.getElementsByTagName("row"), out = [];
      for (var r = 0; r < rws.length; r++) { var cells = rws[r].getElementsByTagName("c"), row = [];
        for (var c = 0; c < cells.length; c++) { var cel = cells[c], ty = cel.getAttribute("t"), ix = colIdx(cel.getAttribute("r")), v = cel.getElementsByTagName("v")[0], val = "";
          if (ty === "s") val = v ? shared[+v.textContent] : ""; else if (ty === "inlineStr") { var it = cel.getElementsByTagName("t"); val = it.length ? it[0].textContent : ""; }
          else if (ty === "str" || ty === "e") val = v ? v.textContent : ""; else if (ty === "b") val = v ? (v.textContent === "1" ? "TRUE" : "FALSE") : ""; else val = v ? Number(v.textContent) : "";
          if (ix < 0) ix = row.length; while (row.length < ix) row.push(""); row[ix] = val; }
        out.push(row); }
      return out;
    });
  }
  function readFile(file) {
    if (/\.xls$/i.test(file.name)) return Promise.reject(new Error("old .xls format; save it as .xlsx or .csv"));
    if (/\.xlsx$/i.test(file.name)) return file.arrayBuffer().then(readXlsx);
    return file.text().then(parseCSV);
  }

  // ---------- charts ----------
  function hist(c, d, w, h) {
    var s = sv("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", role: "img", "aria-label": "Histogram of " + c.name });
    var pad = { l: 34, r: 8, t: 8, b: 22 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
    var bins = d.nuniq <= 12 ? d.nuniq : 24, lo = d.min, hi = d.max, span = hi - lo || 1, counts = [], i;
    if (d.nuniq <= 12) { var u = Object.keys(c.nums.reduce(function (o, v) { o[v] = 1; return o; }, {})).map(Number).sort(function (a, b) { return a - b; });
      counts = u.map(function (v) { return c.nums.filter(function (x) { return x === v; }).length; });
      var mx = Math.max.apply(null, counts), bw = iw / u.length;
      u.forEach(function (v, k) { var bh = counts[k] / mx * ih; s.appendChild(sv("rect", { x: pad.l + k * bw + 1, y: pad.t + ih - bh, width: bw - 2, height: bh, fill: INK })); s.appendChild(sv("text", { x: pad.l + k * bw + bw / 2, y: h - 6, "text-anchor": "middle", "font-size": 10, fill: G }, fmt(v, 0))); });
      var X1 = function (v) { var k = u.indexOf(v); return k < 0 ? pad.l + (v - u[0]) / ((u[u.length - 1] - u[0]) || 1) * (iw - bw) + bw / 2 : pad.l + k * bw + bw / 2; };
      [[d.mean, Y, 0], [d.median, BLUE, 1]].forEach(function (m) { var x = pad.l + (m[0] - u[0]) / ((u[u.length - 1] - u[0]) || 1) * (iw - bw) + bw / 2; s.appendChild(sv("line", { x1: x, x2: x, y1: pad.t, y2: pad.t + ih, stroke: m[1], "stroke-width": m[2] ? 2 : 3, "stroke-dasharray": m[2] ? "5 4" : "" })); });
      return s;
    }
    for (i = 0; i < bins; i++) counts.push(0);
    c.nums.forEach(function (v) { var k = Math.min(bins - 1, Math.floor((v - lo) / span * bins)); counts[k]++; });
    var mx2 = Math.max.apply(null, counts), bw2 = iw / bins;
    counts.forEach(function (cn, k) { var bh = cn / mx2 * ih; s.appendChild(sv("rect", { x: pad.l + k * bw2 + 0.5, y: pad.t + ih - bh, width: Math.max(bw2 - 1, 1), height: bh, fill: INK })); });
    var X = function (v) { return pad.l + (v - lo) / span * iw; };
    s.appendChild(sv("line", { x1: X(d.mean), x2: X(d.mean), y1: pad.t, y2: pad.t + ih, stroke: Y, "stroke-width": 3 }));
    s.appendChild(sv("line", { x1: X(d.median), x2: X(d.median), y1: pad.t, y2: pad.t + ih, stroke: BLUE, "stroke-width": 2, "stroke-dasharray": "5 4" }));
    s.appendChild(sv("text", { x: pad.l, y: h - 6, "font-size": 10, fill: G }, fmt(lo, 0)));
    s.appendChild(sv("text", { x: w - pad.r, y: h - 6, "font-size": 10, fill: G, "text-anchor": "end" }, fmt(hi, 0)));
    return s;
  }
  function box(c, d, w, h) {
    var s = sv("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", role: "img", "aria-label": "Boxplot of " + c.name });
    var pad = 10, lo = d.min, hi = d.max, span = hi - lo || 1, X = function (v) { return pad + (v - lo) / span * (w - 2 * pad); }, cy = h / 2 - 6;
    var wl = d.sorted.find(function (v) { return v >= d.lo; }), wh = d.sorted.slice().reverse().find(function (v) { return v <= d.hi; });
    s.appendChild(sv("line", { x1: X(wl), x2: X(wh), y1: cy, y2: cy, stroke: INK, "stroke-width": 1.5 }));
    [wl, wh].forEach(function (v) { s.appendChild(sv("line", { x1: X(v), x2: X(v), y1: cy - 10, y2: cy + 10, stroke: INK, "stroke-width": 1.5 })); });
    s.appendChild(sv("rect", { x: X(d.q1), y: cy - 16, width: Math.max(X(d.q3) - X(d.q1), 2), height: 32, fill: Y, stroke: INK, "stroke-width": 1.5 }));
    s.appendChild(sv("line", { x1: X(d.median), x2: X(d.median), y1: cy - 16, y2: cy + 16, stroke: INK, "stroke-width": 3 }));
    var seen = {}, path = "";
    d.sorted.forEach(function (v) { if (v < d.lo || v > d.hi) { var px = Math.round(X(v)); if (!seen[px]) { seen[px] = 1; path += "M" + (px - 3) + " " + cy + "a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"; } } });
    if (path) s.appendChild(sv("path", { d: path, fill: RED, opacity: 0.6 }));
    s.appendChild(sv("text", { x: pad, y: h - 4, "font-size": 10, fill: G }, fmt(lo, 0)));
    s.appendChild(sv("text", { x: w - pad, y: h - 4, "font-size": 10, fill: G, "text-anchor": "end" }, fmt(hi, 0)));
    return s;
  }
  function normChart(c, d, w, h) {
    var s = sv("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", role: "img", "aria-label": "Histogram of " + c.name + " with normal curve" });
    var pad = { l: 10, r: 10, t: 10, b: 24 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, bins = 30, lo = d.min, hi = d.max, span = hi - lo || 1, cnt = [], i;
    for (i = 0; i < bins; i++) cnt.push(0);
    c.nums.forEach(function (v) { cnt[Math.min(bins - 1, Math.floor((v - lo) / span * bins))]++; });
    var dens = cnt.map(function (k) { return k / (c.nums.length * span / bins); });
    var xs = []; for (i = 0; i <= 120; i++) xs.push(lo + span * i / 120);
    var nc = xs.map(function (x) { return Math.exp(-0.5 * Math.pow((x - d.mean) / d.std, 2)) / (d.std * Math.sqrt(2 * Math.PI)); });
    var kd = S.kde(c.nums.length > 4000 ? c.nums.filter(function (_, k) { return k % Math.ceil(c.nums.length / 4000) === 0; }) : c.nums, d.std, xs);
    var mx = Math.max(Math.max.apply(null, dens), Math.max.apply(null, nc), Math.max.apply(null, kd));
    var X = function (v) { return pad.l + (v - lo) / span * iw; }, Yv = function (v) { return pad.t + ih - v / mx * ih; }, bw = iw / bins;
    dens.forEach(function (v, k) { s.appendChild(sv("rect", { x: pad.l + k * bw + 0.5, y: Yv(v), width: bw - 1, height: pad.t + ih - Yv(v), fill: LG })); });
    function line(arr, col, wd) { s.appendChild(sv("polyline", { points: xs.map(function (x, k) { return X(x).toFixed(1) + "," + Yv(arr[k]).toFixed(1); }).join(" "), fill: "none", stroke: col, "stroke-width": wd })); }
    line(nc, Y, 3.5); line(kd, INK, 2);
    s.appendChild(sv("text", { x: pad.l, y: h - 6, "font-size": 11, fill: G }, fmt(lo, 0)));
    s.appendChild(sv("text", { x: w - pad.r, y: h - 6, "font-size": 11, fill: G, "text-anchor": "end" }, fmt(hi, 0)));
    return s;
  }
  function qq(c, d, w, h) {
    var s = sv("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", role: "img", "aria-label": "Q-Q plot of " + c.name });
    var pad = 14, n = d.sorted.length, step = Math.max(1, Math.floor(n / 400)), th = [], ob = [];
    for (var i = 0; i < n; i += step) { th.push(S.nppf((i + 1 - 0.375) / (n + 0.25))); ob.push(d.sorted[i]); }
    var tmin = th[0], tmax = th[th.length - 1], omin = d.min, omax = d.max;
    var X = function (v) { return pad + (v - tmin) / (tmax - tmin) * (w - 2 * pad); }, Yv = function (v) { return h - pad - (v - omin) / ((omax - omin) || 1) * (h - 2 * pad); };
    s.appendChild(sv("line", { x1: X(tmin), y1: Yv(d.mean + tmin * d.std), x2: X(tmax), y2: Yv(d.mean + tmax * d.std), stroke: Y, "stroke-width": 3 }));
    var p = ""; th.forEach(function (t, k) { p += "M" + (X(t) - 2).toFixed(1) + " " + Yv(ob[k]).toFixed(1) + "a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"; });
    s.appendChild(sv("path", { d: p, fill: INK }));
    return s;
  }
  function zChart(z, w, h) {
    var s = sv("svg", { viewBox: "0 0 " + w + " " + h, width: "100%", role: "img", "aria-label": "Distribution of z-scores" });
    var pad = { l: 10, r: 10, t: 10, b: 24 }, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b, lo = Math.min(-3.5, Math.min.apply(null, z)), hi = Math.max(3.5, Math.max.apply(null, z)), bins = 50, cnt = [], i;
    for (i = 0; i < bins; i++) cnt.push(0);
    z.forEach(function (v) { cnt[Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins))]++; });
    var mx = Math.max.apply(null, cnt), X = function (v) { return pad.l + (v - lo) / (hi - lo) * iw; }, bw = iw / bins;
    cnt.forEach(function (k, j) { var bh = k / mx * ih; s.appendChild(sv("rect", { x: pad.l + j * bw + 0.5, y: pad.t + ih - bh, width: bw - 1, height: bh, fill: INK })); });
    [[2, BLUE], [-2, BLUE], [3, RED], [-3, RED]].forEach(function (m) { s.appendChild(sv("line", { x1: X(m[0]), x2: X(m[0]), y1: pad.t, y2: pad.t + ih, stroke: m[1], "stroke-width": 2, "stroke-dasharray": "6 4" })); s.appendChild(sv("text", { x: X(m[0]), y: h - 6, "font-size": 12, fill: m[1], "text-anchor": "middle", "font-weight": 700 }, (m[0] > 0 ? "+" : "") + m[0])); });
    return s;
  }

  // ---------- report ----------
  var state = null;
  function card(title, sub) { var d = el("div", { class: "ucard" }); d.appendChild(el("p", { class: "ucard-t" }, title)); if (sub) d.appendChild(el("p", { class: "ucard-s" }, sub)); return d; }
  function block(id, num, kick, title) {
    var sec = el("div", { class: "ublock", id: id }), sh = el("div", { class: "sh" });
    sh.appendChild(el("p", { class: "snum" }, num)); var t = el("div"); t.appendChild(el("p", { class: "kick" }, kick)); t.appendChild(el("h2", null, title)); sh.appendChild(t); sec.appendChild(sh); return sec;
  }
  function render(T, name) {
    var out = $("upreport"); out.textContent = ""; out.hidden = false;
    var num = T.cols.filter(function (c) { return c.numeric && c.nums.length > 2; });
    num.forEach(function (c) { c.d = S.describe(c.nums); });
    var varying = num.filter(function (c) { return c.d.std > 0; });
    var totalMiss = T.cols.reduce(function (s, c) { return s + c.missing; }, 0);
    state = { T: T, num: num, varying: varying };
    // header
    var hd = el("div", { class: "uhead" });
    hd.appendChild(el("p", { class: "kick" }, "REPORT FOR YOUR FILE"));
    hd.appendChild(el("h2", null, name));
    var k = el("div", { class: "ukpis" });
    [[T.n.toLocaleString("en-US"), "rows"], [T.cols.length, "columns"], [num.length, "numerical"], [totalMiss.toLocaleString("en-US"), "missing values"]].forEach(function (p) { var d = el("div"); d.appendChild(el("b", null, String(p[0]))); d.appendChild(el("span", null, p[1])); k.appendChild(d); });
    hd.appendChild(k); out.appendChild(hd);
    if (!varying.length) { out.appendChild(el("p", { class: "p" }, "No numerical columns with varying values were found, so only the missing-value check is shown.")); }
    // insights
    var ins = [];
    ins.push(totalMiss === 0 ? ["No missing values", "All " + T.n.toLocaleString("en-US") + " rows are complete across " + T.cols.length + " columns."] : ["Missing values found", totalMiss.toLocaleString("en-US") + " missing cells; most in " + T.cols.slice().sort(function (a, b) { return b.missing - a.missing; })[0].name + "."]);
    if (varying.length) {
      var sk = varying.slice().sort(function (a, b) { return Math.abs(b.d.skew) - Math.abs(a.d.skew); })[0];
      ins.push(["Most skewed: " + sk.name, "Skewness " + fmt(sk.d.skew) + ", kurtosis " + fmt(sk.d.kurt) + ". Mean " + fmt(sk.d.mean) + " vs median " + fmt(sk.d.median) + "."]);
      var oi = varying.reduce(function (s, c) { return s + c.d.outIqr; }, 0), oz = varying.reduce(function (s, c) { return s + c.d.outZ; }, 0);
      ins.push(["Outliers: IQR vs z-score", "IQR rule flags " + oi.toLocaleString("en-US") + " values; |z| > 3 flags " + oz.toLocaleString("en-US") + " across " + varying.length + " variables."]);
      var nonNorm = varying.filter(function (c) { return Math.abs(c.d.skew) > 1 || Math.abs(c.d.kurt) > 1; }).length;
      ins.push([nonNorm + " of " + varying.length + " clearly non-normal", "Variables with |skewness| or |kurtosis| above 1."]);
    }
    var b0 = block("u-ins", "01", "KEY INSIGHTS", "What your data says"); var ig = el("div", { class: "uins" });
    ins.forEach(function (x, i) { var d = el("div", { class: "uin" }); d.appendChild(el("p", { class: "inn" }, "0" + (i + 1))); d.appendChild(el("h3", null, x[0])); d.appendChild(el("p", null, x[1])); ig.appendChild(d); });
    b0.appendChild(ig); out.appendChild(b0);
    // missing
    var b1 = block("u-miss", "02", "DATA QUALITY", "Missing values for all features"), mg = el("div", { class: "miss" });
    T.cols.forEach(function (c) { var d = el("div", { class: "mc" + (c.missing ? " bad" : "") }); d.appendChild(el("b", null, c.name)); d.appendChild(el("span", null, c.missing.toLocaleString("en-US") + " missing" + (c.missing ? " (" + (c.missing / T.n * 100).toFixed(1) + "%)" : ""))); mg.appendChild(d); });
    b1.appendChild(mg); out.appendChild(b1);
    if (!varying.length) return;
    // describe
    var b2 = block("u-desc", "03", "DESCRIBE", "Descriptive statistics for all numerical variables"), tw = el("div", { class: "tw" }), tb = el("table", { class: "st" }), tr = el("tr");
    ["Variable", "Min", "Max", "Mean", "Median", "Mode", "Q1", "Q3", "P90", "P99", "Std", "Skew", "Kurt", "IQR out.", "|z|>3"].forEach(function (h) { tr.appendChild(el("th", null, h)); });
    tb.appendChild(tr);
    num.forEach(function (c) { var d = c.d, r = el("tr"); r.appendChild(el("td", { class: "v" }, c.name));
      [d.min, d.max, d.mean, d.median, d.mode, d.q1, d.q3, d.p90, d.p99, d.std].forEach(function (v) { r.appendChild(el("td", null, fmt(v))); });
      r.appendChild(el("td", { class: Math.abs(d.skew) > 1 ? "hi" : "" }, fmt(d.skew))); r.appendChild(el("td", { class: Math.abs(d.kurt) > 1 ? "hi" : "" }, fmt(d.kurt)));
      r.appendChild(el("td", null, String(d.outIqr))); r.appendChild(el("td", null, String(d.outZ))); tb.appendChild(r); });
    tw.appendChild(tb); b2.appendChild(tw); out.appendChild(b2);
    // histograms
    var b3 = block("u-hist", "04", "DISTRIBUTIONS", "Histogram for each numerical variable"), hg = el("div", { class: "ugrid" });
    b3.appendChild(el("p", { class: "p" }, "Yellow line = mean, blue dashed = median."));
    varying.forEach(function (c) { var cd = card(c.name, "skew " + fmt(c.d.skew) + " · kurtosis " + fmt(c.d.kurt)); cd.appendChild(hist(c, c.d, 300, 170)); hg.appendChild(cd); });
    b3.appendChild(hg); out.appendChild(b3);
    // boxplots
    var b4 = block("u-box", "05", "OUTLIERS", "Boxplot for each feature"), bg = el("div", { class: "ugrid" });
    b4.appendChild(el("p", { class: "p" }, "Red points lie beyond 1.5 × IQR from the box."));
    varying.forEach(function (c) { var cd = card(c.name, c.d.outIqr + " IQR outliers · " + c.d.outZ + " with |z| > 3"); if (c.d.outIqr) cd.querySelector(".ucard-s").className = "ucard-s red"; cd.appendChild(box(c, c.d, 300, 80)); bg.appendChild(cd); });
    b4.appendChild(bg); out.appendChild(b4);
    // z-score
    var b5 = block("u-z", "06", "Z-SCORE", "Z-score and outliers for a chosen variable"), zc = el("div", { class: "ucontrols" });
    zc.appendChild(el("label", { for: "uzsel" }, "Variable"));
    var zs = el("select", { id: "uzsel" }); varying.forEach(function (c) { zs.appendChild(el("option", { value: c.name }, c.name)); });
    var pref = ["MonthlyIncome", "Income", "Salary"]; var def = varying.find(function (c) { return pref.indexOf(c.name) >= 0; }) || varying[0]; zs.value = def.name;
    zc.appendChild(zs); b5.appendChild(zc); var zout = el("div"); b5.appendChild(zout); out.appendChild(b5);
    function drawZ() { var c = varying.find(function (x) { return x.name === zs.value; }), d = c.d; zout.textContent = "";
      var idx = []; c.raw.forEach(function (v, i) { if (!isMissing(v) && !isNaN(toNum(v))) idx.push(i); });
      var z = c.nums.map(function (v) { return (v - d.mean) / d.std; });
      var big = el("div", { class: "ubig" }), z3 = z.filter(function (v) { return Math.abs(v) > 3; }).length, z2 = z.filter(function (v) { return Math.abs(v) > 2; }).length, zmax = Math.max.apply(null, z.map(Math.abs));
      [[z3, "values with |z| > 3"], [z2, "values with |z| > 2"], [fmt(zmax), "largest |z|"], [d.outIqr, "IQR outliers, for comparison"]].forEach(function (p) { var x = el("div"); x.appendChild(el("b", null, String(p[0]))); x.appendChild(el("span", null, p[1])); big.appendChild(x); });
      zout.appendChild(big);
      zout.appendChild(el("p", { class: "p" }, "z = (x − mean) / std, mean " + fmt(d.mean) + ", std " + fmt(d.std) + ". " + (z3 === 0 && d.outIqr > 0 ? "No value passes |z| > 3, but the IQR rule flags " + d.outIqr + ": with skewed data the IQR rule is the better check." : "")));
      var two = el("div", { class: "two" }), f = el("figure"); f.appendChild(zChart(z, 640, 260)); two.appendChild(f);
      var order = z.map(function (v, i) { return i; }).sort(function (a, b) { return Math.abs(z[b]) - Math.abs(z[a]); }).slice(0, 10);
      var t = el("table", { class: "zt" }), h = el("tr"); ["Row", c.name, "z", "Outlier?"].forEach(function (x) { h.appendChild(el("th", null, x)); }); t.appendChild(h);
      order.forEach(function (i) { var r = el("tr"); r.appendChild(el("td", null, String(idx[i] + 2))); r.appendChild(el("td", null, fmt(c.nums[i]))); r.appendChild(el("td", null, fmt(z[i]))); r.appendChild(el("td", { class: Math.abs(z[i]) > 3 ? "red" : "" }, Math.abs(z[i]) > 3 ? "Yes, |z| > 3" : "No")); t.appendChild(r); });
      var tdv = el("div"); tdv.appendChild(el("p", { class: "kick" }, "TOP 10 BY |Z| · ROW = LINE IN FILE")); tdv.appendChild(t); two.appendChild(tdv); zout.appendChild(two); }
    zs.addEventListener("change", drawZ); drawZ();
    // normality
    var b6 = block("u-norm", "07", "NORMALITY", "Shapiro–Wilk test, histogram with normal curve, Q–Q plot");
    b6.appendChild(el("p", { class: "p" }, "H₀: the data are normal. p < 0.05 → not normal. Pick up to three variables."));
    var nc = el("div", { class: "ucontrols" }), want = ["MonthlyIncome", "Age", "TotalWorkingYears"], picks = [];
    for (var j = 0; j < 3; j++) { var sel = el("select", { "aria-label": "Normality variable " + (j + 1) }); sel.appendChild(el("option", { value: "" }, "—")); varying.forEach(function (c) { sel.appendChild(el("option", { value: c.name }, c.name)); });
      var w = varying.find(function (c) { return c.name === want[j]; }); sel.value = w ? w.name : (varying[j] ? varying[j].name : ""); nc.appendChild(sel); picks.push(sel); }
    b6.appendChild(nc); var nout = el("div", { class: "unorm" }); b6.appendChild(nout); out.appendChild(b6);
    function drawN() { nout.textContent = "";
      picks.forEach(function (sel) { if (!sel.value) return; var c = varying.find(function (x) { return x.name === sel.value; }), d = c.d, t = S.shapiro(c.nums), normal = t && t.p >= 0.05;
        var box2 = el("div", { class: "nbox" }), hd2 = el("div", { class: "nc" + (normal ? " ok" : "") });
        hd2.appendChild(el("p", { class: "nk" }, c.name)); hd2.appendChild(el("p", { class: "nv" }, t ? "W = " + t.W.toFixed(3) : "n < 3")); hd2.appendChild(el("p", { class: "np" }, t ? fp(t.p) + (c.nums.length > 5000 ? " · 5,000-value sample" : "") : ""));
        var nr = el("div", { class: "nr" }); var a1 = el("span", null, "Skewness "); a1.appendChild(el("b", null, fmt(d.skew))); var a2 = el("span", null, "Kurtosis "); a2.appendChild(el("b", null, fmt(d.kurt))); nr.appendChild(a1); nr.appendChild(a2); hd2.appendChild(nr);
        hd2.appendChild(el("p", { class: "nb" }, normal ? "✓ Normal (p ≥ 0.05)" : "✕ Not normal"));
        box2.appendChild(hd2);
        var f1 = el("figure"); f1.appendChild(normChart(c, d, 420, 220)); var lg = el("p", { class: "lg" }, "■ data  ━ normal curve (yellow)  ━ actual shape (dark)"); f1.appendChild(lg); box2.appendChild(f1);
        var f2 = el("figure"); f2.appendChild(el("p", { class: "lg" }, "Q–Q plot: points on the yellow line = normal")); f2.appendChild(qq(c, d, 420, 220)); box2.appendChild(f2);
        nout.appendChild(box2); }); }
    picks.forEach(function (sel) { sel.addEventListener("change", drawN); }); drawN();
  }

  window.HRUpload = { parseTable: parseTable, readFile: readFile, render: render, isMissing: isMissing, toNum: toNum, fmt: fmt };
})();
