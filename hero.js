(function () {
  "use strict";
  var S = window.HRStats, U = window.HRUpload, PZ = window.HRPdfZip;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (text != null) e.textContent = text; return e; }
  var fmt = U.fmt;
  var METRICS = [
    ["count", "Count"], ["missing", "Missing"], ["min", "Min"], ["max", "Max"], ["mean", "Mean"], ["median", "Median"], ["mode", "Mode"],
    ["std", "Std deviation"], ["var", "Variance"], ["q1", "Q1 (25%)"], ["q3", "Q3 (75%)"], ["iqr", "IQR"], ["range", "Range"], ["skew", "Skewness"], ["kurt", "Kurtosis"]];
  var DEFAULT_M = { min: 1, max: 1, mean: 1, median: 1, std: 1 };
  var dataCbs = [];
  var ds = null, last = null, dl = null, sortState = null, dqMode = "miss", descMode = "num", catType = "bar", cur = null, mcpP = null, catCur = null;
  if (window.claude && window.claude.use) window.claude.use("downloads").then(function (d) { dl = d; }).catch(function () {});

  // ---------- dataset ----------
  function setData(rows, name, isSample) {
    var T = U.parseTable(rows);
    T.name = name; T.sample = !!isSample;
    T.num = T.cols.filter(function (c) { return c.numeric && c.nums.length > 2; });
    T.num.forEach(function (c) { c.d = S.describe(c.nums); });
    ds = T; last = null; cur = null; catCur = null; if ($("b-open")) resetDrive(); T.extra = []; T.colIdx = {}; T.head.forEach(function (h, i) { T.colIdx[h] = i; }); sortState = null;
    var miss = T.cols.reduce(function (s, c) { return s + c.missing; }, 0);
    $("kp-rows").textContent = T.n.toLocaleString("en-US"); $("kp-cols").textContent = T.cols.length;
    $("kp-num").textContent = T.num.length; $("kp-miss").textContent = miss.toLocaleString("en-US");
    $("dsname").textContent = name;
    renderDQ();
    dataCbs.forEach(function (f) { try { f(); } catch (x) {} });
    buildCat(); $("catout").hidden = true;
    buildPicker(); $("descout").hidden = true; $("colabpanel").hidden = true; $("exportrow").hidden = true;
  }
  function loadSample() { var D = JSON.parse($("hrdata").textContent); setData([D.cols].concat(D.rows), "HR_Analytics_data.csv (sample)", true); }

  // ---------- picker ----------
  function buildPicker() {
    var fl = $("featlist"); fl.textContent = "";
    var pref = ["MonthlyIncome", "Age", "TotalWorkingYears", "YearsAtCompany", "DistanceFromHome"];
    var hasPref = ds.num.some(function (c) { return pref.indexOf(c.name) >= 0; });
    ds.num.forEach(function (c, i) { var id = "f_" + i, lab = el("label", { class: "chk" }), cb = el("input", { type: "checkbox", id: id, value: c.name });
      cb.checked = hasPref ? pref.indexOf(c.name) >= 0 : i < 5; lab.appendChild(cb); lab.appendChild(el("span", null, c.name)); fl.appendChild(lab); });
    if (!ds.num.length) fl.appendChild(el("p", { class: "muted" }, "No numerical columns found in this file."));
    var ml = $("metlist"); if (!ml.childElementCount) METRICS.forEach(function (m) { var lab = el("label", { class: "chk" }), cb = el("input", { type: "checkbox", value: m[0] }); cb.checked = !!DEFAULT_M[m[0]]; lab.appendChild(cb); lab.appendChild(el("span", null, m[1])); ml.appendChild(lab); });
    $("featsearch").value = ""; countSel();
  }
  function countSel() { var f = sel("featlist").length, m = sel("metlist").length + pcts().length; $("selcount").textContent = f + " features × " + m + " metrics selected"; }
  function sel(id) { return Array.prototype.slice.call($(id).querySelectorAll("input:checked")).map(function (x) { return x.value; }); }
  function pcts() { return $("pctin").value.split(/[ ,;]+/).map(Number).filter(function (p) { return isFinite(p) && p > 0 && p < 100; }).filter(function (p, i, a) { return a.indexOf(p) === i; }); }

  // ---------- compute ----------
  function value(c, k) { var d = c.d;
    switch (k) { case "count": return d.n; case "missing": return c.missing; case "var": return d.std * d.std; case "range": return d.max - d.min; default: return d[k]; } }
  function compute() {
    var fs = sel("featlist"), ms = sel("metlist"), ps = pcts();
    var cols = ms.map(function (k) { return { key: k, label: METRICS.filter(function (m) { return m[0] === k; })[0][1] }; });
    ps.forEach(function (p) { cols.push({ key: "p" + p, label: "P" + p, p: p }); });
    var feats = ds.num.filter(function (c) { return fs.indexOf(c.name) >= 0; });
    var rows = feats.map(function (c) { return { name: c.name, vals: cols.map(function (m) { return m.p != null ? S.quantile(c.d.sorted, m.p / 100) : value(c, m.key); }) }; });
    return { cols: cols, feats: feats, rows: rows, insights: insights(feats) };
  }
  function insights(feats) {
    var out = [];
    if (!feats.length) return out;
    var sk = feats.slice().sort(function (a, b) { return Math.abs(b.d.skew) - Math.abs(a.d.skew); })[0];
    var dir = sk.d.skew > 0.5 ? "right-skewed (long tail of high values)" : sk.d.skew < -0.5 ? "left-skewed (long tail of low values)" : "close to symmetric";
    out.push(["Shape", sk.name + " is the most asymmetric: skewness " + fmt(sk.d.skew) + ", so it is " + dir + ". Its mean (" + fmt(sk.d.mean) + ") is " + (sk.d.mean > sk.d.median ? "above" : sk.d.mean < sk.d.median ? "below" : "equal to") + " the median (" + fmt(sk.d.median) + ")."]);
    var withMean = feats.filter(function (c) { return Math.abs(c.d.mean) > 1e-9; });
    if (withMean.length) { var cv = withMean.slice().sort(function (a, b) { return Math.abs(b.d.std / b.d.mean) - Math.abs(a.d.std / a.d.mean); });
      out.push(["Spread", cv[0].name + " varies most relative to its average: std is " + Math.round(Math.abs(cv[0].d.std / cv[0].d.mean) * 100) + "% of the mean. " + (cv.length > 1 ? cv[cv.length - 1].name + " is the most stable (" + Math.round(Math.abs(cv[cv.length - 1].d.std / cv[cv.length - 1].d.mean) * 100) + "%)." : "")]); }
    var tail = feats.filter(function (c) { return c.d.p99 > 0 && c.d.max > c.d.p99 * 1.5; });
    out.push(["Extremes", tail.length ? tail.map(function (c) { return c.name; }).slice(0, 3).join(", ") + (tail.length > 3 ? " and " + (tail.length - 3) + " more" : "") + ": the maximum is far above the 99th percentile, worth checking for outliers." : "No selected feature has a maximum far above its 99th percentile: no extreme tails."]);
    var miss = feats.filter(function (c) { return c.missing > 0; });
    out.push(["Completeness", miss.length ? miss.length + " of " + feats.length + " selected features have missing values; " + miss[0].name + " has " + miss[0].missing.toLocaleString("en-US") + "." : "All " + feats.length + " selected features are complete: no missing values."]);
    return out;
  }


  // ---------- categorical ----------
  var PAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"], OTHER = "#8A8A98";
  function catCols() { return ds.cols.map(function (c, i) { var vals = c.raw, cnt = {}, miss = 0, keys = [];
      vals.forEach(function (v) { if (v == null || String(v).trim() === "") { miss++; return; } var k = String(v).trim(); if (!(k in cnt)) { cnt[k] = 0; keys.push(k); } cnt[k]++; });
      return { name: c.name, coded: c.numeric, cnt: cnt, keys: keys, miss: miss }; })
    .filter(function (c) { return c.keys.length > 1 && (!c.coded ? c.keys.length <= 60 : c.keys.length <= 10); }); }
  function buildCat() { ds.cat = catCols(); var L = $("catlist"); L.textContent = "";
    var pref = ["Attrition", "Department", "Gender", "OverTime", "BusinessTravel"], hasPref = ds.cat.some(function (c) { return pref.indexOf(c.name) >= 0; });
    ds.cat.forEach(function (c, i) { var lab = el("label", { class: "chk" }), cb = el("input", { type: "checkbox", value: c.name }); cb.checked = hasPref ? pref.indexOf(c.name) >= 0 : i < 4;
      lab.appendChild(cb); lab.appendChild(el("span", null, c.name)); lab.appendChild(el("em", null, c.keys.length + (c.coded ? " · coded" : ""))); L.appendChild(lab); });
    if (!ds.cat.length) L.appendChild(el("p", { class: "muted" }, "No categorical columns found in this file."));
    catCount(); }
  function catCount() { $("catcount").textContent = sel("catlist").length + " categorical features selected"; }
  function setMode(m) { descMode = m; var cat = m === "cat";
    $("dm-num").classList.toggle("on", !cat); $("dm-cat").classList.toggle("on", cat); $("dm-num").setAttribute("aria-selected", !cat); $("dm-cat").setAttribute("aria-selected", cat);
    document.querySelectorAll("#descpanel .nm").forEach(function (e) { e.hidden = cat; }); document.querySelectorAll("#descpanel .cm").forEach(function (e) { e.hidden = !cat; });
    $("descout").hidden = cat || !last; var hasCat = !!$("catout").childElementCount; $("catout").hidden = !cat || !hasCat;
    $("colabpanel").hidden = true; resetDrive();
    if (cat) { cur = hasCat ? catCur : null; $("exportrow").hidden = !hasCat; $("exg").hidden = true; }
    else { cur = last ? { mode: "num" } : null; $("exportrow").hidden = !last; $("exg").hidden = false; } }
  function freqRows(c) { var ks = c.keys.slice(), n = 0; ks.forEach(function (k) { n += c.cnt[k]; });
    if (c.coded) ks.sort(function (a, b) { return Number(a) - Number(b); }); else ks.sort(function (a, b) { return c.cnt[b] - c.cnt[a] || a.localeCompare(b); });
    return { n: n, rows: ks.map(function (k) { return { k: k, v: c.cnt[k], p: 100 * c.cnt[k] / n }; }) }; }
  function fold(rows, max) { if (rows.length <= max) return rows; var top = rows.slice().sort(function (a, b) { return b.v - a.v; }).slice(0, max - 1), keep = {}; top.forEach(function (r) { keep[r.k] = 1; });
    var kept = rows.filter(function (r) { return keep[r.k]; }), rest = rows.filter(function (r) { return !keep[r.k]; }), o = { k: "Other (" + rest.length + ")", v: 0, p: 0, other: true };
    rest.forEach(function (r) { o.v += r.v; o.p += r.p; }); return kept.concat([o]); }
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, a) { var e = document.createElementNS(SVGNS, tag); for (var k in a) e.setAttribute(k, a[k]); return e; }
  function drawChart(F, type) { var box = el("div", { class: "cch t-" + type });
    if (type === "bar") { var rows = fold(F.rows, 12), mx = Math.max.apply(null, rows.map(function (r) { return r.v; }));
      rows.forEach(function (r) { var row = el("div", { class: "cbr", title: r.k + ": " + r.v.toLocaleString("en-US") + " (" + fmt(r.p, 1) + "%)" }); row.appendChild(el("span", { class: "cbn" }, r.k));
        var tr = el("div", { class: "cbt" }), b = el("i", r.other ? { class: "o" } : null); b.style.width = (100 * r.v / mx) + "%"; tr.appendChild(b); row.appendChild(tr);
        row.appendChild(el("span", { class: "cbv" }, r.v.toLocaleString("en-US") + " · " + r.p.toFixed(1) + "%")); box.appendChild(row); });
      return box; }
    var rows2 = fold(F.rows, 8), R = 100, r0 = type === "donut" ? 58 : 0, a = -Math.PI / 2, svg = sv("svg", { viewBox: "0 0 220 220", class: "fq-pie", role: "img", "aria-label": F.name + " " + type + " chart" });
    rows2.forEach(function (r, i) { var col = r.other ? OTHER : PAL[i % 8], ang = 2 * Math.PI * r.p / 100, b = a + ang, large = ang > Math.PI ? 1 : 0, c = 110, path;
      function P(rad, t) { return (c + rad * Math.cos(t)).toFixed(2) + " " + (c + rad * Math.sin(t)).toFixed(2); }
      if (ang >= 2 * Math.PI - 1e-6) { path = sv("circle", { cx: c, cy: c, r: r0 ? (R + r0) / 2 : R, fill: r0 ? "none" : col, stroke: r0 ? col : "none", "stroke-width": r0 ? R - r0 : 0 }); }
      else path = sv("path", { d: r0 ? "M" + P(R, a) + "A" + R + " " + R + " 0 " + large + " 1 " + P(R, b) + "L" + P(r0, b) + "A" + r0 + " " + r0 + " 0 " + large + " 0 " + P(r0, a) + "Z" : "M" + c + " " + c + "L" + P(R, a) + "A" + R + " " + R + " 0 " + large + " 1 " + P(R, b) + "Z", fill: col, stroke: "#fff", "stroke-width": 2, "stroke-linejoin": "round" });
      var t = sv("title", {}); t.textContent = r.k + ": " + r.v.toLocaleString("en-US") + " (" + fmt(r.p, 1) + "%)"; path.appendChild(t); svg.appendChild(path); r.col = col; a = b; });
    if (r0) { var t1 = sv("text", { x: 110, y: 108, "text-anchor": "middle", class: "dn1" }); t1.textContent = F.n.toLocaleString("en-US"); var t2 = sv("text", { x: 110, y: 128, "text-anchor": "middle", class: "dn2" }); t2.textContent = "total"; svg.appendChild(t1); svg.appendChild(t2); }
    box.appendChild(svg); var lg = el("ul", { class: "plg" });
    rows2.forEach(function (r) { var li = el("li"), sw = el("i"); sw.style.background = r.col; li.appendChild(sw); li.appendChild(el("span", { class: "pk" }, r.k)); li.appendChild(el("b", null, r.p.toFixed(1) + "%")); li.appendChild(el("span", { class: "pv" }, r.v.toLocaleString("en-US"))); lg.appendChild(li); });
    box.appendChild(lg); return box; }
  function showFreq() { var names = sel("catlist"); if (!names.length) { $("catmsg").textContent = "Select at least one feature."; return; } $("catmsg").textContent = "";
    var out = $("catout"); out.textContent = ""; out.hidden = false; $("descout").hidden = true; cur = catCur = { mode: "cat", names: names, type: catType }; resetDrive(); $("exportrow").hidden = false; $("exg").hidden = true; if (!$("colabpanel").hidden) showColab();
    var h = el("div", { class: "dohead cath" }), hl = el("div"); hl.appendChild(el("p", { class: "tag" }, "FREQUENCIES · " + ds.name)); hl.appendChild(el("h2", null, names.length + " categorical feature" + (names.length > 1 ? "s" : ""))); h.appendChild(hl);
    var seg = el("div", { class: "cseg", role: "group", "aria-label": "Chart type" });
    [["bar", "Bar"], ["pie", "Pie"], ["donut", "Donut"]].forEach(function (x) { var b = el("button", { type: "button", class: "cst" + (catType === x[0] ? " on" : ""), "aria-pressed": catType === x[0] ? "true" : "false" }, x[1]);
      b.addEventListener("click", function () { catType = x[0]; showFreq(); }); seg.appendChild(b); }); h.appendChild(seg); out.appendChild(h);
    names.forEach(function (nm) { var c = ds.cat.filter(function (x) { return x.name === nm; })[0], F = freqRows(c); F.name = nm;
      var card = el("section", { class: "fcard" }), hd = el("div", { class: "fch" }); hd.appendChild(el("h3", null, nm));
      hd.appendChild(el("p", null, F.rows.length + " categories · " + F.n.toLocaleString("en-US") + " values" + (c.miss ? " · " + c.miss.toLocaleString("en-US") + " missing (excluded)" : "") + (c.coded ? " · coded numbers" : ""))); card.appendChild(hd);
      var body = el("div", { class: "fcb" }), tw = el("div", { class: "ftw" }), t = el("table", { class: "ftab" }), th = el("thead"), tr = el("tr");
      [["Category", ""], ["Count", "n"], ["%", "n"], ["Cumulative %", "n"]].forEach(function (x) { tr.appendChild(el("th", { class: x[1], scope: "col" }, x[0])); }); th.appendChild(tr); t.appendChild(th);
      var tb = el("tbody"), cum = 0; F.rows.forEach(function (r) { cum += r.p; var row = el("tr"); row.appendChild(el("td", null, r.k)); row.appendChild(el("td", { class: "n" }, r.v.toLocaleString("en-US"))); row.appendChild(el("td", { class: "n" }, r.p.toFixed(1))); row.appendChild(el("td", { class: "n" }, Math.min(cum, 100).toFixed(1))); tb.appendChild(row); });
      var tf = el("tr", { class: "tot" }); tf.appendChild(el("td", null, "Total")); tf.appendChild(el("td", { class: "n" }, F.n.toLocaleString("en-US"))); tf.appendChild(el("td", { class: "n" }, "100.0")); tf.appendChild(el("td", { class: "n" }, "")); tb.appendChild(tf);
      t.appendChild(tb); tw.appendChild(t); body.appendChild(tw); body.appendChild(drawChart(F, catType)); card.appendChild(body); out.appendChild(card); });
    out.scrollIntoView({ behavior: "smooth", block: "start" }); }

  // ---------- render results ----------
  function apply() {
    if (!ds || !ds.num.length) return;
    var R = compute(), out = $("descout");
    if (!R.feats.length || !R.cols.length) { $("applymsg").textContent = "Select at least one feature and one metric."; return; }
    $("applymsg").textContent = ""; last = R; cur = { mode: "num" }; resetDrive(); $("exg").hidden = false; out.textContent = ""; out.hidden = false; $("catout").hidden = true;
    var h = el("div", { class: "dohead" }); h.appendChild(el("p", { class: "tag" }, "DESCRIPTIVE ANALYTICS · " + ds.name)); h.appendChild(el("h2", null, R.feats.length + " features × " + R.cols.length + " metrics")); out.appendChild(h);
    var tw = el("div", { class: "dotw" }), t = el("table", { class: "dot" }), hr = el("tr");
    hr.appendChild(el("th", null, "Feature")); R.cols.forEach(function (c) { hr.appendChild(el("th", null, c.label)); }); t.appendChild(hr);
    R.rows.forEach(function (r) { var tr = el("tr"); tr.appendChild(el("td", { class: "f" }, r.name)); r.vals.forEach(function (v, j) { var k = R.cols[j].key, td = el("td", null, fmt(v)); if ((k === "skew" || k === "kurt") && Math.abs(v) > 1) td.className = "hi"; tr.appendChild(td); }); t.appendChild(tr); });
    tw.appendChild(t); out.appendChild(tw);
    var ig = el("div", { class: "doins" }); R.insights.forEach(function (x) { var d = el("div"); d.appendChild(el("p", { class: "k" }, x[0])); d.appendChild(el("p", null, x[1])); ig.appendChild(d); }); out.appendChild(ig);
    $("exportrow").hidden = false; $("colabpanel").hidden = true;
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- full data modal ----------
  function openFull() {
    var m = $("fullmodal"); m.hidden = false; document.body.style.overflow = "hidden";
    $("fmtitle").textContent = ds.name; $("fmq").value = ""; drawFull(); $("fmq").focus();
  }
  function closeFull() { $("fullmodal").hidden = true; document.body.style.overflow = ""; $("b-full").focus(); }
  function num(v) { if (v == null || v === "") return null; var x = typeof v === "number" ? v : Number(String(v).replace(/,/g, "")); return isFinite(x) ? x : null; }
  function allHead() { return ds.head.concat(ds.extra.map(function (e) { return e.name; })); }
  function cellVal(i, j) { var H = ds.head.length; return j < H ? ds.rows[i][j] : ds.extra[j - H].vals[i]; }
  function drawFull() {
    var q = $("fmq").value.trim().toLowerCase(), t = $("fmt"), H = allHead(), idx = [];
    for (var i = 0; i < ds.rows.length; i++) { if (!q) { idx.push(i); continue; } var r = ds.rows[i]; for (var c = 0; c < r.length; c++) if (String(r[c]).toLowerCase().indexOf(q) >= 0) { idx.push(i); break; } }
    if (sortState) { var j = sortState.j, dir = sortState.dir === "asc" ? 1 : -1;
      idx.sort(function (x, y) { var a = cellVal(x, j), b = cellVal(y, j), na = num(a), nb = num(b), ea = a == null || a === "", eb = b == null || b === "";
        if (ea || eb) return ea === eb ? x - y : ea ? 1 : -1;
        var r = na != null && nb != null ? na - nb : String(a).localeCompare(String(b), undefined, { numeric: true });
        return r ? r * dir : x - y; }); }
    t.textContent = ""; var th = el("thead"), tr = el("tr"); tr.appendChild(el("th", null, "#"));
    H.forEach(function (h, j) { var c = el("th"), w = el("span", { class: "thw" }), isZ = j >= ds.head.length; if (isZ) c.className = "zc";
      w.appendChild(el("span", null, h));
      [["asc", "▲", "ascending"], ["desc", "▼", "descending"]].forEach(function (d) { var on = sortState && sortState.j === j && sortState.dir === d[0];
        var b = el("button", { type: "button", class: "srt" + (on ? " on" : ""), "aria-label": "Sort " + h + " " + d[2], "aria-pressed": on ? "true" : "false", title: "Sort " + d[2] }, d[1]);
        b.addEventListener("click", function () { sortState = on ? null : { j: j, dir: d[0] }; drawFull(); }); w.appendChild(b); });
      c.appendChild(w); if (sortState && sortState.j === j) c.setAttribute("aria-sort", sortState.dir === "asc" ? "ascending" : "descending"); tr.appendChild(c); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el("tbody"), lim = Math.min(idx.length, 5000);
    for (var k = 0; k < lim; k++) { var ri = idx[k], row = el("tr"); row.appendChild(el("td", { class: "rn" }, String(ri + 1)));
      for (var j2 = 0; j2 < H.length; j2++) { var v = cellVal(ri, j2), isZ = j2 >= ds.head.length; v = v == null ? "" : v;
        var td = el("td", null, isZ && v !== "" ? v.toFixed(3) : String(v)); if (typeof v === "number") td.className = "num" + (isZ ? " zc" : ""); row.appendChild(td); } tb.appendChild(row); }
    t.appendChild(tb);
    $("fmcount").textContent = idx.length.toLocaleString("en-US") + " of " + ds.n.toLocaleString("en-US") + " rows · " + H.length + " columns" + (idx.length > lim ? " · showing first 5,000" : "") + (sortState ? " · sorted by " + H[sortState.j] + (sortState.dir === "asc" ? " ↑" : " ↓") : "");
  }
  // ---------- z-score columns ----------
  function buildZList() { var L = $("fmzlist"); L.textContent = ""; var have = {}; ds.extra.forEach(function (e) { have[e.src] = 1; });
    ds.num.forEach(function (c) { if (!(c.d.std > 0)) return; var lab = el("label", { class: "chk" }), cb = el("input", { type: "checkbox", value: c.name }); cb.checked = !!have[c.name]; lab.appendChild(cb); lab.appendChild(el("span", null, c.name)); L.appendChild(lab); }); }
  function toggleZ() { var p = $("fmz"), open = p.hidden; p.hidden = !open; $("fmzb").setAttribute("aria-expanded", open ? "true" : "false"); if (open) buildZList(); }
  function createZ() { var sel = [].slice.call($("fmzlist").querySelectorAll("input:checked")).map(function (c) { return c.value; });
    if (!sel.length) { $("fmmsg").textContent = "Select at least one feature."; return; }
    var added = 0; sel.forEach(function (name) { if (ds.extra.some(function (e) { return e.src === name; })) return;
      var c = ds.num.filter(function (x) { return x.name === name; })[0], j = ds.colIdx[name], m = c.d.mean, sd = c.d.std;
      ds.extra.push({ name: "z_" + name, src: name, vals: ds.rows.map(function (r) { var x = num(r[j]); return x == null ? null : Math.round((x - m) / sd * 1000) / 1000; }) }); added++; });
    var keep = {}; sel.forEach(function (n) { keep[n] = 1; }); var before = ds.extra.length; ds.extra = ds.extra.filter(function (e) { return keep[e.src]; });
    var removed = before - ds.extra.length;
    if (sortState && sortState.j >= allHead().length) sortState = null;
    $("fmmsg").textContent = (added ? "Added " + added + " z-score column" + (added > 1 ? "s" : "") + " at the right end of the table (mean and sample std, n − 1)." : "No new columns.") + (removed ? " Removed " + removed + "." : "") + " CSV and Excel downloads include them.";
    drawFull(); var w = document.querySelector(".fmwrap"); if (added) w.scrollLeft = w.scrollWidth; }
  function removeZ() { if (sortState && sortState.j >= ds.head.length) sortState = null; ds.extra = []; buildZList(); drawFull(); $("fmmsg").textContent = "Z-score columns removed."; }
  // ---------- data quality ----------
  function renderDQ() { var B = $("dqbody"); if (!B) return; B.textContent = "";
    $("dq-miss").classList.toggle("on", dqMode === "miss"); $("dq-out").classList.toggle("on", dqMode === "out");
    $("dq-miss").setAttribute("aria-selected", dqMode === "miss"); $("dq-out").setAttribute("aria-selected", dqMode === "out");
    $("dqnote").hidden = !(ds.sample && dqMode === "miss");
    $("dqlede").textContent = "Checks run on " + ds.name.replace(" (sample)", "") + (ds.sample ? " (HR sample)" : "") + ": " + ds.n.toLocaleString("en-US") + " rows, " + ds.cols.length + " columns. Upload a file in the Data workspace above and this part updates.";
    var sm = el("div", { class: "dqsum" }); function k(v, l) { var d = el("div"); d.appendChild(el("b", null, v)); d.appendChild(el("span", null, l)); sm.appendChild(d); }
    if (dqMode === "miss") {
      var tot = 0, withM = 0; ds.cols.forEach(function (c) { tot += c.missing; if (c.missing) withM++; });
      k(tot.toLocaleString("en-US"), "missing values"); k(String(withM), "columns with missing"); k(fmt(100 * tot / Math.max(1, ds.n * ds.cols.length)) + "%", "of all cells"); B.appendChild(sm);
      if (!tot) { var g = el("div", { class: "miss" }); ds.cols.forEach(function (c) { var d = el("div", { class: "mc" }); d.appendChild(el("b", { title: c.name }, c.name)); d.appendChild(el("span", null, "0 missing")); g.appendChild(d); }); B.appendChild(g); }
      else { var lg = el("div", { class: "sblg" }); [["sw sw-p", "Present"], ["sw sw-m", "Missing"]].forEach(function (x) { var i = el("span"); i.appendChild(el("i", { class: x[0] })); i.appendChild(document.createTextNode(x[1])); lg.appendChild(i); }); B.appendChild(lg);
        var ch = el("div", { class: "sbc", role: "img", "aria-label": "Stacked bars of present and missing values for each column" });
        ds.cols.slice().sort(function (a, b) { return b.missing - a.missing; }).forEach(function (c) { var pm = 100 * c.missing / ds.n, row = el("div", { class: "sbr" + (c.missing ? "" : " ok") });
          row.appendChild(el("span", { class: "sbn", title: c.name }, c.name));
          var bar = el("div", { class: "sbb", tabindex: "0", title: c.name + ": " + (ds.n - c.missing).toLocaleString("en-US") + " present, " + c.missing.toLocaleString("en-US") + " missing (" + fmt(pm, 1) + "%)" });
          var a1 = el("i", { class: "pr" }); a1.style.width = (100 - pm) + "%"; bar.appendChild(a1);
          if (c.missing) { var a2 = el("i", { class: "ms" }); a2.style.width = Math.max(pm, 0.6) + "%"; bar.appendChild(a2); }
          row.appendChild(el("span", { class: "sbv" }, c.missing ? fmt(pm, 1) + "% missing" : "complete"));
          var lb = el("div", { class: "sbk", "aria-hidden": "true" }), l1 = el("span", { class: "lpr" }, (ds.n - c.missing).toLocaleString("en-US")); l1.style.flexBasis = (100 - pm) + "%"; lb.appendChild(l1);
          if (c.missing) lb.appendChild(el("span", { class: "lms" }, c.missing.toLocaleString("en-US")));
          row.appendChild(lb); row.appendChild(bar);
          ch.appendChild(row); }); B.appendChild(ch);
        var tg = el("button", { type: "button", class: "lnk" }, "Show as table"); var tbw = el("div", { class: "tw", hidden: "" }), tt = el("table", { class: "ot" });
        tt.innerHTML = "<thead><tr><th>Column</th><th class='n'>Present</th><th class='n'>Missing</th><th class='n'>Missing %</th></tr></thead>"; var tbb = el("tbody");
        ds.cols.forEach(function (c) { var r = el("tr"); [c.name, (ds.n - c.missing).toLocaleString("en-US"), c.missing.toLocaleString("en-US"), fmt(100 * c.missing / ds.n, 1) + "%"].forEach(function (v, i) { r.appendChild(el("td", { class: i ? "n" : "" }, v)); }); tbb.appendChild(r); });
        tt.appendChild(tbb); tbw.appendChild(tt); tg.addEventListener("click", function () { tbw.hidden = !tbw.hidden; tg.textContent = tbw.hidden ? "Show as table" : "Hide table"; }); B.appendChild(tg); B.appendChild(tbw); }
      B.appendChild(el("p", { class: "dqfoot" }, tot ? "Columns with missing values are listed first, in red." : "No missing values: every statistic uses all rows."));
    } else {
      var feats = ds.num.filter(function (c) { return c.d.std > 0; }), ti = 0, tz = 0, rows = feats.map(function (c) {
        var lo = c.d.q1 - 1.5 * (c.d.q3 - c.d.q1), hi = c.d.q3 + 1.5 * (c.d.q3 - c.d.q1), ni = 0, nz = 0, mz = 0;
        c.nums.forEach(function (x) { if (x < lo || x > hi) ni++; var z = Math.abs((x - c.d.mean) / c.d.std); if (z > 3) nz++; if (z > mz) mz = z; });
        ti += ni; tz += nz; return { c: c, lo: lo, hi: hi, ni: ni, nz: nz, mz: mz }; });
      k(String(feats.length), "numerical features"); k(String(rows.filter(function (r) { return r.ni; }).length), "with IQR outliers"); k(String(rows.filter(function (r) { return r.nz; }).length), "with z-score outliers"); B.appendChild(sm);
      var t = el("table", { class: "ot" }), h = el("tr"); [["Feature", ""], ["IQR method", "below Q1 − 1.5·IQR or above Q3 + 1.5·IQR"], ["Z-score method", "|z| > 3"]].forEach(function (x, i) { var c = el("th", { class: i ? "n" : "", scope: "col" }, x[0]); if (x[1]) c.appendChild(el("span", { class: "sub" }, x[1])); h.appendChild(c); });
      var th = el("thead"); th.appendChild(h); t.appendChild(th); var tb = el("tbody");
      rows.forEach(function (r) { var tr = el("tr"); tr.appendChild(el("td", null, r.c.name));
        var a = el("td", { class: "n" + (r.ni ? " hit" : "") }); a.appendChild(el("b", null, r.ni.toLocaleString("en-US"))); a.appendChild(el("small", null, fmt(100 * r.ni / r.c.nums.length, 1) + "% · range " + fmt(r.lo) + " to " + fmt(r.hi))); tr.appendChild(a);
        var z = el("td", { class: "n" + (r.nz ? " hit" : "") }); z.appendChild(el("b", null, r.nz.toLocaleString("en-US"))); z.appendChild(el("small", null, fmt(100 * r.nz / r.c.nums.length, 1) + "% · max |z| " + fmt(r.mz))); tr.appendChild(z); tb.appendChild(tr); });
      t.appendChild(tb); var w = el("div", { class: "tw" }); w.appendChild(t); B.appendChild(w);
      B.appendChild(el("p", { class: "dqfoot" }, "Total flags: " + ti.toLocaleString("en-US") + " by IQR, " + tz.toLocaleString("en-US") + " by z-score. The z-score uses the mean and sample std, which a long tail inflates, so on skewed features it flags fewer points than the IQR rule. Constant columns are left out."));
    } }
  function csvText() { var q = function (v) { v = v == null ? "" : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var H = allHead(); return [H.map(q).join(",")].concat(ds.rows.map(function (r, i) { return H.map(function (_, j) { return q(cellVal(i, j)); }).join(","); })).join("\n"); }
  function base(n) { return n.replace(/\s*\(sample\)$/, "").replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "_") || "data"; }
  function save(name, data, msgEl) {
    if (!dl) { try { var blob = data instanceof Blob ? data : new Blob([data]), u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); msgEl.textContent = "Downloaded: " + name; } catch (x) { msgEl.textContent = "Could not download here."; } return; }
    msgEl.textContent = "Preparing " + name + "…";
    dl.save({ filename: name, data: data }).then(function () { msgEl.textContent = "Saved: " + name; })
      .catch(function (e) { msgEl.textContent = e && e.code === "declined" ? "Download cancelled." : "Could not save the file here (" + (e && e.code || "error") + ")."; });
  }

  // ---------- Colab notebook ----------
  function pyList(a) { return "[" + a.map(function (s) { return JSON.stringify(s); }).join(", ") + "]"; }
  // target: "drive" (CSV saved next to the notebook in My Drive), "download" (data in a collapsed cell); sample data always loads from GitHub
  var loadTarget = "drive", driveCsv = "", KEY = "dsa-colab-files", mem = null;
  function getStore() { if (mem) return mem; try { mem = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (x) { mem = {}; } return mem; }
  function setStore(o) { mem = o; try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (x) {} }
  function sampleClean() { return ds.sample && !ds.extra.length; }
  function loadCells() { var c = [];
    if (sampleClean()) { c.push({ title: "Load the data", src: "import pandas as pd\n\nurl = \"https://raw.githubusercontent.com/QssAnalytic/dsa-hr-analytics/main/data/HR_Analytics_data.csv\"\ndf = pd.read_csv(url)\nprint(df.shape)\ndf.head()" }); return c; }
    if (loadTarget === "drive") { var f = driveCsv || nbName() + ".csv";
      c.push({ title: "Load the data", src: "import pandas as pd\nfrom google.colab import drive\n\n# Colab asks you to allow access to your Google Drive: choose your account and Allow.\ndrive.mount(\"/content/drive\")\ndf = pd.read_csv(\"/content/drive/MyDrive/DSA Colab/" + f.replace(/["\\]/g, "_") + "\")\nprint(df.shape)\ndf.head()" }); return c; }
    var csv = csvText(), bytes = new TextEncoder().encode(csv), bin = ""; for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    c.push({ title: "Data (hidden cell: just run it)", form: true, src: "#@title Data · run this cell first (the data is stored here, collapsed)\nDATA = \"" + btoa(bin) + "\"", short: "#@title Data · run this cell first\nDATA = \"…data…\"" });
    c.push({ title: "Load the data", src: "import pandas as pd, io, base64\n\ndf = pd.read_csv(io.BytesIO(base64.b64decode(DATA)))\nprint(df.shape)\ndf.head()" });
    return c; }
  function catCells() { var names = cur.names, t = cur.type, c = [];
    c.push({ md: true, src: "# Frequencies · " + ds.name.replace(" (sample)", "") + "\n1 Session · Data Science Academy · Statistics and Machine Learning class\n\nRun the cells one by one: click a cell, then ▶ (or Shift+Enter)." });
    c = c.concat(loadCells());
    c.push({ title: "Selected categorical features", src: "import matplotlib.pyplot as plt\n\nfeatures = " + pyList(names) + "\ndf[features].head()" });
    var pal = "colors = [\"#2a78d6\", \"#eb6834\", \"#1baf7a\", \"#eda100\", \"#e87ba4\", \"#008300\", \"#6250d6\", \"#e34948\"]";
    names.forEach(function (n) { var cc = ds.cat.filter(function (x) { return x.name === n; })[0], col = JSON.stringify(n), order = cc && cc.coded ? ".sort_index()" : "";
      c.push({ title: "Frequency table · " + n, src: "# Frequency table: " + n + "\ncounts = df[" + col + "].value_counts()" + order + "\nfreq = pd.DataFrame({\"Count\": counts, \"%\": (counts / counts.sum() * 100).round(1)})\nfreq[\"Cumulative %\"] = freq[\"%\"].cumsum().round(1)\nfreq" });
      var ch;
      if (t === "bar") ch = "# Bar chart: " + n + "\ncounts = df[" + col + "].value_counts()" + order + "\nax = counts.plot.barh(figsize=(8, max(2, 0.45 * len(counts))), color=\"#2E2E38\")\nax.invert_yaxis()\nfor i, v in enumerate(counts):\n    ax.text(v, i, f\" {v:,} ({v / counts.sum():.1%})\", va=\"center\")\nax.set_title(" + col + ")\nax.set_xlabel(\"Count\")\nplt.show()";
      else ch = "# " + (t === "pie" ? "Pie" : "Donut") + " chart: " + n + "\n" + pal + "\ncounts = df[" + col + "].value_counts()" + order + "\nif len(counts) > 8:  # keep the 7 largest, fold the rest into Other\n    top = counts.sort_values(ascending=False)\n    counts = pd.concat([top[:7], pd.Series({\"Other\": top[7:].sum()})])\nplt.figure(figsize=(6, 6))\nplt.pie(counts, labels=counts.index, autopct=\"%1.1f%%\", startangle=90, counterclock=False,\n        colors=colors[:len(counts)], wedgeprops=dict(" + (t === "donut" ? "width=0.42, " : "") + "edgecolor=\"white\", linewidth=2))\n" + (t === "donut" ? "plt.text(0, 0, f\"{counts.sum():,}\\ntotal\", ha=\"center\", va=\"center\", fontsize=14)\n" : "") + "plt.title(" + col + ")\nplt.show()";
      c.push({ title: (t === "bar" ? "Bar" : t === "pie" ? "Pie" : "Donut") + " chart · " + n, src: ch }); });
    return c; }
  function cells() {
    if (cur && cur.mode === "cat") return catCells();
    var R = last, c = [];
    c.push({ md: true, src: "# Descriptive analytics · " + ds.name.replace(" (sample)", "") + "\n1 Session · Data Science Academy · Statistics and Machine Learning class\n\nRun the cells one by one: click a cell, then ▶ (or Shift+Enter)." });
    c = c.concat(loadCells());
    c.push({ title: "Selected features", src: "features = " + pyList(R.feats.map(function (f) { return f.name; })) + "\ndf[features].head()" });
    var code = { count: "df[features].count()", missing: "df[features].isna().sum()", min: "df[features].min()", max: "df[features].max()", mean: "df[features].mean()", median: "df[features].median()",
      mode: "df[features].mode().iloc[0]", std: "df[features].std()", "var": "df[features].var()", q1: "df[features].quantile(0.25)", q3: "df[features].quantile(0.75)",
      iqr: "df[features].quantile(0.75) - df[features].quantile(0.25)", range: "df[features].max() - df[features].min()", skew: "df[features].skew()", kurt: "df[features].kurt()  # excess kurtosis, 0 = normal" };
    var parts = [];
    R.cols.forEach(function (m) { var src = m.p != null ? "df[features].quantile(" + (m.p / 100) + ")" : code[m.key];
      c.push({ title: m.label, src: "# " + m.label + "\n" + src }); parts.push("    " + JSON.stringify(m.label) + ": " + src.replace(/\s+#.*$/, "") + ","); });
    c.push({ title: "Summary table", src: "summary = pd.DataFrame({\n" + parts.join("\n") + "\n}).round(2)\nsummary" });
    return c;
  }
  function nbName() { var d = new Date(), z = function (x) { return ("0" + x).slice(-2); };
    return base(ds.name) + (cur && cur.mode === "cat" ? "_frequencies" : "_descriptive") + "_" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()); }
  function resetDrive() { $("b-open").hidden = true; $("b-open").setAttribute("href", "#"); $("b-drive").hidden = false; $("drivemsg").textContent = ""; }
  function sendToColab() { if (!cur) return; var btn = $("b-drive"), msg = $("drivemsg"), stamp = nbName(), title = stamp + ".ipynb", needCsv = !sampleClean();
    driveCsv = needCsv ? stamp + ".csv" : ""; var nb = notebook(cells()), ncells = cells().filter(function (x) { return !x.md; }).length; driveCsv = "";
    resetDrive(); btn.disabled = true; btn.textContent = "Saving to your Google Drive…";
    var done = function () { btn.disabled = false; btn.textContent = "Open in Colab ↗"; };
    (mcpP || (mcpP = window.claude && window.claude.use ? window.claude.use("mcp") : Promise.resolve(null))).then(function (M) {
      if (!M) { done(); msg.textContent = "Google Drive is not available in this view, so the notebook is being downloaded instead. In Colab choose File → Upload notebook."; downloadNotebook(); return; }
      var fileArgs = null;
      var st = getStore(), folder = st.folder || "";
      function ensureFolder(force) { if (folder && !force) return Promise.resolve(folder);
        return M.callTool("Google Drive", "create_file", { title: "DSA Colab", contentMimeType: "application/vnd.google-apps.folder" }).then(function (r) { folder = (r && r.payload && r.payload.id) || ""; return folder; }); }
      function putIn(name, text, mime) { return ensureFolder(false).then(function () { return put(name, text, mime); })
        .catch(function (e) { if (e && e.code === "tool_error" && folder) return ensureFolder(true).then(function () { return put(name, text, mime); }); throw e; }); }
      function put(name, text, mime) { var inp = { title: name, contentMimeType: mime, disableConversionToGoogleType: true }; if (folder) inp.parentId = folder;
        if (new TextEncoder().encode(text).length < 900000) { inp.textContent = text; return M.callTool("Google Drive", "create_file", inp); }
        return (fileArgs ? Promise.resolve(fileArgs) : M.listTools().then(function (L) { return fileArgs = !!(L && L.fileArgs); })).then(function (ok) {
          if (!ok) { var e = new Error("too_big"); e.code = "too_big"; throw e; }
          var ext = mime === "text/csv" ? ".csv" : ".json", typ = mime === "text/csv" ? "text/csv" : "application/json";
          inp.base64Content = { $file: { data: new Blob([text], { type: typ }), name: name.replace(/\.[^.]+$/, "") + ext, type: typ } }; return M.callTool("Google Drive", "create_file", inp); }); }
      var newCsv = "", oldNb = st.nb, oldCsv = st.csv;
      var chain = needCsv ? (btn.textContent = "Saving data to your Google Drive…", putIn(stamp + ".csv", csvText(), "text/csv").then(function (r) { newCsv = r && r.payload && r.payload.id || ""; })) : Promise.resolve();
      return chain.then(function () { btn.textContent = "Saving notebook…"; return putIn(title, nb, "application/x-ipynb+json"); }).then(function (r) {
          var nid = r && r.payload && r.payload.id || "";
          setStore({ folder: folder, nb: nid, csv: newCsv });
          [oldNb, oldCsv].forEach(function (id) { if (id && id !== nid && id !== newCsv) M.callTool("Google Drive", "trash_file", { fileId: id }).catch(function () {}); });
          var f = r && r.payload || {}, id = f.id || "", url = typeof f.viewUrl === "string" && f.viewUrl.indexOf("https://colab.research.google.com/") === 0 ? f.viewUrl : (/^[A-Za-z0-9_-]+$/.test(id) ? "https://colab.research.google.com/drive/" + id : "");
          done(); if (!url) { msg.textContent = "Saved " + title + " to your Google Drive. Open it from Drive with Google Colaboratory."; return; }
          var a = $("b-open"), w = null; try { w = window.open(url, "_blank", "noopener"); } catch (x) {} a.setAttribute("href", url); a.hidden = false; $("b-drive").hidden = true; if (!w) a.focus();
          msg.textContent = "Saved " + title + (needCsv ? " and its data" : "") + " to the DSA Colab folder in your Google Drive (" + ncells + " cells)" + (oldNb ? "; the previous version was moved to Drive’s trash" : "") + ". Click Open notebook in Colab ↗ to open it." + (needCsv ? " The first cell asks to connect your Drive: choose Allow." : ""); })
        .catch(function (e) { done(); var c = e && e.code;
        var t = c === "too_big" ? "This file is too large to send to Drive from here, so the notebook is being downloaded instead." :
          c === "server_not_connected" ? "Google Drive is not connected. Add it in claude.ai Settings → Connectors. The notebook is being downloaded instead." :
          c === "needs_reauth" ? "Google Drive needs to be reconnected in claude.ai Settings → Connectors. The notebook is being downloaded instead." :
          c === "approval_required" ? "Saving to Google Drive needs your approval. Click Open in Colab again and choose Allow." :
          c === "not_in_manifest" || c === "blocked_by_policy" ? "Google Drive is not allowed for this page in your settings, so the notebook is being downloaded instead." :
          c === "tool_error" ? "Google Drive refused the file: " + (e.message || "unknown reason") + "." :
          c === "server_unavailable" || c === "upstream_error" ? "Google Drive did not answer. The file may still have been saved: check your Drive before trying again." :
          "Could not save to Google Drive (" + (c || "error") + "). The notebook is being downloaded instead.";
        msg.textContent = t; if (["tool_error", "approval_required", "server_unavailable", "upstream_error"].indexOf(c) < 0) downloadNotebook(); });
    }); }
  function notebook(cs) {
    return JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { colab: { name: nbName() + ".ipynb" }, kernelspec: { name: "python3", display_name: "Python 3" }, language_info: { name: "python" } },
      cells: cs.map(function (x, i) { var lines = x.src.split("\n").map(function (l, k, a) { return k < a.length - 1 ? l + "\n" : l; });
        return x.md ? { cell_type: "markdown", id: "c" + i, metadata: {}, source: lines } : { cell_type: "code", id: "c" + i, metadata: x.form ? { cellView: "form" } : {}, execution_count: null, outputs: [], source: lines }; }) }, null, 1);
  }
  function showColab() {
    if (!cur) return; var p = $("colabpanel"), list = $("cellist"), cs = cells(); p.hidden = false; list.textContent = "";
    $("cptxt").textContent = "These " + cs.filter(function (x) { return !x.md; }).length + " cells are exactly what the notebook will contain: " + (cur.mode === "cat" ? cur.names.length + " categorical feature(s), " + cur.type + " charts" : last.feats.length + " features × " + last.cols.length + " metrics") + ", on " + ds.name.replace(" (sample)", "") + ".";
    cs.forEach(function (x, i) { if (x.md) return; var d = el("div", { class: "cell" }), hd = el("div", { class: "cellh" });
      hd.appendChild(el("span", null, "In [" + i + "]  " + x.title)); var b = el("button", { type: "button", class: "copy" }, "Copy");
      b.addEventListener("click", function () { (navigator.clipboard ? navigator.clipboard.writeText(x.src) : Promise.reject()).then(function () { b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = "Copy"; }, 1500); }).catch(function () { b.textContent = "Select and copy"; }); });
      hd.appendChild(b); d.appendChild(hd); d.appendChild(el("pre", null, x.short || x.src)); list.appendChild(d); });
    p.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function downloadNotebook() { loadTarget = "download"; var cs = cells(); loadTarget = "drive"; var nb = notebook(cs), name = nbName();
    var z = PZ.zip([{ name: name + ".ipynb", data: nb }, { name: base(ds.name) + ".csv", data: csvText() }, { name: "README.txt", data: "1. Unzip this file.\n2. Open https://colab.research.google.com and choose File > Upload notebook.\n3. Select " + name + ".ipynb.\n4. Run the cells one by one (Shift+Enter). The data is inside the notebook, in the collapsed first cell.\n" }]);
    save(name + "_colab.zip", z, $("colabmsg")); }

  // ---------- PDF report / slides ----------
  var INK = "#2E2E38", DEEP = "#1A1A24", Y = "#FFE600", G = "#747480", LG = "#C4C4CD", BLUE = "#188CE5", BG = "#F6F6FA";
  var TAGLINE = "1 SESSION  ·  DATA SCIENCE ACADEMY  ·  STATISTICS AND MACHINE LEARNING CLASS";
  function today() { return new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }); }
  function histo(pdf, c, x, y, w, h) {
    var d = c.d, bins = Math.min(24, Math.max(4, d.nuniq)), lo = d.min, span = (d.max - lo) || 1, cnt = [], i;
    for (i = 0; i < bins; i++) cnt.push(0); c.nums.forEach(function (v) { cnt[Math.min(bins - 1, Math.floor((v - lo) / span * bins))]++; });
    var mx = Math.max.apply(null, cnt), bw = w / bins;
    pdf.line(x, y + h, x + w, y + h, LG, 0.8);
    cnt.forEach(function (k, j) { var bh = k / mx * h; if (bh > 0) pdf.rect(x + j * bw + 0.4, y + h - bh, Math.max(bw - 0.8, 0.5), bh, INK); });
    var X = function (v) { return x + (v - lo) / span * w; };
    pdf.line(X(d.mean), y, X(d.mean), y + h, Y, 2.2); pdf.line(X(d.median), y, X(d.median), y + h, BLUE, 1.4, "4 3");
    pdf.text(x, y + h + 11, fmt(d.min), 7.5, { color: G }); pdf.text(x + w, y + h + 11, fmt(d.max), 7.5, { color: G, align: "right" });
  }
  function chunk(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function tablePage(pdf, R, rows, cols, x, y, w, fs, rh) {
    var fw = Math.min(200, w * 0.26), cw = (w - fw) / cols.length;
    pdf.rect(x, y, w, rh, DEEP); pdf.text(x + 8, y + rh * 0.68, "Feature", fs, { bold: true, color: "#FFFFFF" });
    cols.forEach(function (c, j) { pdf.text(x + fw + cw * (j + 1) - 6, y + rh * 0.68, c.label, fs, { bold: true, color: "#FFFFFF", align: "right", maxw: cw - 8 }); });
    rows.forEach(function (r, i) { var yy = y + rh * (i + 1); if (i % 2) pdf.rect(x, yy, w, rh, "#F4F4F8");
      pdf.text(x + 8, yy + rh * 0.68, r.name, fs, { bold: true, maxw: fw - 12 });
      cols.forEach(function (c, j) { var v = r.vals[R.cols.indexOf(c)], hi = (c.key === "skew" || c.key === "kurt") && Math.abs(v) > 1;
        if (hi) pdf.rect(x + fw + cw * j + 2, yy + 2, cw - 4, rh - 4, Y); pdf.text(x + fw + cw * (j + 1) - 6, yy + rh * 0.68, fmt(v), fs, { align: "right", bold: hi }); });
      pdf.line(x, yy + rh, x + w, yy + rh, "#E4E4EC", 0.5); });
  }
  function report() {
    var R = last, pdf = new PZ.PDF(842, 595), name = ds.name.replace(" (sample)", "");
    // cover
    pdf.page(DEEP); pdf.rect(0, 579, 320, 16, Y);
    pdf.text(48, 70, TAGLINE, 9, { bold: true, color: Y });
    pdf.text(48, 170, "Descriptive analytics", 44, { color: "#FFFFFF" });
    pdf.text(48, 222, name, 30, { bold: true, color: Y, maxw: 740 });
    pdf.text(48, 262, R.feats.length + " features  ·  " + R.cols.length + " metrics  ·  " + today(), 14, { color: LG });
    [[ds.n.toLocaleString("en-US"), "ROWS"], [String(ds.cols.length), "COLUMNS"], [String(R.feats.length), "FEATURES ANALYSED"], [String(R.cols.length), "METRICS"]].forEach(function (k, i) {
      var x = 48 + i * 185; pdf.rect(x, 340, 3, 70, Y); pdf.text(x + 16, 385, k[0], 34, { bold: true, color: "#FFFFFF" }); pdf.text(x + 16, 405, k[1], 9, { color: LG }); });
    // insights
    pdf.page(); pdf.rect(0, 0, 842, 6, Y);
    pdf.text(48, 52, "KEY INSIGHTS", 10, { bold: true, color: G }); pdf.text(48, 82, "What the selected features say", 24, { bold: true });
    R.insights.forEach(function (x, i) { var cx = 48 + (i % 2) * 380, cy = 115 + Math.floor(i / 2) * 200; pdf.rect(cx, cy, 360, 180, INK); pdf.rect(cx, cy, 360, 4, Y);
      pdf.text(cx + 20, cy + 34, "0" + (i + 1) + "  " + x[0].toUpperCase(), 11, { bold: true, color: Y }); pdf.wrap(cx + 20, cy + 62, x[1], 12, 320, 17, { color: "#FFFFFF" }); });
    // tables
    var colChunks = chunk(R.cols, 9), rowChunks = chunk(R.rows, 18);
    colChunks.forEach(function (cc, ci) { rowChunks.forEach(function (rr, ri) { pdf.page(); pdf.rect(0, 0, 842, 6, Y);
      pdf.text(48, 52, "DESCRIPTIVE STATISTICS" + (colChunks.length * rowChunks.length > 1 ? "  ·  " + (ci * rowChunks.length + ri + 1) + "/" + colChunks.length * rowChunks.length : ""), 10, { bold: true, color: G });
      pdf.text(48, 82, "Selected metrics for each feature", 24, { bold: true });
      tablePage(pdf, R, rr, cc, 48, 105, 746, 9.5, 23);
      pdf.text(48, 560, "Highlighted: |skewness| or |kurtosis| above 1. Kurtosis is excess kurtosis (0 = normal). Std is the sample standard deviation (n - 1).", 8.5, { color: G }); }); });
    // histograms
    chunk(R.feats, 6).forEach(function (fs, pi) { pdf.page(); pdf.rect(0, 0, 842, 6, Y);
      pdf.text(48, 52, "DISTRIBUTIONS", 10, { bold: true, color: G }); pdf.text(48, 82, "Histogram of each feature", 24, { bold: true });
      pdf.rect(560, 66, 14, 3, Y); pdf.text(580, 70, "mean", 9, { color: G }); pdf.line(620, 67.5, 634, 67.5, BLUE, 1.4, "4 3"); pdf.text(640, 70, "median", 9, { color: G });
      fs.forEach(function (c, i) { var cx = 48 + (i % 3) * 250, cy = 110 + Math.floor(i / 3) * 225; pdf.rect(cx, cy, 236, 210, null, "#E4E4EC", 0.8);
        pdf.text(cx + 12, cy + 22, c.name, 11, { bold: true, maxw: 212 }); pdf.text(cx + 12, cy + 37, "mean " + fmt(c.d.mean) + "  ·  median " + fmt(c.d.median) + "  ·  skew " + fmt(c.d.skew), 8, { color: G, maxw: 212 });
        histo(pdf, c, cx + 12, cy + 52, 212, 130); }); });
    return pdf.output();
  }
  function slides() {
    var R = last, pdf = new PZ.PDF(960, 540), name = ds.name.replace(" (sample)", "");
    function head(kick, title) { pdf.page("#FBFBFD"); pdf.rect(0, 0, 960, 6, Y); pdf.text(48, 48, kick, 11, { bold: true, color: G }); pdf.text(48, 84, title, 28, { bold: true, maxw: 860 }); pdf.text(48, 516, "Data Science Academy  ·  Statistics and Machine Learning", 9, { color: G }); }
    pdf.page(DEEP); pdf.rect(0, 520, 360, 20, Y);
    pdf.text(56, 90, TAGLINE, 10, { bold: true, color: Y }); pdf.text(56, 210, "Descriptive analytics", 52, { color: "#FFFFFF" });
    pdf.text(56, 268, name, 32, { bold: true, color: Y, maxw: 850 }); pdf.text(56, 310, R.feats.length + " features  ·  " + R.cols.length + " metrics  ·  " + today(), 15, { color: LG });
    head("OVERVIEW", "The data at a glance");
    [[ds.n.toLocaleString("en-US"), "rows"], [String(ds.cols.length), "columns"], [String(ds.num.length), "numerical columns"], [String(R.feats.length), "features analysed"]].forEach(function (k, i) {
      var x = 48 + i * 218; pdf.rect(x, 140, 204, 150, INK); pdf.rect(x, 140, 204, 5, Y); pdf.text(x + 20, 225, k[0], 44, { bold: true, color: Y }); pdf.text(x + 20, 258, k[1], 13, { color: "#FFFFFF" }); });
    pdf.text(48, 350, "Features: " + R.feats.map(function (f) { return f.name; }).join(", "), 12, { color: INK, maxw: 860 });
    pdf.text(48, 375, "Metrics: " + R.cols.map(function (c) { return c.label; }).join(", "), 12, { color: INK, maxw: 860 });
    head("KEY INSIGHTS", "What the selected features say");
    R.insights.forEach(function (x, i) { var cx = 48 + (i % 2) * 438, cy = 118 + Math.floor(i / 2) * 190; pdf.rect(cx, cy, 424, 176, INK); pdf.rect(cx, cy, 424, 4, Y);
      pdf.text(cx + 20, cy + 32, x[0].toUpperCase(), 12, { bold: true, color: Y }); pdf.wrap(cx + 20, cy + 60, x[1], 13.5, 384, 19, { color: "#FFFFFF" }); });
    var cc = chunk(R.cols, 7), rc = chunk(R.rows, 9), tot = cc.length * rc.length, k = 0;
    cc.forEach(function (c) { rc.forEach(function (r) { k++; head("DESCRIPTIVE STATISTICS" + (tot > 1 ? "  ·  " + k + "/" + tot : ""), "Selected metrics for each feature"); tablePage(pdf, R, r, c, 48, 112, 864, 12, 34); }); });
    R.feats.slice(0, 12).forEach(function (c) { head("DISTRIBUTION", c.name);
      histo(pdf, c, 48, 130, 560, 300);
      [["Mean", c.d.mean], ["Median", c.d.median], ["Std", c.d.std], ["Skewness", c.d.skew]].forEach(function (m, i) { var y = 120 + i * 82; pdf.rect(660, y, 252, 70, i ? "#EEEEF4" : INK);
        pdf.text(678, y + 26, m[0].toUpperCase(), 10, { bold: true, color: i ? G : Y }); pdf.text(678, y + 56, fmt(m[1]), 24, { bold: true, color: i ? INK : "#FFFFFF" }); });
      pdf.rect(48, 470, 14, 3, Y); pdf.text(68, 474, "mean", 10, { color: G }); pdf.line(110, 471.5, 124, 471.5, BLUE, 1.4, "4 3"); pdf.text(130, 474, "median", 10, { color: G }); });
    pdf.page(DEEP); pdf.rect(0, 520, 360, 20, Y); pdf.text(56, 110, "TAKEAWAYS", 12, { bold: true, color: Y });
    var yy = 160; R.insights.forEach(function (x, i) { pdf.text(56, yy, "0" + (i + 1), 18, { bold: true, color: Y }); yy = pdf.wrap(100, yy, x[1], 15, 800, 21, { color: "#FFFFFF" }) + 16; });
    return pdf.output();
  }
  function doExport() { if (!last) return; var f = $("exfmt").value, n = base(ds.name) + (f === "pdf" ? "_descriptive_report.pdf" : "_descriptive_slides.pdf");
    try { save(n, f === "pdf" ? report() : slides(), $("exmsg")); } catch (e) { $("exmsg").textContent = "Could not build the file: " + e.message; } }

  // ---------- wiring ----------
  $("upfile").addEventListener("change", function () { var f = this.files && this.files[0]; if (!f) return; load(f); this.value = ""; });
  function load(f) { if (!/\.(csv|xlsx|txt|tsv)$/i.test(f.name)) { $("upmsg").textContent = "Please choose a .csv or .xlsx file."; return; }
    $("upmsg").textContent = "Reading " + f.name + "…";
    U.readFile(f).then(function (rows) { setData(rows, f.name, false); $("upmsg").textContent = "Loaded " + f.name + ". Open Descriptive analytics to choose features and metrics."; $("descpanel").hidden = false; })
      .catch(function (e) { $("upmsg").textContent = "Could not read this file: " + (e && e.message || "unknown error") + "."; }); }
  var drop = $("updrop");
  ["dragenter", "dragover"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
  ["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
  drop.addEventListener("drop", function (e) { var f = e.dataTransfer.files[0]; if (f) load(f); });
  $("b-sample").addEventListener("click", function () { loadSample(); $("upmsg").textContent = "Using the HR sample data."; });
  $("b-desc").addEventListener("click", function () { var p = $("descpanel"); p.hidden = !p.hidden; if (!p.hidden) p.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  $("b-full").addEventListener("click", openFull);
  $("fmclose").addEventListener("click", closeFull);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("fullmodal").hidden) closeFull(); });
  $("fmq").addEventListener("input", drawFull);
  $("fmcsv").addEventListener("click", function () { save(base(ds.name) + ".csv", csvText(), $("fmmsg")); });
  $("fmxlsx").addEventListener("click", function () { save(base(ds.name) + ".xlsx", PZ.xlsx(allHead(), ds.rows.map(function (r, i) { return ds.extra.length ? r.concat(ds.extra.map(function (e) { return e.vals[i]; })) : r; })), $("fmmsg")); });
  $("featlist").addEventListener("change", countSel); $("metlist").addEventListener("change", countSel); $("pctin").addEventListener("input", countSel);
  $("featsearch").addEventListener("input", function () { var q = this.value.toLowerCase(); $("featlist").querySelectorAll("label").forEach(function (l) { l.hidden = q && l.textContent.toLowerCase().indexOf(q) < 0; }); });
  $("mall").addEventListener("click", function () { $("metlist").querySelectorAll("input").forEach(function (c) { c.checked = true; }); countSel(); });
  $("mnone").addEventListener("click", function () { $("metlist").querySelectorAll("input").forEach(function (c) { c.checked = false; }); $("pctin").value = ""; countSel(); });
  $("fall").addEventListener("click", function () { $("featlist").querySelectorAll("label:not([hidden]) input").forEach(function (c) { c.checked = true; }); countSel(); });
  $("fnone").addEventListener("click", function () { $("featlist").querySelectorAll("input").forEach(function (c) { c.checked = false; }); countSel(); });
  $("b-apply").addEventListener("click", apply);
  $("dm-num").addEventListener("click", function () { setMode("num"); }); $("dm-cat").addEventListener("click", function () { setMode("cat"); });
  $("catlist").addEventListener("change", catCount); $("b-freq").addEventListener("click", showFreq);
  $("call").addEventListener("click", function () { $("catlist").querySelectorAll("input").forEach(function (c) { c.checked = true; }); catCount(); });
  $("cnone").addEventListener("click", function () { $("catlist").querySelectorAll("input").forEach(function (c) { c.checked = false; }); catCount(); });
  $("b-colab").addEventListener("click", showColab);
  $("b-drive").addEventListener("click", sendToColab);
  if (window.LAB_ON) { $("b-tolab").hidden = false; $("b-tolab").addEventListener("click", function () { if (!cur || !window.HRLab) return;
    var cs = cells().filter(function (x) { return !x.md && x.title !== "Load the data" && !x.form; }).map(function (x) { return x.src; });
    var name = (cur.mode === "cat" ? "Frequencies" : "Descriptive") + " · " + ds.name.replace(" (sample)", "").replace(/\.[^.]+$/, "");
    window.HRLab.addTab(name, ["# df is already loaded in the Lab (" + ds.name.replace(" (sample)", "") + ")\ndf.shape"].concat(cs)); }); }
  $("b-drive2").addEventListener("click", function () { $("exportrow").scrollIntoView({ behavior: "smooth", block: "center" }); sendToColab(); });
  $("b-nb").addEventListener("click", downloadNotebook);
  $("b-export").addEventListener("click", doExport);
  $("fmzb").addEventListener("click", toggleZ); $("fmzgo").addEventListener("click", createZ); $("fmzdel").addEventListener("click", removeZ);
  $("fmzall").addEventListener("click", function () { $("fmzlist").querySelectorAll("input").forEach(function (c) { c.checked = true; }); });
  $("fmznone").addEventListener("click", function () { $("fmzlist").querySelectorAll("input").forEach(function (c) { c.checked = false; }); });
  if ($("dq-miss")) { $("dq-miss").addEventListener("click", function () { dqMode = "miss"; renderDQ(); }); $("dq-out").addEventListener("click", function () { dqMode = "out"; renderDQ(); }); }
  loadSample();
  window.HRSite = {
    onData: function (f) { dataCbs.push(f); },
    csv: function () { return csvText(); },
    sample: function () { return !!(ds && ds.sample); },
    info: function () { return { name: ds.name.replace(" (sample)", ""), sample: ds.sample, rows: ds.n,
      columns: ds.cols.map(function (c) { return c.name + (c.numeric ? " (num)" : " (text)") + (c.missing ? " missing=" + c.missing : ""); }),
      categorical: (ds.cat || []).map(function (c) { return c.name; }), numerical: ds.num.map(function (c) { return c.name; }),
      site: { mode: descMode, applied: last ? { features: last.feats.map(function (f) { return f.name; }), metrics: last.cols.map(function (c) { return c.label; }) } : null,
        frequencies: catCur ? { features: catCur.names, chart: catCur.type } : null } }; },
    descriptive: function (features, metrics, pcts) {
      if ($("descpanel").hidden) $("descpanel").hidden = false; setMode("num");
      var fs = {}, ms = {}, okF = [], okM = [], bad = [];
      (features || []).forEach(function (f) { fs[String(f).toLowerCase()] = 1; });
      $("featlist").querySelectorAll("input").forEach(function (c) { c.checked = !!fs[c.value.toLowerCase()]; if (c.checked) okF.push(c.value); });
      var names = {}; METRICS.forEach(function (m) { names[m[0]] = m[0]; names[m[1].toLowerCase()] = m[0]; });
      (metrics || []).forEach(function (m) { var k = names[String(m).toLowerCase()] || names[String(m).toLowerCase().replace(/ .*/, "")]; if (k) ms[k] = 1; else bad.push(m); });
      $("metlist").querySelectorAll("input").forEach(function (c) { c.checked = !!ms[c.value]; if (c.checked) okM.push(c.value); });
      $("pctin").value = (pcts || []).join(", "); countSel(); apply();
      if (!last || !okF.length) throw new Error("No matching numerical features. Available: " + ds.num.map(function (c) { return c.name; }).join(", "));
      return { applied_features: okF, applied_metrics: okM.concat((pcts || []).map(function (p) { return "P" + p; })), unknown: bad,
        table: last.rows.map(function (r) { var o = { feature: r.name }; r.vals.forEach(function (v, j) { o[last.cols[j].label] = Math.round(v * 1000) / 1000; }); return o; }) }; },
    frequencies: function (features, chart) {
      if ($("descpanel").hidden) $("descpanel").hidden = false; setMode("cat");
      var fs = {}; (features || []).forEach(function (f) { fs[String(f).toLowerCase()] = 1; }); var ok = [];
      $("catlist").querySelectorAll("input").forEach(function (c) { c.checked = !!fs[c.value.toLowerCase()]; if (c.checked) ok.push(c.value); });
      if (!ok.length) throw new Error("No matching categorical features. Available: " + (ds.cat || []).map(function (c) { return c.name; }).join(", "));
      catType = ["bar", "pie", "donut"].indexOf(chart) >= 0 ? chart : catType; catCount(); showFreq();
      return { shown: ok, chart: catType }; },
    quality: function (view) { dqMode = view === "outliers" ? "out" : "miss"; renderDQ(); $("quality").scrollIntoView({ behavior: "smooth", block: "start" }); return { shown: dqMode === "out" ? "outliers" : "missing values" }; },
    nbName: function () { return nbName(); }
  };
  window.HRHero = { dlNotebook: function () { loadTarget = "download"; var n = notebook(cells()); loadTarget = "drive"; return n; }, apply: apply, report: function () { return report(); }, slides: function () { return slides(); }, notebook: function () { return notebook(cells()); }, xlsx: function () { return PZ.xlsx(ds.head, ds.rows); } };
})();
