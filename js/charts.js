/* ============================================================
   charts.js — mini gráficos SVG (sem dependências externas)
   Namespace global: window.Charts
   ============================================================ */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#1f7a4d", "#0ea5a5", "#d97706", "#2563eb", "#9333ea", "#64766c"];

  function svgEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    return n;
  }

  /** Gráfico de rosca (donut) com legenda. data: [{label, value}] */
  function donut(data, opts) {
    opts = opts || {};
    const size = opts.size || 168;
    const stroke = opts.stroke || 26;
    const r = (size - stroke) / 2;
    const cx = size / 2, cy = size / 2;
    const total = data.reduce((s, d) => s + d.value, 0);

    const wrap = Utils.el("div", { class: "row", style: "gap:20px; align-items:center; flex-wrap:wrap;" });
    const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: "chart-svg", style: `flex-shrink:0; width:${size}px; height:${size}px;` });
    svg.style.stroke = "none";

    if (total === 0) {
      svg.appendChild(svgEl("circle", { cx, cy, r, fill: "none", stroke: "#e3e8e5", "stroke-width": stroke }));
    } else {
      let offset = 0;
      const circumference = 2 * Math.PI * r;
      data.forEach((d, i) => {
        if (d.value <= 0) return;
        const frac = d.value / total;
        const dash = frac * circumference;
        const circle = svgEl("circle", {
          cx, cy, r, fill: "none",
          stroke: d.color || PALETTE[i % PALETTE.length],
          "stroke-width": stroke,
          "stroke-dasharray": `${dash} ${circumference - dash}`,
          "stroke-dashoffset": -offset,
          transform: `rotate(-90 ${cx} ${cy})`,
        });
        svg.appendChild(circle);
        offset += dash;
      });
    }
    const centerText = svgEl("text", { x: cx, y: cy - 3, "text-anchor": "middle", "font-size": "22", "font-weight": "700", fill: "#1e2b25" });
    centerText.textContent = total;
    const centerLabel = svgEl("text", { x: cx, y: cy + 16, "text-anchor": "middle", "font-size": "10.5", fill: "#64766c" });
    centerLabel.textContent = opts.centerLabel || "total";
    svg.appendChild(centerText);
    svg.appendChild(centerLabel);

    const legend = Utils.el("div", { class: "chart-legend", style: "flex:1; min-width:140px;" });
    data.forEach((d, i) => {
      const color = d.color || PALETTE[i % PALETTE.length];
      const row = Utils.el("div", { class: "legend-item" }, [
        Utils.el("span", { class: "legend-swatch", style: `background:${color}` }),
        Utils.el("span", { class: "lbl" }, [d.label]),
        Utils.el("span", { class: "val" }, [String(d.value)]),
      ]);
      legend.appendChild(row);
    });

    wrap.appendChild(svg);
    wrap.appendChild(legend);
    return wrap;
  }

  /** Gráfico de barras horizontais. data: [{label, value}] */
  function barsHorizontal(data, opts) {
    opts = opts || {};
    const max = Math.max(1, ...data.map((d) => d.value));
    const wrap = Utils.el("div", { class: "stack", style: "gap:12px;" });
    data.forEach((d, i) => {
      const pct = Math.max(2, (d.value / max) * 100);
      const row = Utils.el("div", {}, []);
      row.appendChild(Utils.el("div", { class: "row-between small", style: "margin-bottom:5px;" }, [
        Utils.el("span", { class: "muted" }, [d.label]),
        Utils.el("strong", {}, [Utils.fmtNumber(d.value, opts.decimals || 0)]),
      ]));
      const track = Utils.el("div", { style: "background:#eef2ef; border-radius:8px; height:10px; overflow:hidden;" });
      const fill = Utils.el("div", { style: `background:${(opts.colors && opts.colors[i]) || PALETTE[i % PALETTE.length]}; width:${pct}%; height:100%; border-radius:8px; transition:width .3s;` });
      track.appendChild(fill);
      row.appendChild(track);
      wrap.appendChild(row);
    });
    if (data.length === 0) {
      wrap.appendChild(Utils.el("p", { class: "muted small" }, ["Sem dados suficientes ainda."]));
    }
    return wrap;
  }

  window.Charts = { donut, barsHorizontal, PALETTE };
})();
