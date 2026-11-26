// Static server for the Data Science Academy site (Railway)
const http = require("http"), fs = require("fs"), path = require("path"), zlib = require("zlib");
const ROOT = __dirname, PORT = process.env.PORT || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".csv": "text/csv; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/health") { res.writeHead(200); return res.end("ok"); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || path.basename(file) === "server.js" || path.basename(file) === "package.json") { res.writeHead(404); return res.end("Not found"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    const headers = { "Content-Type": type, "Cache-Control": /\.(html|js|css)$/.test(p) || p === "/" ? "no-cache" : "public, max-age=3600", "X-Content-Type-Options": "nosniff" };
    if (/gzip/.test(req.headers["accept-encoding"] || "") && /text|javascript|json|svg|csv/.test(type)) {
      return zlib.gzip(data, (e, z) => { res.writeHead(200, Object.assign(headers, { "Content-Encoding": "gzip" })); res.end(z); });
    }
    res.writeHead(200, headers); res.end(data);
  });
}).listen(PORT, () => console.log("Site on port " + PORT));
