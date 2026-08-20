/* ============================================================
   server/email.js — envio de e-mails transacionais via Resend (HTTP API)
   Não usa nenhum SDK externo: só `fetch`, nativo do Node 18+.
   ============================================================ */
"use strict";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "Calculadora Biomassa & Lightwall <onboarding@resend.dev>";

if (!RESEND_API_KEY) {
  console.warn("[email] RESEND_API_KEY não configurada — e-mails de ativação/convite não serão enviados.");
}

/** Envia um e-mail via Resend. Lança erro se a API responder com falha —
 *  quem chama decide se isso deve bloquear a operação ou só avisar o admin. */
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    throw new Error("Serviço de e-mail não configurado (RESEND_API_KEY ausente).");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = JSON.stringify(await res.json()); } catch (e) { /* ignore */ }
    throw new Error(`Falha ao enviar e-mail (${res.status}): ${detail}`);
  }
  return res.json();
}

const ROLE_LABEL = { master: "Master (Gestor)", basico: "Básico (Colaborador)" };
const ACTIVATION_TTL_TEXT = "48 horas";

function buildActivationEmailHtml({ name, email, role, link }) {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color:#1e2b25;">
    <div style="background:#14532d; padding:20px 24px; border-radius:12px 12px 0 0;">
      <span style="color:#fff; font-size:18px; font-weight:bold;">Biomassa &amp; Lightwall</span>
    </div>
    <div style="border:1px solid #e3e8e5; border-top:none; padding:28px 24px; border-radius:0 0 12px 12px;">
      <h2 style="font-size:18px; margin:0 0 12px;">Seu usuário foi criado.</h2>
      <p style="font-size:14px; line-height:1.6; margin:0 0 16px;">
        Olá, <strong>${name}</strong>. Uma conta foi criada para você no sistema de quantitativos
        Biomassa &amp; Lightwall, com os seguintes dados:
      </p>
      <table style="font-size:14px; margin-bottom:20px; width:100%;">
        <tr><td style="color:#64766c; padding:4px 0;">Nome</td><td><strong>${name}</strong></td></tr>
        <tr><td style="color:#64766c; padding:4px 0;">E-mail / login</td><td><strong>${email}</strong></td></tr>
        <tr><td style="color:#64766c; padding:4px 0;">Perfil de acesso</td><td><strong>${ROLE_LABEL[role] || role}</strong></td></tr>
      </table>
      <p style="font-size:14px; line-height:1.6; margin:0 0 20px;">
        Para começar a usar o sistema, crie sua senha clicando no botão abaixo. Este link é
        pessoal, seguro e expira em ${ACTIVATION_TTL_TEXT}.
      </p>
      <div style="text-align:center; margin-bottom:20px;">
        <a href="${link}" style="background:#1f7a4d; color:#fff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:bold; font-size:14px; display:inline-block;">
          Criar minha senha / Ativar minha conta
        </a>
      </div>
      <p style="font-size:12px; color:#8a9a92; line-height:1.5;">
        Se você não esperava este e-mail, pode ignorá-lo com segurança. Se o botão não funcionar,
        copie e cole este link no navegador:<br>
        <span style="word-break:break-all;">${link}</span>
      </p>
    </div>
  </div>`;
}

module.exports = { sendEmail, buildActivationEmailHtml };
