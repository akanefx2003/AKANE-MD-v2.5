// plugins/mail.js — Email temporaire via mail.tm (API publique, gratuite)

import axios from 'axios';
import { t } from '../lang.js';

const API_BASE     = 'https://api.mail.tm';
const mailSessions = new Map();

class TempMail {
    constructor(email, password, id) {
        this.email     = email;
        this.password  = password;
        this.id        = id;
        this.createdAt = Date.now();
        this.messages  = [];
        this.token     = null;
    }
    getAge()    { return Math.floor((Date.now() - this.createdAt) / 60000); }
    isExpired() { return this.getAge() > 60; }
}

function extractMainCode(text) {
    const otpMatches = text.match(/\b\d{4,8}\b/g) || [];
    if (otpMatches.length && !otpMatches[0].startsWith('20') && !otpMatches[0].startsWith('19')) {
        return { type: 'OTP', value: otpMatches[0] };
    }
    const alphaMatches = text.match(/\b[A-Z]{4,10}\b/g) || [];
    if (alphaMatches.length) return { type: 'CODE', value: alphaMatches[0] };
    if (otpMatches.length) return { type: 'OTP', value: otpMatches[0] };
    return null;
}

async function createTempEmail() {
    try {
        const domainRes = await axios.get(`${API_BASE}/domains`, { timeout: 8000 });
        const domain    = domainRes.data['hydra:member'][0].domain;
        const email     = `${Math.random().toString(36).substring(2, 12)}@${domain}`;
        const password  = Math.random().toString(36).substring(2, 15);
        const res       = await axios.post(`${API_BASE}/accounts`, { address: email, password }, { timeout: 8000 });
        return res.data?.id ? { email, password, id: res.data.id } : null;
    } catch (e) {
        console.error('Erreur création mail:', e.response?.data || e.message);
        return null;
    }
}
async function getToken(email, password) {
    try {
        const res = await axios.post(`${API_BASE}/token`, { address: email, password }, { timeout: 8000 });
        return res.data.token;
    } catch { return null; }
}
async function getMessages(token) {
    try {
        const res = await axios.get(`${API_BASE}/messages`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
        const messages = res.data['hydra:member'] || [];
        messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return messages;
    } catch { return []; }
}
async function getMessageContent(token, id) {
    try {
        const res = await axios.get(`${API_BASE}/messages/${id}`, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });
        return res.data;
    } catch { return null; }
}

