import { Resend } from 'resend';

// Envio de e-mail via Resend. INERTE sem RESEND_API_KEY (no-op) — nada quebra
// se o provedor não estiver configurado. Nunca lança: falha só é logada.
const FROM = process.env.MAIL_FROM || 'Sindicato Rural de Terra Roxa <onboarding@resend.dev>';

let client: Resend | null = null;
function getClient(): Resend | null {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    if (!client) client = new Resend(key);
    return client;
}

function esc(s: string): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function layout(title: string, bodyHtml: string): string {
    return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <div style="background:#1f6e3d;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
        <strong>Sindicato Rural de Terra Roxa</strong>
      </div>
      <div style="border:1px solid #e5e5e5;border-top:0;padding:20px;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>
        ${bodyHtml}
        <p style="margin-top:24px;font-size:12px;color:#777">Este é um e-mail automático — não responda.</p>
      </div>
    </div>`;
}

async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
    const c = getClient();
    if (!c || !opts.to) return;
    try {
        await c.emails.send({ from: FROM,
to: opts.to,
subject: opts.subject,
html: opts.html });
    } catch (e) {
        console.error('[mailer] falha ao enviar e-mail:', e);
    }
}

export function sendRegistrationConfirmation(to: string, name: string, courseTitle: string): void {
    void sendMail({
        to,
        subject: `Inscrição recebida — ${courseTitle}`,
        html: layout('Inscrição recebida', `
          <p>Olá, ${esc(name)}!</p>
          <p>Recebemos sua inscrição no curso <strong>${esc(courseTitle)}</strong>.</p>
          <p>Em breve entraremos em contato com mais informações. Se não foi você, ignore este e-mail.</p>`),
    });
}

export function sendContactAutoReply(to: string, name: string): void {
    void sendMail({
        to,
        subject: 'Recebemos sua mensagem',
        html: layout('Mensagem recebida', `
          <p>Olá, ${esc(name)}!</p>
          <p>Recebemos sua mensagem e responderemos assim que possível.</p>`),
    });
}
