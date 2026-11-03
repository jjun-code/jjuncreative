import type { APIRoute } from 'astro';

/* Contact form endpoint: emails a visitor's message to the site owner through
   Cloudflare's send_email binding (see wrangler.jsonc). Runs on the Worker, not
   prerendered. In `astro dev` (Node) there's no Cloudflare runtime, so the
   message is logged instead of sent. */
export const prerender = false;

const FROM = 'contact@jjuncreative.com';
// Delivered to the verified inbox (the only kind send_email allows), but
// addressed to the public address, which forwards to that same inbox
const TO = 'jjuncreative@gmail.com';
const SHOWN_TO = 'hello@jjuncreative.com';

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
};
// Encoded header word, so subjects in any language survive
const word = (s: string) => `=?UTF-8?B?${b64(s)}?=`;

// A plain-text email, in the raw format Cloudflare's EmailMessage expects
function rawEmail(subject: string, body: string, replyTo: string) {
  const lines = b64(body).match(/.{1,76}/g) ?? [''];
  return [
    `From: ${word('jjuncreative site')} <${FROM}>`,
    `To: <${SHOWN_TO}>`,
    `Reply-To: <${replyTo}>`,
    `Subject: ${word(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@jjuncreative.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    ...lines,
  ].join('\r\n');
}

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try { form = await request.formData(); } catch { return json(400, { error: 'Bad request' }); }
  const get = (k: string) => String(form.get(k) ?? '').trim();
  const email = get('email'), subject = get('subject'), message = get('message');

  // Spam traps: a hidden field people never fill, and a minimum time on the form
  if (get('website') || Date.now() - Number(get('t')) < 2500) return json(200, { ok: true });

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 200) return json(400, { error: 'Please enter a valid email.' });
  if (!subject || subject.length > 150) return json(400, { error: 'Please add a subject.' });
  if (!message || message.length > 5000) return json(400, { error: 'Please write a message (up to 5000 characters).' });

  const body = `${message}\n\n—\nFrom: ${email}\nSent from the contact form on jjuncreative.com`;
  const raw = rawEmail(`[jjuncreative] ${subject}`, body, email);

  let env: { MAILER?: { send(m: unknown): Promise<void> } };
  try {
    ({ env } = await import(/* @vite-ignore */ 'cloudflare:workers'));
  } catch {
    console.log('[contact] dev mode, not sent:\n' + raw);
    return json(200, { ok: true, dev: true });
  }
  try {
    const { EmailMessage } = await import(/* @vite-ignore */ 'cloudflare:email');
    await env.MAILER!.send(new EmailMessage(FROM, TO, raw));
    return json(200, { ok: true });
  } catch (e) {
    console.error('[contact] send failed', e);
    return json(502, { error: 'Couldn’t send right now.' });
  }
};
