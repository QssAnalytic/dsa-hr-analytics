/* Tiny PDF writer (Helvetica, vector shapes) and ZIP writer (stored) for in-browser exports. */
(function (root) {
  "use strict";
  // ---------- PDF ----------
  var W = { " ": 278, "!": 278, "\"": 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333, "{": 334, "|": 260, "}": 334, "~": 584,
    A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
  function latin(s) { s = String(s).replace(/[–—]/g, "-").replace(/[“”]/g, "\"").replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/·/g, "·").replace(/×/g, "x").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/√/g, "sqrt");
    var o = ""; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); o += c < 256 ? s[i] : "?"; } return o; }
  function tw(s, size, bold) { s = latin(s); var w = 0; for (var i = 0; i < s.length; i++) w += (W[s[i]] || (s[i] >= "0" && s[i] <= "9" ? 556 : 556)); return w * size / 1000 * (bold ? 1.05 : 1); }
  function hex(c) { c = c.replace("#", ""); return [parseInt(c.substr(0, 2), 16) / 255, parseInt(c.substr(2, 2), 16) / 255, parseInt(c.substr(4, 2), 16) / 255].map(function (v) { return v.toFixed(3); }).join(" "); }
  function PDF(w, h) { this.w = w; this.h = h; this.pages = []; this.cur = null; }
  PDF.prototype.page = function (bg) { this.cur = []; this.pages.push(this.cur); if (bg) this.rect(0, 0, this.w, this.h, bg); return this; };
  PDF.prototype.rect = function (x, y, w, h, fill, stroke, lw) {
    var s = ""; if (fill) s += hex(fill) + " rg "; if (stroke) s += hex(stroke) + " RG " + (lw || 1) + " w ";
    s += x.toFixed(2) + " " + (this.h - y - h).toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2) + " re " + (fill && stroke ? "B" : fill ? "f" : "S");
    this.cur.push(s); return this; };
  PDF.prototype.line = function (x1, y1, x2, y2, color, lw, dash) {
    this.cur.push((dash ? "[" + dash + "] 0 d " : "") + hex(color) + " RG " + (lw || 1) + " w " + x1.toFixed(2) + " " + (this.h - y1).toFixed(2) + " m " + x2.toFixed(2) + " " + (this.h - y2).toFixed(2) + " l S" + (dash ? " [] 0 d" : "")); return this; };
  PDF.prototype.poly = function (pts, color, lw) { if (pts.length < 2) return this; var h = this.h, s = hex(color) + " RG " + (lw || 1) + " w " + pts[0][0].toFixed(2) + " " + (h - pts[0][1]).toFixed(2) + " m";
    for (var i = 1; i < pts.length; i++) s += " " + pts[i][0].toFixed(2) + " " + (h - pts[i][1]).toFixed(2) + " l"; this.cur.push(s + " S"); return this; };
  PDF.prototype.text = function (x, y, str, size, opt) { opt = opt || {}; var s = latin(str), f = opt.bold ? "F2" : "F1", wdt = tw(s, size, opt.bold);
    if (opt.maxw && wdt > opt.maxw) { while (s.length > 1 && tw(s + "...", size, opt.bold) > opt.maxw) s = s.slice(0, -1); s += "..."; wdt = tw(s, size, opt.bold); }
    if (opt.align === "right") x -= wdt; else if (opt.align === "center") x -= wdt / 2;
    s = s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    this.cur.push("BT " + hex(opt.color || "#2E2E38") + " rg /" + f + " " + size + " Tf " + x.toFixed(2) + " " + (this.h - y).toFixed(2) + " Td (" + s + ") Tj ET"); return this; };
  PDF.prototype.wrap = function (x, y, str, size, maxw, lh, opt) { var words = String(str).split(" "), line = "", yy = y;
    for (var i = 0; i < words.length; i++) { var t = line ? line + " " + words[i] : words[i]; if (tw(t, size, opt && opt.bold) > maxw && line) { this.text(x, yy, line, size, opt); yy += lh; line = words[i]; } else line = t; }
    if (line) { this.text(x, yy, line, size, opt); yy += lh; } return yy; };
  PDF.prototype.output = function () {
    var objs = [], enc = function (s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
    var n = this.pages.length, fontF1 = 3, fontF2 = 4, first = 5;
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    var kids = []; for (var i = 0; i < n; i++) kids.push((first + i * 2) + " 0 R");
    objs[2] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>";
    objs[fontF1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objs[fontF2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    for (i = 0; i < n; i++) { var c = this.pages[i].join("\n"), pid = first + i * 2;
      objs[pid] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + this.w + " " + this.h + "] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents " + (pid + 1) + " 0 R >>";
      objs[pid + 1] = "<< /Length " + c.length + " >>\nstream\n" + c + "\nendstream"; }
    var out = "%PDF-1.4\n%âãÏÓ\n", offs = [];
    for (i = 1; i < objs.length; i++) { offs[i] = out.length; out += i + " 0 obj\n" + objs[i] + "\nendobj\n"; }
    var x = out.length; out += "xref\n0 " + objs.length + "\n0000000000 65535 f \n";
    for (i = 1; i < objs.length; i++) out += ("0000000000" + offs[i]).slice(-10) + " 00000 n \n";
    out += "trailer\n<< /Size " + objs.length + " /Root 1 0 R >>\nstartxref\n" + x + "\n%%EOF";
    return enc(out);
  };
  // ---------- ZIP (stored) ----------
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) { // files: [{name, data: Uint8Array|string}]
    var te = new TextEncoder(), parts = [], central = [], off = 0;
    files.forEach(function (f) { var d = typeof f.data === "string" ? te.encode(f.data) : f.data, nm = te.encode(f.name), crc = crc32(d);
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), nm, d);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + d.length; });
    var csize = central.reduce(function (s, a) { return s + a.length; }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]), len = all.reduce(function (s, a) { return s + a.length; }, 0), out = new Uint8Array(len), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; }); return out;
  }
  function xlsx(head, rows) { // minimal one-sheet workbook with inline strings
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
    function col(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
    function cell(v, r, c) { var ref = col(c) + r; if (typeof v === "number" && isFinite(v)) return '<c r="' + ref + '"><v>' + v + "</v></c>"; if (v === "" || v == null) return ""; return '<c r="' + ref + '" t="inlineStr"' + (r === 1 ? ' s="1"' : "") + "><is><t>" + esc(v) + "</t></is></c>"; }
    var x = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>'];
    x.push('<row r="1">' + head.map(function (h, c) { return cell(String(h), 1, c); }).join("") + "</row>");
    rows.forEach(function (r, i) { x.push('<row r="' + (i + 2) + '">' + r.map(function (v, c) { return cell(v, i + 2, c); }).join("") + "</row>"); });
    x.push('</sheetData><autoFilter ref="A1:' + col(head.length - 1) + (rows.length + 1) + '"/></worksheet>');
    return zip([
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>' },
      { name: "xl/worksheets/sheet1.xml", data: x.join("") }]);
  }
  var api = { PDF: PDF, zip: zip, xlsx: xlsx, textWidth: tw };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HRPdfZip = api;
})(this);
