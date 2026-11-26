(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  if (!$("report") || !window.HRSite) return;
  var SITE = window.HRSite, PZ = window.HRPdfZip, NS = "http://www.w3.org/2000/svg";
  var KEY = "dsa-report-v1", items = [], seq = 1, on = false, sampleP = null, dl = null;
  if (window.claude && window.claude.use) window.claude.use("downloads").then(function (d) { dl = d; }).catch(function () {});
  function el(tag, attrs, text) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (text != null) e.textContent = text; return e; }
  function txt(n) { return (n && (n.innerText || n.textContent) || "").replace(/\s+/g, " ").trim(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ items: items, seq: seq })); } catch (x) {} }
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && o.items) { items = o.items; seq = o.seq || items.length + 1; } } catch (x) {} }

  // ---------- capture helpers ----------
  function inlineSvg(svg) { var c = svg.cloneNode(true), src = svg.querySelectorAll("*"), dst = c.querySelectorAll("*");
    for (var i = 0; i < src.length; i++) { var cs = getComputedStyle(src[i]);
      if (src[i].tagName === "text") { dst[i].setAttribute("font-size", cs.fontSize); dst[i].setAttribute("font-family", "Helvetica, Arial, sans-serif"); dst[i].setAttribute("font-weight", cs.fontWeight); if (!dst[i].getAttribute("fill")) dst[i].setAttribute("fill", cs.fill); }
      if (src[i].tagName === "title") dst[i].remove(); }
    var vb = (svg.getAttribute("viewBox") || "0 0 440 250").split(/\s+/).map(Number); c.setAttribute("xmlns", NS); c.setAttribute("width", vb[2]); c.setAttribute("height", vb[3]); c.removeAttribute("class");
    return new XMLSerializer().serializeToString(c); }
  function barSvg(rows, opt) { opt = opt || {}; var W = 520, rh = 22, H = Math.max(80, rows.length * rh + 20), L = 170, mx = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
    var s = "<svg xmlns='" + NS + "' viewBox='0 0 " + W + " " + H + "' width='" + W + "' height='" + H + "'>";
    rows.forEach(function (r, i) { var y = 10 + i * rh, w = (W - L - 90) * r.v / mx;
      s += "<text x='" + (L - 8) + "' y='" + (y + 14) + "' text-anchor='end' font-size='12' font-family='Helvetica, Arial, sans-serif' fill='#2E2E38'>" + esc(r.k.length > 24 ? r.k.slice(0, 23) + "…" : r.k) + "</text>";
      s += "<rect x='" + L + "' y='" + (y + 3) + "' width='" + Math.max(2, w).toFixed(1) + "' height='15' rx='2' fill='" + (opt.color || "#2E2E38") + "'/>";
      s += "<text x='" + (L + w + 6).toFixed(1) + "' y='" + (y + 14) + "' font-size='11' font-family='Helvetica, Arial, sans-serif' fill='#2E2E38'>" + esc(r.label) + "</text>"; });
    return s + "</svg>"; }
  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;"); }
  function tableOf(t, maxRows) { if (!t) return null; var head = [].slice.call(t.querySelectorAll("thead th, tr:first-child th")).map(txt), rows = [];
    t.querySelectorAll("tbody tr, tr").forEach(function (tr) { var c = [].slice.call(tr.querySelectorAll("td")).map(txt); if (c.length) rows.push(c); });
    if (!head.length && rows.length) head = rows.shift(); return { head: head, rows: rows.slice(0, maxRows || 40) }; }
  function summaryOf(it) { var s = it.title + (it.sub ? " (" + it.sub + ")" : "") + "\n";
    if (it.table) { s += it.table.head.join(" | ") + "\n" + it.table.rows.slice(0, 30).map(function (r) { return r.join(" | "); }).join("\n") + "\n"; }
    if (it.stats) s += it.stats + "\n"; if (it.note) s += it.note + "\n"; return s.slice(0, 6000); }

  // ---------- add-to-report buttons ----------
  function addBtn(host, make) { if (!host || host.querySelector(":scope > .addrep")) return; var b = el("button", { type: "button", class: "addrep" }, "+ Add to report");
    b.addEventListener("click", function () { var it = make(); if (!it) return; it.id = seq++; it.dataset = SITE.dsName(); it.added = Date.now(); items.push(it); save(); draw(); b.textContent = "✓ Added"; b.classList.add("done"); setTimeout(function () { b.textContent = "+ Add to report"; b.classList.remove("done"); }, 1600); });
    host.appendChild(b); }
  function scan() {
    var dh = document.querySelector("#descout .dohead"); if (dh) addBtn(dh, function () { var t = tableOf(document.querySelector("#descout table"), 40);
      return { kind: "desc", title: "Descriptive statistics", sub: txt(dh.querySelector("h2")), table: t, note: [].slice.call(document.querySelectorAll("#descout .doins > div")).map(txt).join(" ") }; });
    document.querySelectorAll("#catout .fcard").forEach(function (card) { addBtn(card.querySelector(".fch"), function () {
      var t = tableOf(card.querySelector(".ftab"), 40), svg = card.querySelector(".cch svg"), sv;
      if (svg) { sv = inlineSvg(svg); var lis = [].slice.call(card.querySelectorAll(".plg li"));
        if (lis.length) { var inner = sv.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, ""), lg = "";
          lis.forEach(function (li, k) { var y = 24 + k * 24, col = li.querySelector("i").style.background || "#888";
            lg += "<rect x='250' y='" + (y - 11) + "' width='12' height='12' rx='2' fill='" + esc(col) + "'/><text x='270' y='" + y + "' font-size='13' font-family='Helvetica, Arial, sans-serif' fill='#2E2E38'>" + esc(txt(li.querySelector(".pk")).slice(0, 26)) + "</text>"
              + "<text x='470' y='" + y + "' text-anchor='end' font-size='13' font-weight='700' font-family='Helvetica, Arial, sans-serif' fill='#2E2E38'>" + esc(txt(li.querySelector("b"))) + "</text>"
              + "<text x='520' y='" + y + "' text-anchor='end' font-size='12' font-family='Helvetica, Arial, sans-serif' fill='#747480'>" + esc(txt(li.querySelector(".pv"))) + "</text>"; });
          var H2 = Math.max(220, 30 + lis.length * 24); sv = "<svg xmlns='" + NS + "' viewBox='0 0 530 " + H2 + "' width='530' height='" + H2 + "'><g transform='translate(0," + ((H2 - 220) / 2) + ")'>" + inner + "</g>" + lg + "</svg>"; } }
      else sv = barSvg([].slice.call(card.querySelectorAll(".cbr")).map(function (r) { var v = txt(r.querySelector(".cbv")); return { k: txt(r.querySelector(".cbn")), v: Number(v.split(" ")[0].replace(/,/g, "")), label: v }; }));
      return { kind: "freq", title: "Frequencies · " + txt(card.querySelector("h3")), sub: txt(card.querySelector(".fch p")), table: t, svg: sv }; }); });
    document.querySelectorAll(".dscard").forEach(function (card) { addBtn(card.querySelector(".dsch"), function () {
      return { kind: "dist", title: txt(card.querySelector(".dsch span")) + " · " + txt(card.querySelector(".dsch b")), sub: "", svg: inlineSvg(card.querySelector("svg")), stats: txt(card.querySelector(".dsst")), note: txt(card.querySelector(".dskey")) + " " + txt(card.querySelector("svg text.dsax")) }; }); });
    var dq = document.querySelector("#quality .dqtabs"); if (dq) addBtn(dq, function () { var miss = $("dq-miss").classList.contains("on"), body = $("dqbody"), sum = [].slice.call(body.querySelectorAll(".dqsum > div")).map(txt).join(" · ");
      if (miss) { var rows = [].slice.call(body.querySelectorAll(".sbr:not(.ok)")).map(function (r) { var n = txt(r.querySelector(".lms")); return { k: txt(r.querySelector(".sbn")), v: Number(n.replace(/,/g, "")), label: n + " · " + txt(r.querySelector(".sbv")) }; });
        return { kind: "dqm", title: "Data quality · Missing values", sub: sum, svg: rows.length ? barSvg(rows, { color: "#E0362C" }) : null, table: { head: ["Column", "Missing"], rows: rows.map(function (r) { return [r.k, r.label]; }) }, note: rows.length ? "" : "No missing values in any column." }; }
      return { kind: "dqo", title: "Data quality · Outliers (IQR and z-score)", sub: sum, table: tableOf(body.querySelector("table.ot"), 60), note: txt(body.querySelector(".dqfoot")) }; });
  }
  var mo = new MutationObserver(function () { if (on) scan(); });
  ["descout", "catout", "dqbody", "dsgrid"].forEach(function (id) { var n = $(id); if (n) mo.observe(n, { childList: true, subtree: true }); });
  document.querySelectorAll(".dsgrid").forEach(function (n) { mo.observe(n, { childList: true }); });

  function setOn(v) { on = v; document.body.classList.toggle("reporting", on); $("rep-toggle").setAttribute("aria-pressed", on ? "true" : "false"); $("rep-toggle").textContent = on ? "Reporting: on" : "Create report"; $("rep-link").hidden = !on && !items.length; if (on) scan(); try { localStorage.setItem(KEY + "-on", on ? "1" : ""); } catch (x) {} }
  $("rep-toggle").addEventListener("click", function () { setOn(!on); });

  // ---------- insights ----------
  function num(s, key) { var m = new RegExp(key + "\\s+(-?[\\d,.]+)").exec(s || ""); return m ? Number(m[1].replace(/,/g, "")) : null; }
  function ruleInsight(it, mode) { var head = it.title, pts = [];
    if (it.kind === "desc" && it.table) { var h = it.table.head, iM = h.indexOf("Mean"), iMd = h.indexOf("Median"), iS = h.indexOf("Skewness");
      it.table.rows.slice(0, 6).forEach(function (r) { var nm = r[0], m = iM > 0 ? r[iM] : null, md = iMd > 0 ? r[iMd] : null, sk = iS > 0 ? Number(r[iS]) : null;
        var p = nm + ": mean " + (m || "–") + (md ? ", median " + md : ""); if (sk != null && !isNaN(sk)) p += Math.abs(sk) > 1 ? ", strongly " + (sk > 0 ? "right" : "left") + "-skewed (" + sk + ")" : Math.abs(sk) > .5 ? ", moderately skewed (" + sk + ")" : ", roughly symmetric"; pts.push(p + "."); });
      head = "Descriptive statistics for " + it.table.rows.length + " features" + (it.note ? "" : ""); if (it.note) pts.push(it.note); }
    else if (it.kind === "freq" && it.table) { var rs = it.table.rows.filter(function (r) { return r[0] !== "Total"; }).map(function (r) { return { k: r[0], n: Number(String(r[1]).replace(/,/g, "")), p: Number(r[2]) }; }).sort(function (a, b) { return b.n - a.n; });
      var f = it.title.replace("Frequencies · ", ""); if (rs.length) { head = f + ": " + rs[0].k + " dominates with " + rs[0].p.toFixed(1) + "%";
        pts.push(rs.length + " categories; the largest is " + rs[0].k + " (" + rs[0].n.toLocaleString("en-US") + ", " + rs[0].p.toFixed(1) + "%).");
        if (rs.length > 1) pts.push("The smallest is " + rs[rs.length - 1].k + " (" + rs[rs.length - 1].p.toFixed(1) + "%), so groups are " + (rs[0].p / Math.max(.1, rs[rs.length - 1].p) > 5 ? "very unbalanced" : "fairly balanced") + ".");
        if (rs.length > 2) pts.push("The top two categories together cover " + (rs[0].p + rs[1].p).toFixed(1) + "% of values."); } }
    else if (it.kind === "dist") { var sk2 = num(it.stats, "skew"), ku = num(it.stats, "kurt"), mean = num(it.stats, "mean"), med = num(it.stats, "median"), f2 = it.title.split(" · ").pop();
      var shape = sk2 == null ? "" : Math.abs(sk2) < .5 ? "roughly symmetric" : (Math.abs(sk2) < 1 ? "moderately " : "strongly ") + (sk2 > 0 ? "right-skewed (a long tail of high values)" : "left-skewed (a long tail of low values)");
      head = f2 + " is " + (shape || "described below"); if (mean != null && med != null) pts.push("Mean " + mean.toLocaleString("en-US") + " vs median " + med.toLocaleString("en-US") + ": " + (mean > med ? "the mean is pulled up by high values." : mean < med ? "the mean is pulled down by low values." : "they match."));
      if (ku != null) pts.push("Excess kurtosis " + ku + ": " + (ku > 1 ? "heavier tails than normal, so extreme values are more common." : ku < -1 ? "flatter than normal, values are spread evenly." : "tails close to a normal distribution."));
      var o = /(\d+) IQR outliers/.exec(it.note || ""); if (o) pts.push(o[1] + " values fall outside 1.5 × IQR."); }
    else if (it.kind === "dqm") { head = it.table && it.table.rows.length ? it.table.rows.length + " columns have missing values" : "No missing values"; pts.push(it.sub || ""); if (it.table) it.table.rows.slice(0, 3).forEach(function (r) { pts.push(r[0] + ": " + r[1] + "."); }); }
    else if (it.kind === "dqo" && it.table) { var rr = it.table.rows.map(function (r) { return { k: r[0], i: Number(String(r[1]).split(" ")[0].replace(/,/g, "")), z: Number(String(r[2]).split(" ")[0].replace(/,/g, "")) }; });
      var bi = rr.slice().sort(function (a, b) { return b.i - a.i; }); head = "Outliers: " + (bi[0] && bi[0].i ? bi[0].k + " has the most (" + bi[0].i + " by IQR)" : "none found");
      pts.push(rr.filter(function (r) { return r.i; }).length + " of " + rr.length + " features have IQR outliers; " + rr.filter(function (r) { return r.z; }).length + " have |z| > 3 values.");
      pts.push("The z-score rule flags fewer points on skewed features because a long tail inflates the standard deviation."); }
    pts = pts.filter(Boolean);
    return mode === "slide" ? { headline: head, bullets: pts.slice(0, 3) } : { text: head + ". " + pts.join(" ") };
  }
  function claudeInsight(it, mode) {
    return (sampleP || (sampleP = window.claude && window.claude.use ? window.claude.use("sample") : Promise.resolve(null))).then(function (S) {
      if (!S) return null;
      var base = "You are a data analyst writing for a Statistics and Machine Learning class report. Data set: " + (it.dataset || "") + ".\nAnalysis result:\n" + summaryOf(it) + "\n";
      if (mode === "slide") return S.json(base + "Write a slide insight. Reply with only JSON: {\"headline\": string (max 12 words, states the finding), \"bullets\": [2 or 3 short strings, max 18 words each, with numbers from the result]}.", { cache: false })
        .then(function (o) { return { headline: String(o.headline || it.title), bullets: (o.bullets || []).map(String).slice(0, 3) }; });
      return S(base + "Write a detailed interpretation for a written report: 120–180 words, plain text, no headings or lists. Explain what the numbers show, what it means in practice, and one caution or next step. Use only the numbers above.", { cache: false })
        .then(function (r) { return { text: r.text.trim() }; });
    }).catch(function (e) { if (e && (e.code === "not_granted" || e.code === "sampling_disabled")) return null; throw e; });
  }

  // ---------- report view ----------
  function svgUrl(s) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s); }
  function draw() { var box = $("repitems"), n = items.length; box.textContent = ""; $("rep-link").textContent = "Report (" + n + ")"; $("rep-link").hidden = !on && !n;
    $("repempty").hidden = !!n; $("repdl").hidden = !n; $("repcount").textContent = n ? n + " analys" + (n > 1 ? "es" : "is") + " in this report" : "";
    items.forEach(function (it, i) { var c = el("article", { class: "repc" }), h = el("div", { class: "reph" });
      var t = el("div"); t.appendChild(el("p", { class: "repn" }, String(i + 1).padStart(2, "0") + " · " + (it.dataset || ""))); t.appendChild(el("h3", null, it.title)); if (it.sub) t.appendChild(el("p", { class: "reps" }, it.sub)); h.appendChild(t);
      var acts = el("div", { class: "repa" }), gb = el("button", { type: "button", class: "btn sm" }, it.insight ? "Regenerate insight" : "Generate insight"), rb = el("button", { type: "button", class: "btn sm ghost" }, "Remove");
      rb.addEventListener("click", function () { items.splice(items.indexOf(it), 1); save(); draw(); });
      var pick = el("div", { class: "reppick", hidden: "" }); pick.appendChild(el("span", null, "Insight for:"));
      [["slide", "Slide"], ["report", "Report"]].forEach(function (m) { var b = el("button", { type: "button", class: "btn sm" }, m[1]); b.addEventListener("click", function () { pick.hidden = true; gen(it, m[0], c); }); pick.appendChild(b); });
      gb.addEventListener("click", function () { pick.hidden = !pick.hidden; }); acts.appendChild(gb); acts.appendChild(rb); h.appendChild(acts); c.appendChild(h); c.appendChild(pick);
      var body = el("div", { class: "repb" + (it.svg ? "" : " nochart") });
      if (it.svg) { var im = el("img", { alt: it.title + " chart" }); im.src = svgUrl(it.svg); body.appendChild(im); }
      if (it.table && it.table.rows.length) { var tw = el("div", { class: "rept" }), tb = el("table"), tr = el("tr"); it.table.head.forEach(function (x) { tr.appendChild(el("th", null, x)); }); tb.appendChild(tr);
        it.table.rows.slice(0, 15).forEach(function (r) { var row = el("tr"); r.forEach(function (x) { row.appendChild(el("td", null, x)); }); tb.appendChild(row); }); tw.appendChild(tb); if (it.table.rows.length > 15) tw.appendChild(el("p", { class: "reps" }, "+ " + (it.table.rows.length - 15) + " more rows in the downloads")); body.appendChild(tw); }
      else if (it.stats) body.appendChild(el("p", { class: "reps" }, it.stats));
      c.appendChild(body);
      var ins = el("div", { class: "repi" + (it.insight ? "" : " empty") });
      if (it.insight) { ins.appendChild(el("p", { class: "repik" }, it.insight.mode === "slide" ? "SLIDE INSIGHT" : "REPORT INSIGHT") );
        if (it.insight.mode === "slide") { var hl = el("input", { type: "text", class: "repih", "aria-label": "Headline" }); hl.value = it.insight.headline || ""; hl.addEventListener("input", function () { it.insight.headline = hl.value; save(); });
          var bl = el("textarea", { class: "repit", rows: "4", "aria-label": "Bullet points, one per line" }); bl.value = (it.insight.bullets || []).join("\n"); bl.addEventListener("input", function () { it.insight.bullets = bl.value.split("\n").filter(function (x) { return x.trim(); }); save(); });
          ins.appendChild(hl); ins.appendChild(bl); }
        else { var ta = el("textarea", { class: "repit", rows: "7", "aria-label": "Report insight" }); ta.value = it.insight.text || ""; ta.addEventListener("input", function () { it.insight.text = ta.value; save(); }); ins.appendChild(ta); }
        ins.appendChild(el("p", { class: "reps" }, (it.insight.by === "claude" ? "Written by Claude" : "Generated from the statistics") + " · you can edit it")); }
      else ins.appendChild(el("p", { class: "reps" }, "No insight yet. Click Generate insight and choose Slide or Report."));
      c.appendChild(ins); box.appendChild(c); }); }
  function gen(it, mode, card) { var st = el("p", { class: "repwait" }, "Writing the " + mode + " insight…"); card.appendChild(st);
    claudeInsight(it, mode).then(function (r) { var by = "claude"; if (!r) { r = ruleInsight(it, mode); by = "rules"; } r.mode = mode; r.by = by; it.insight = r; save(); draw(); })
      .catch(function (e) { var r = ruleInsight(it, mode); r.mode = mode; r.by = "rules"; it.insight = r; save(); draw(); }); }

  // ---------- downloads ----------
  function jpeg(svgStr, maxW) { return new Promise(function (res) { var img = new Image(); img.onload = function () {
      var sc = Math.min(2.5, (maxW || 1100) / img.width), w = Math.round(img.width * sc), h = Math.round(img.height * sc), cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      var b64 = cv.toDataURL("image/jpeg", 0.9).split(",")[1], bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); res({ d: u, w: w, h: h }); };
    img.onerror = function () { res(null); }; img.src = svgUrl(svgStr); }); }
  function images() { return Promise.all(items.map(function (it) { return it.svg ? jpeg(it.svg) : Promise.resolve(null); })); }
  function insightLines(it) { if (!it.insight) return { head: it.title, bullets: [], text: "" }; return it.insight.mode === "slide" ? { head: it.insight.headline || it.title, bullets: it.insight.bullets || [], text: "" } : { head: it.title, bullets: [], text: it.insight.text || "" }; }
  function table(pdf, x, y, w, t, maxRows, fs) { if (!t || !t.rows.length) return y; var cols = t.head.length || t.rows[0].length, cw = w / cols, rh = fs * 1.7;
    pdf.rect(x, y, w, rh, "#2E2E38"); t.head.forEach(function (hh, j) { pdf.text(x + j * cw + 4, y + rh * .68, hh, fs, { color: "#FFFFFF", bold: true, maxw: cw - 6 }); }); y += rh;
    t.rows.slice(0, maxRows).forEach(function (r, i) { if (i % 2) pdf.rect(x, y, w, rh, "#F4F4F8"); r.forEach(function (v, j) { pdf.text(x + j * cw + 4, y + rh * .68, v, fs, { maxw: cw - 6 }); }); y += rh; }); return y; }
  function reportPdf(imgs) { var P = new PZ.PDF(595, 842), INK = "#2E2E38", Y = "#FFE600", G = "#747480", ds = items[0] && items[0].dataset || "";
    P.page("#1A1A24"); P.rect(48, 300, 60, 8, Y); P.text(48, 270, "DATA SCIENCE ACADEMY · STATISTICS AND MACHINE LEARNING", 9, { color: "#A0A0AE", bold: true });
    P.text(48, 350, "Analysis report", 34, { color: "#FFFFFF", bold: true }); P.text(48, 385, ds, 16, { color: Y }); P.text(48, 410, items.length + " analyses · " + new Date().toLocaleDateString("en-GB"), 11, { color: "#C4C4CD" });
    var y = 0; function np() { P.page(); P.rect(0, 0, 595, 6, Y); P.text(48, 820, "Data Science Academy · " + ds, 8, { color: G }); y = 50; }
    items.forEach(function (it, i) { var L = insightLines(it), im = imgs[i]; np();
      P.text(48, y, String(i + 1).padStart(2, "0"), 11, { color: G, bold: true }); P.text(76, y, it.title, 16, { bold: true, maxw: 470 }); y += 18; if (it.sub) { P.text(76, y, it.sub, 9, { color: G, maxw: 470 }); y += 14; } y += 8;
      if (L.text) { y = P.wrap(48, y, L.text, 10.5, 499, 15); y += 8; }
      if (L.bullets.length) { P.text(48, y, L.head, 12, { bold: true, maxw: 499 }); y += 18; L.bullets.forEach(function (b) { P.rect(48, y - 6, 4, 4, INK); y = P.wrap(58, y, b, 10.5, 489, 14); y += 2; }); y += 8; }
      if (im) { var w = 499, h = w * im.h / im.w; if (h > 330) { h = 330; w = h * im.w / im.h; } P.image(48, y, w, h, im.d, im.w, im.h); y += h + 14; }
      if (it.table && it.table.rows.length) { var room = Math.floor((800 - y) / 14) - 1; if (room < 4) { np(); room = 50; } y = table(P, 48, y, 499, it.table, Math.min(room, it.table.rows.length), 7.5); }
      if (!it.insight) P.text(48, 800, "No insight generated for this analysis.", 8, { color: G }); });
    return P.output(); }
  function slidesPdf(imgs) { var P = new PZ.PDF(960, 540), INK = "#2E2E38", Y = "#FFE600", G = "#747480", ds = items[0] && items[0].dataset || "";
    P.page("#1A1A24"); P.rect(60, 250, 80, 8, Y); P.text(60, 200, "DATA SCIENCE ACADEMY", 12, { color: "#A0A0AE", bold: true }); P.text(60, 310, "Analysis findings", 44, { color: "#FFFFFF", bold: true }); P.text(60, 350, ds + " · " + items.length + " analyses", 16, { color: Y });
    items.forEach(function (it, i) { var L = insightLines(it), im = imgs[i]; P.page(); P.rect(0, 0, 960, 8, Y);
      P.text(60, 56, String(i + 1).padStart(2, "0") + " · " + it.title, 11, { color: G, bold: true, maxw: 840 }); var y = P.wrap(60, 96, L.head, 26, 840, 32, { bold: true }) + 10;
      var left = im || (it.table && it.table.rows.length) ? 330 : 840;
      if (L.bullets.length || L.text) { var yy = y; (L.bullets.length ? L.bullets : [L.text.slice(0, 420)]).forEach(function (b) { P.rect(60, yy - 8, 6, 6, Y); yy = P.wrap(76, yy, b, 13, left - 16, 19); yy += 8; }); }
      else P.text(60, y + 10, "Add an insight for this slide in the report page.", 12, { color: G });
      var x0 = L.bullets.length || L.text ? 420 : 60, wv = 960 - x0 - 60;
      if (im) { var w = wv, h = w * im.h / im.w; if (h > 540 - y - 50) { h = 540 - y - 50; w = h * im.w / im.h; } P.image(x0, y, w, h, im.d, im.w, im.h); }
      else if (it.table) table(P, x0, y, wv, it.table, Math.min(14, it.table.rows.length), 9);
      P.text(60, 520, "Data Science Academy · " + ds, 9, { color: G }); P.text(900, 520, String(i + 2), 9, { color: G, align: "right" }); });
    return P.output(); }
  function download(name, bytes) { var msg = $("repmsg");
    if (dl) return dl.save({ filename: name, data: new Blob([bytes], { type: "application/pdf" }) }).then(function () { msg.textContent = "Saved " + name; }, function (e) { msg.textContent = e && e.code === "declined" ? "Download cancelled." : "Could not save here."; });
    var u = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), a = el("a", { href: u, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); msg.textContent = "Downloaded " + name; }
  $("rep-pdf").addEventListener("click", function () { if (!items.length) return; $("repmsg").textContent = "Building the report…"; images().then(function (im) { download("DSA_report.pdf", reportPdf(im)); }); });
  $("rep-slides").addEventListener("click", function () { if (!items.length) return; $("repmsg").textContent = "Building the slides…"; images().then(function (im) { download("DSA_slides.pdf", slidesPdf(im)); }); });
  $("rep-clear").addEventListener("click", function () { if (!items.length) return; items = []; save(); draw(); $("repmsg").textContent = "Report cleared."; });

  // ---------- page mode ----------
  function mode() { var r = location.hash === "#report"; document.body.classList.toggle("reportmode", r); if (r) { draw(); window.scrollTo(0, 0); } }
  window.addEventListener("hashchange", mode);
  $("repback").addEventListener("click", function () { history.pushState("", document.title, location.pathname + location.search); mode(); });
  load(); var was = ""; try { was = localStorage.getItem(KEY + "-on") || ""; } catch (x) {} setOn(!!was); draw(); mode();
  window.HRReport = { items: function () { return items; }, reportPdf: function () { return images().then(reportPdf); }, slidesPdf: function () { return images().then(slidesPdf); }, rule: ruleInsight };
})();
