// plugins/voir.js — Révèle un média "vue unique" (view once) cité, envoyé en MESSAGE PRIVÉ (DM)
//   {prefix}voir  -> révèle en DM
//   {prefix}vv    -> alias identique à voir

import { downloadMediaMessage } from '@whiskeysockets/baileys';

// Déballe le conteneur view-once s'il existe (selon la version du client WhatsApp
// qui a envoyé le message, la structure diffère légèrement).
function unwrapViewOnce(msg) {
    if (msg?.viewOnceMessage) return msg.viewOnceMessage.message;
    if (msg?.viewOnceMessageV2) return msg.viewOnceMessageV2.message;
    if (msg?.viewOnceMessageV2Extension) return msg.viewOnceMessageV2Extension.message;
    return msg;
}

async function handler(client, message, args, ctx) {
    const jid    = message.key.remoteJid;
    const sender = message.key.participant || jid;

    const rawQuoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!rawQuoted) {
        return client.sendMessage(jid, {
            text: ctx.box(['👁️ Voir', `réponds à un média vue unique avec ${ctx.prefix}voir ou ${ctx.prefix}vv`])
        }, { quoted: message });
    }

    const inner = unwrapViewOnce(rawQuoted);
    const media = inner?.imageMessage || inner?.videoMessage || inner?.audioMessage;

    if (!media) {
        return client.sendMessage(jid, { text: ctx.box('❌ Aucun média vue unique trouvé dans le message cité') }, { quoted: message });
    }

    // Légende d'origine du média (si l'expéditeur en avait mis une) ; à défaut, texte générique.
    const originalCaption = inner.imageMessage?.caption || inner.videoMessage?.caption || '';
    const caption = originalCaption
        ? ctx.box('👁️ Média vue unique révélé', originalCaption)
        : ctx.box('👁️ Média vue unique révélé');

    try {
        const fakeMsg = { key: { ...message.key }, message: inner };
        const buffer  = await downloadMediaMessage(fakeMsg, 'buffer', {});
        if (!buffer || !buffer.length) throw new Error('Téléchargement impossible');

        if (inner.imageMessage) {
            await client.sendMessage(sender, { image: buffer, caption });
        } else if (inner.videoMessage) {
            await client.sendMessage(sender, { video: buffer, caption });
        } else {
            await client.sendMessage(sender, { audio: buffer, mimetype: 'audio/mp4', ptt: inner.audioMessage?.ptt || false });
            await client.sendMessage(sender, { text: caption });
        }

        // Petite confirmation dans le groupe (sans révéler le contenu) pour que la
        // personne sache où regarder — seulement si la commande venait d'un groupe.
        if (jid.endsWith('@g.us')) {
            await client.sendMessage(jid, {
                text: ctx.box('✅ Envoyé en message privé'),
                mentions: [sender]
            }, { quoted: message });
        }
    } catch (err) {
        console.error('❌ Erreur voir:', err.message);
        return client.sendMessage(jid, { text: ctx.box(['❌ Erreur', err.message]) }, { quoted: message });
    }
}

export default {
    name: 'voir',
    commands: ['voir', 'vv'],
    category: 'outils',
    description: 'Révèle en message privé un média vue unique cité (voir / vv)',
    handler,
};
