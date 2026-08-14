/* ============================================================
   utils.js — helpers gerais (formatação, DOM, toast, modal)
   Namespace global: window.Utils
   ============================================================ */
(function () {
  "use strict";

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function fmtNumber(n, decimals) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString("pt-BR", {
      minimumFractionDigits: decimals || 0,
      maximumFractionDigits: decimals || 2,
    });
  }

  function fmtInt(n) {
    return fmtNumber(Math.round(n || 0), 0);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR");
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach((k) => {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach((c) => {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function debounce(fn, wait) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait || 250);
    };
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------------- Toast ----------------
  function toast(message, type) {
    const root = qs("#toast-root");
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.5-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7Z"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2Zm0-4h-2V7h2Z"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2Zm0-8h-2V7h2Z"/></svg>',
    };
    const node = el("div", { class: "toast toast-" + (type || "info") }, []);
    node.innerHTML = (icons[type] || icons.info) + "<span>" + escapeHtml(message) + "</span>";
    root.appendChild(node);
    setTimeout(() => {
      node.style.transition = "opacity .25s, transform .25s";
      node.style.opacity = "0";
      node.style.transform = "translateY(6px)";
      setTimeout(() => node.remove(), 260);
    }, 3200);
  }

  // ---------------- Modal ----------------
  function closeModal() {
    const root = qs("#modal-root");
    root.innerHTML = "";
  }

  function openModal({ title, bodyNode, footerNode, size, onClose }) {
    const root = qs("#modal-root");
    root.innerHTML = "";
    const backdrop = el("div", { class: "modal-backdrop" });
    const box = el("div", { class: "modal-box" + (size === "lg" ? " modal-lg" : "") });
    const header = el("div", { class: "modal-header" }, [
      el("h3", {}, [title || ""]),
      el("button", { class: "icon-btn", "aria-label": "Fechar", onclick: () => { closeModal(); if (onClose) onClose(); } }, [
        (() => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.innerHTML = '<path d="M6 6l12 12M18 6L6 18"/>'; return s; })(),
      ]),
    ]);
    const body = el("div", { class: "modal-body" }, [bodyNode]);
    box.appendChild(header);
    box.appendChild(body);
    if (footerNode) {
      const footer = el("div", { class: "modal-footer" }, [footerNode]);
      box.appendChild(footer);
    }
    backdrop.appendChild(box);
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) { closeModal(); if (onClose) onClose(); }
    });
    root.appendChild(backdrop);
    return { close: closeModal };
  }

  function confirmDialog({ title, message, confirmLabel, danger, onConfirm }) {
    const body = el("p", { class: "muted" }, [message]);
    const footer = el("div", { class: "row" }, []);
    const cancelBtn = el("button", { class: "btn btn-secondary", onclick: () => closeModal() }, ["Cancelar"]);
    const okBtn = el("button", { class: "btn " + (danger ? "btn-danger-solid" : "btn-primary"), onclick: () => { closeModal(); onConfirm(); } }, [confirmLabel || "Confirmar"]);
    footer.appendChild(cancelBtn);
    footer.appendChild(okBtn);
    openModal({ title: title || "Confirmar ação", bodyNode: body, footerNode: footer });
  }

  window.Utils = {
    uid, nowIso, fmtNumber, fmtInt, fmtDate, fmtDateTime,
    el, qs, qsa, debounce, escapeHtml,
    toast, openModal, closeModal, confirmDialog,
  };
})();
