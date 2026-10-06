// plugins/tiktok.js
import axios from 'axios';

const CHANNEL_LINK = 'https://whatsapp.com/channel/0029VbBzhyQ4NVisPH1NSe1R';

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

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;
    const input = (Array.isArray(args) ? args : []).join(' ').trim();
    const link = (input.match(/https?:\/\/\S+/) || [])[0];
    const pfx = ctx?.prefix || '.';

    if (!link || !link.includes('tiktok.com')) {
        return sendHelp(client, jid, message, ctx, 'tiktok', titled(ctx, 'TIKTOK',
            ['TÉLÉCHARGEUR TIKTOK', 'UTILISATION'],
            [pfx + 'tiktok', '[lien]'],
            ['EXEMPLE', `${pfx}tiktok https://vm.tiktok.com/xxxx`]
        ));
    }

    try {
        const response = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(link)}`, { timeout: 15000 });
        const data = response.data?.data;
        if (!data || !data.play) {
            return client.sendMessage(jid, { text: titled(ctx, 'TIKTOK', ['ERREUR', 'Aucune vidéo trouvée']) }, { quoted: message });
        }

        const videoResponse = await axios.get(data.play, { responseType: 'arraybuffer', timeout: 60000 });

        return client.sendMessage(jid, {
            video: Buffer.from(videoResponse.data),
            caption: card(
                [
                    line('TITRE', abbreviate(data.title || 'TikTok Video')),
                    line('AUTEUR', '@' + String(data.author?.unique_id || 'inconnu').replace(/[*~`\s]/g, ''), 'raw'), // les _ des pseudos sont conservés
                ],
                [
                    line('STATUT', 'TÉLÉCHARGÉ ✓', 'soft'),
                    line('CHAINE', CHANNEL_LINK, 'raw'),
                ]
            ),
        }, { quoted: message });

    } catch (err) {
        console.error('❌ Erreur tiktok:', err.message);
        return client.sendMessage(jid, { text: titled(ctx, 'TIKTOK', ['ERREUR', err.message]) }, { quoted: message });
    }
}

export default {
    name: 'tiktok',
    commands: ['tiktok'],
    category: 'outils',
    description: 'Télécharge une vidéo TikTok',
    handler,
};