// Image utilisée par le plugin, toujours lue depuis settings.js
// (ctx.settings.images.mail), avec repli sur menuImage.
function mailImage(ctx) {
    return ctx.settings.images?.mail || ctx.settings.menuImage;
}

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;
    const sub = args[0]?.toLowerCase();
    const L   = (key) => t(ctx.config, key);

    // ── HELP ──
    if (!sub || sub === 'help') {
        return client.sendMessage(jid, {
            image: { url: mailImage(ctx) },
            caption: ctx.titledBox('MAIL', 
                [L('mailHelpTitle'), `${ctx.prefix}mail gen — ${L('mailHelpGen')}`],
                [`${ctx.prefix}mail inbox`, L('mailHelpInbox')],
                [`${ctx.prefix}mail read [n°]`, L('mailHelpRead')],
                [`${ctx.prefix}mail delete`, L('mailHelpDelete')]
            ),
        }, { quoted: message });
    }

    // ── GEN ──
    if (['gen', 'generate', 'new'].includes(sub)) {
        const old = mailSessions.get(jid);
        if (old && !old.isExpired()) {
            return client.sendMessage(jid, { text: ctx.titledBox('MAIL', [L('mailAlready'), old.email], [L('mailExpiresIn'), `${60 - old.getAge()}m`]) }, { quoted: message });
        }

        await client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailCreating')) });

        const data = await createTempEmail();
        if (!data) return client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailCreateErr')) }, { quoted: message });

        mailSessions.set(jid, new TempMail(data.email, data.password, data.id));

        return client.sendMessage(jid, {
            image: { url: mailImage(ctx) },
            caption: ctx.titledBox('MAIL', 
                [L('mailCreated'), data.email],
                [L('mailPassword'), data.password],
                [L('mailDuration'), L('mailOneHour')],
                [L('mailNext'), `${ctx.prefix}mail inbox`]
            ),
        }, { quoted: message });
    }

    // ── INBOX ──
    if (['inbox', 'messages', 'list'].includes(sub)) {
        const s = mailSessions.get(jid);
        if (!s) return client.sendMessage(jid, { text: ctx.titledBox('MAIL', [L('mailNoActive'), `${ctx.prefix}mail gen ${L('mailGenFirst')}`]) }, { quoted: message });
        if (s.isExpired()) { mailSessions.delete(jid); return client.sendMessage(jid, { text: ctx.titledBox('MAIL', [L('mailExpired'), `${ctx.prefix}mail gen`]) }, { quoted: message }); }

        await client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailFetching')) });

        if (!s.token) s.token = await getToken(s.email, s.password);
        const msgs = await getMessages(s.token);
        s.messages = msgs;

        if (!msgs.length) {
            return client.sendMessage(jid, { text: ctx.titledBox('MAIL', [L('mailEmpty'), s.email], [L('mailExpiresIn'), `${60 - s.getAge()}m`]) }, { quoted: message });
        }

        const pairs = [[L('mailInbox'), `${msgs.length} ${L('mailMessages')}`]];
        msgs.slice(0, 10).forEach((m, i) => pairs.push([`${i + 1}. ${m.subject || L('mailNoSubject')}`, `${L('mailFrom')} ${m.from?.address || L('mailUnknown').toLowerCase()} → ${ctx.prefix}mail read ${i + 1}`]));

        return client.sendMessage(jid, { text: ctx.titledBox('MAIL', ...pairs) }, { quoted: message });
    }

    // ── READ ──
    if (sub === 'read') {
        const num = parseInt(args[1]);
        const s   = mailSessions.get(jid);
        if (!s) return client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailNoActive')) }, { quoted: message });
        if (!s.token) s.token = await getToken(s.email, s.password);

        let msgs = s.messages;
        if (!msgs.length) { msgs = await getMessages(s.token); s.messages = msgs; }
        if (!msgs[num - 1]) return client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailNotFound')) }, { quoted: message });

        const full = await getMessageContent(s.token, msgs[num - 1].id);
        if (!full) return client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailReadErr')) }, { quoted: message });

        let content = full.text || full.html || '';
        if (Array.isArray(content)) content = content[0] || '';
        content = String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const clean = content.length > 800 ? content.slice(0, 800) + '...' : content;
        const code  = extractMainCode(content);

        const pairs = [
            [`📧 #${num}`, full.subject || L('mailNoSubject')],
            [L('mailFrom'), full.from?.address || L('mailUnknown')],
            [L('mailContent'), clean],
        ];
        if (code) pairs.push([`🔑 ${code.type}`, code.value]);

        return client.sendMessage(jid, { text: ctx.titledBox('MAIL', ...pairs) }, { quoted: message });
    }

    // ── DELETE ──
    if (['delete', 'del'].includes(sub)) {
        const s = mailSessions.get(jid);
        if (!s) return client.sendMessage(jid, { text: ctx.titledBox('MAIL', L('mailNoActive')) }, { quoted: message });
        mailSessions.delete(jid);
        return client.sendMessage(jid, { text: ctx.titledBox('MAIL', [L('mailDeleted'), s.email], [L('mailNext'), `${ctx.prefix}mail gen ${L('mailNewOne')}`]) }, { quoted: message });
    }

    return client.sendMessage(jid, { text: ctx.titledBox('MAIL', [L('mailInvalid'), `${ctx.prefix}mail help`]) }, { quoted: message });
}

export default {
    name: 'mail',
    commands: ['mail'],
    category: 'outils',
    description: 'Génère une adresse email temporaire et lit ses messages (mail.tm)',
    handler,
};
