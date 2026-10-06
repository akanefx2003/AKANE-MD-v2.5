// plugins/insulte.js

// ── Cadre v2.5 (identique à la carte de song.js) ────────────────────────────
const P = '┃· ͟͟͞͞➳❥';
const BRAND = '*┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5*';
const clean = (t) => String(t ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
// Abrège un texte de plus de 2 mots ("Mot1 Mot2...") pour garder la carte courte, comme song.js
const abbreviate = (text) => {
    const w = clean(text).split(' ').filter(Boolean);
    if (!w.length) return '—';
    return w.length <= 2 ? w.join(' ') : w.slice(0, 2).join(' ') + '...';
};
// mode : 'strong' = *_valeur_*, 'soft' = _valeur_, 'raw' = telle quelle (liens, @mentions)
const line = (label, value, mode = 'strong') =>
    `*${P} ${label} :* ` + (mode === 'raw' ? value : mode === 'soft' ? `_${value}_` : `*_${value}_*`);
const card = (top, bottom = []) =>
    ['╭⊷─────────◈', ...top, BRAND, ...bottom, '╰⊷─────────◈', '> *BY DEV AKANE 🌹*'].join('\n');

// Aide / erreurs : même boîte que song.js (ctx.titledBox), avec un repli si ctx est absent.
function titled(ctx, title, ...sections) {
    if (typeof ctx?.titledBox === 'function') return ctx.titledBox(title, ...sections);
    return card(sections.map((s) => line(clean(s[0]), clean(s.slice(1).join(' ')) || '—', 'soft')));
}
// Aide avec l'image gérée dans settings.js (settings.images.<cmd>, sinon menuImage), comme song.js
async function sendHelp(client, jid, message, ctx, key, caption) {
    const img = ctx?.settings?.images?.[key] || ctx?.settings?.menuImage;
    return client.sendMessage(jid, img ? { image: { url: img }, caption } : { text: caption }, { quoted: message });
}

const insults = [
    "T'es comme un nuage. Quand tu disparais, c'est une belle journée !",
    "Tu apportes tellement de joie... quand tu quittes la pièce !",
    "T'es pas bête, t'as juste de la malchance quand tu réfléchis.",
    "T'es la preuve que l'évolution prend des pauses parfois.",
    "Ton cerveau tourne sous Windows 95 — lent et dépassé.",
];

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;
    const info = message.message?.extendedTextMessage?.contextInfo;
    const target = info?.mentionedJid?.[0] || info?.participant;

    if (!target) {
        return client.sendMessage(jid, {
            text: titled(ctx, 'INSULTE', ['ERREUR', 'Mentionne quelqu\'un'], ['ASTUCE', 'Mentionne ou réponds à son message']),
        }, { quoted: message });
    }

    const insult = insults[Math.floor(Math.random() * insults.length)];

    return client.sendMessage(jid, {
        text: card(
            [line('CIBLE', '@' + target.split('@')[0], 'raw')],
            [line('INSULTE', `"${insult}"`, 'soft')]
        ),
        mentions: [target],
    }, { quoted: message });
}

export default {
    name: 'insulte',
    commands: ['insulte'],
    category: 'outils',
    description: 'Lance une petite pique (pour rire) à quelqu\'un',
    handler,
};
