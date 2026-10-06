// plugins/approve.js

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

    if (!jid.endsWith('@g.us')) {
        return client.sendMessage(jid, { text: titled(ctx, 'APPROVE', ['ERREUR', 'Groupe uniquement']) }, { quoted: message });
    }

    try {
        // Seuls les admins peuvent approuver les demandes
        const meta = await client.groupMetadata(jid);
        const sender = message.key.participant || jid;
        const isAdmin = message.key.fromMe || meta.participants.some((p) => p.admin && p.id === sender);
        if (!isAdmin) {
            return client.sendMessage(jid, { text: titled(ctx, 'APPROVE', ['ERREUR', 'Admins uniquement']) }, { quoted: message });
        }

        const requests = await client.groupRequestParticipantsList(jid);

        if (!requests || requests.length === 0) {
            return client.sendMessage(jid, {
                text: card(
                    [line('ACTION', 'APPROBATION'), line('DEMANDES', '0')],
                    [line('STATUT', 'AUCUNE DEMANDE EN ATTENTE', 'soft')]
                ),
            }, { quoted: message });
        }

        await client.groupRequestParticipantsUpdate(jid, requests.map((r) => r.jid), 'approve');

        return client.sendMessage(jid, {
            text: card(
                [line('ACTION', 'APPROBATION'), line('DEMANDES', String(requests.length))],
                [line('STATUT', `${requests.length} MEMBRE(S) AJOUTÉ(S) ✓`, 'soft')]
            ),
        }, { quoted: message });

    } catch (err) {
        console.error('❌ approve:', err.message);
        const raison = err.message.includes('not-authorized') ? 'Le bot doit être admin' : err.message;
        return client.sendMessage(jid, { text: titled(ctx, 'APPROVE', ['ERREUR', raison]) }, { quoted: message });
    }
}

export default {
    name: 'approve',
    commands: ['approve'],
    category: 'groupe',
    description: 'Approuve toutes les demandes d\'adhésion en attente',
    handler,
};
