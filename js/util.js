import { t } from "./i18n.js?v=20261126230710";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function toast(msg, type = "success") {
  const box = document.getElementById("toastBox");
  const div = document.createElement("div");
  div.className = `alert alert-${type} shadow-sm mb-2`;
  div.textContent = msg;
  box.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

let modal, submitHandler, allowSubmit = true;
let previewMode = false;
export const setPreviewMode = (v) => { previewMode = v; };
export const isPreview = () => previewMode;
function modalEls() {
  const el = document.getElementById("appModal");
  if (!modal) {
    modal = new window.bootstrap.Modal(el);
    document.getElementById("appModalForm").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!submitHandler) return;
      if (!allowSubmit) {
        const e = document.getElementById("appModalError");
        e.textContent = t("preview_readonly");
        e.classList.remove("d-none");
        return;
      }
      const btn = document.getElementById("appModalSubmit");
      const err = document.getElementById("appModalError");
      btn.disabled = true;
      err.classList.add("d-none");
      try {
        const keepOpen = (await submitHandler(ev.target)) === false;
        if (!keepOpen) modal.hide();
      } catch (e) {
        console.error(e);
        err.textContent = e.userMessage || t("err_generic");
        err.classList.remove("d-none");
      } finally {
        btn.disabled = false;
      }
    });
  }
  return el;
}

// يفتح نافذة فيها فورم. onSubmit(form) لو رجّعت false النافذة تفضل مفتوحة
export function openModal(title, bodyHtml, onSubmit, { submitLabel, danger = false, size = "lg", allowInPreview = false } = {}) {
  modalEls();
  allowSubmit = !previewMode || allowInPreview;
  document.getElementById("appModalDialog").className = `modal-dialog modal-dialog-scrollable modal-${size}`;
  document.getElementById("appModalTitle").textContent = title;
  document.getElementById("appModalBody").innerHTML = `<div id="appModalError" class="alert alert-danger d-none"></div>${bodyHtml}`;
  const btn = document.getElementById("appModalSubmit");
  btn.textContent = submitLabel || t("save");
  btn.className = `btn ${danger ? "btn-danger" : "btn-brand"}`;
  submitHandler = onSubmit;
  modal.show();
  return document.getElementById("appModalBody");
}

export function confirmBox(message, { danger = true, label } = {}) {
  if (previewMode) { toast(t("preview_readonly"), "warning"); return Promise.resolve(false); }
  return new Promise((resolve) => {
    let done = false;
    openModal(t("confirm"), `<p class="mb-0">${esc(message)}</p>`, () => { done = true; resolve(true); }, { submitLabel: label || t("confirm"), danger, size: "md" });
    document.getElementById("appModal").addEventListener("hidden.bs.modal", () => { if (!done) resolve(false); }, { once: true });
  });
}

export class UserError extends Error {
  constructor(key) { super(key); this.userMessage = t(key); }
}

export const formData = (form) => Object.fromEntries(new FormData(form).entries());
