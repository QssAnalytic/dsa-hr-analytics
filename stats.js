/* Descriptive statistics engine for the upload report. Works in the browser and in Node. */
(function (root) {
  "use strict";
  function sorted(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function quantile(s, p) { // s sorted, linear interpolation (numpy default)
    var h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (s[hi] - s[lo]) * (h - lo);
  }
  function std(a, m) { var v = 0; for (var i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m); return Math.sqrt(v / (a.length - 1)); }
  function mode(s) { var best = s[0], bc = 0, cur = s[0], c = 0;
    for (var i = 0; i < s.length; i++) { if (s[i] === cur) c++; else { cur = s[i]; c = 1; } if (c > bc) { bc = c; best = cur; } } return best; }
  function skewKurt(a, m) { // bias-corrected, as scipy bias=False; kurtosis = excess (Fisher)
    var n = a.length, m2 = 0, m3 = 0, m4 = 0;
    for (var i = 0; i < n; i++) { var d = a[i] - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
    m2 /= n; m3 /= n; m4 /= n;
    if (m2 === 0) return { skew: 0, kurt: 0 };
    var g1 = m3 / Math.pow(m2, 1.5), g2 = m4 / (m2 * m2) - 3;
    var skew = Math.sqrt(n * (n - 1)) / (n - 2) * g1;
    var kurt = ((n + 1) * g2 + 6) * (n - 1) / ((n - 2) * (n - 3));
    return { skew: skew, kurt: kurt };
  }
  function describe(a) {
    var s = sorted(a), m = mean(a), sd = std(a, m), q1 = quantile(s, .25), q3 = quantile(s, .75), iqr = q3 - q1;
    var lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr, oi = 0, oz = 0;
    for (var i = 0; i < a.length; i++) { if (a[i] < lo || a[i] > hi) oi++; if (sd > 0 && Math.abs((a[i] - m) / sd) > 3) oz++; }
    var sk = skewKurt(a, m), u = {};
    for (var j = 0; j < a.length; j++) u[a[j]] = 1;
    return { n: a.length, min: s[0], max: s[s.length - 1], mean: m, median: quantile(s, .5), mode: mode(s), q1: q1, q3: q3,
      p90: quantile(s, .9), p99: quantile(s, .99), std: sd, skew: sk.skew, kurt: sk.kurt, iqr: iqr, lo: lo, hi: hi,
      outIqr: oi, outZ: oz, nuniq: Object.keys(u).length, sorted: s };
  }
  // ---- normal distribution helpers ----
  function ncdf(x) { // Abramowitz-Stegun via erf (7.1.26 refined with series for accuracy)
    var t = 1 / (1 + 0.5 * Math.abs(x / Math.SQRT2));
    var y = 1 - t * Math.exp(-x * x / 2 - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function nppf(p) { // Acklam's algorithm
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00],
      b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01],
      c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00],
      d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var q, r, pl = 0.02425;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function poly(c, x) { var r = 0; for (var i = c.length - 1; i >= 0; i--) r = r * x + c[i]; return r; }
  // Shapiro–Wilk W and p-value, Royston (1995) algorithm AS R94, n = 3..5000
  function shapiro(xs) {
    var x = sorted(xs), n = x.length;
    if (n < 3) return null;
    if (n > 5000) { var st = []; for (var k = 0; k < 5000; k++) st.push(x[Math.floor(k * n / 5000)]); x = st; n = 5000; }
    var nn2 = Math.floor(n / 2), m = new Array(n), i;
    for (i = 0; i < n; i++) m[i] = nppf((i + 1 - 0.375) / (n + 0.25));
    var summ2 = 0; for (i = 0; i < n; i++) summ2 += m[i] * m[i];
    var ssumm2 = Math.sqrt(summ2), rsn = 1 / Math.sqrt(n), a = new Array(n);
    var c1 = [0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056], c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
    var a1 = -m[0] / ssumm2 + poly(c1, rsn), a2, fac;
    if (n === 3) { a[0] = Math.SQRT1_2; a[n - 1] = -a[0]; }
    else if (n > 5) {
      a2 = -m[1] / ssumm2 + poly(c2, rsn);
      fac = Math.sqrt((summ2 - 2 * m[0] * m[0] - 2 * m[1] * m[1]) / (1 - 2 * a1 * a1 - 2 * a2 * a2));
      a[0] = a1; a[1] = a2;
      for (i = 2; i < nn2; i++) a[i] = -m[i] / fac;
    } else {
      fac = Math.sqrt((summ2 - 2 * m[0] * m[0]) / (1 - 2 * a1 * a1));
      a[0] = a1; for (i = 1; i < nn2; i++) a[i] = -m[i] / fac;
    }
    // coefficients a[0..nn2-1] are for the lower half (positive values); W uses antisymmetry
    var xm = mean(x), ssq = 0; for (i = 0; i < n; i++) ssq += (x[i] - xm) * (x[i] - xm);
    if (ssq === 0) return null;
    var num = 0; for (i = 0; i < nn2; i++) num += a[i] * (x[n - 1 - i] - x[i]);
    var w = num * num / ssq; if (w > 1) w = 1;
    var pw;
    if (n === 3) { pw = Math.max(0, 6 / Math.PI * (Math.asin(Math.sqrt(w)) - Math.asin(Math.sqrt(0.75)))); return { W: w, p: pw }; }
    var w1 = Math.log(1 - w), xx = Math.log(n), mu, sig, gm;
    if (n <= 11) {
      gm = poly([-2.273, 0.459], n);
      if (w1 >= gm) return { W: w, p: 1e-99 };
      w1 = -Math.log(gm - w1);
      mu = poly([0.5440, -0.39978, 0.025054, -6.714e-4], n);
      sig = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
      mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx);
      sig = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx));
    }
    var z = (w1 - mu) / sig;
    pw = ncdf(-z);
    return { W: w, p: Math.max(pw, 0) };
  }
  function kde(s, sd, xs) { // gaussian KDE with Scott bandwidth
    var n = s.length, bw = sd * Math.pow(n, -0.2), out = [];
    for (var j = 0; j < xs.length; j++) { var t = 0; for (var i = 0; i < n; i++) { var u = (xs[j] - s[i]) / bw; t += Math.exp(-0.5 * u * u); } out.push(t / (n * bw * Math.sqrt(2 * Math.PI))); }
    return out;
  }
  var api = { describe: describe, shapiro: shapiro, ncdf: ncdf, nppf: nppf, kde: kde, mean: mean, std: std, quantile: quantile };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HRStats = api;
})(this);
