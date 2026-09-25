// plugins/voir.js — Révèle un média "vue unique" (view once) cité
//   {prefix}voir  -> révèle DANS le groupe (ou le chat courant)
//   {prefix}save  -> révèle en MESSAGE PRIVÉ (DM), jamais dans le groupe

import { downloadMediaMessage } from 'baileys';

// Déballe le conteneur view-once s'il existe (selon la version du client WhatsApp
// qui a envoyé le message, la structure diffère légèrement).
function unwrapViewOnce(msg) {
    if (msg?.viewOnceMessage) return msg.viewOnceMessage.message;
    if (msg?.viewOnceMessageV2) return msg.viewOnceMessageV2.message;
    if (msg?.viewOnceMessageV2Extension) return msg.viewOnceMessageV2Extension.message;
    return msg;
}

function getRawText(message) {
    return message.message?.conversation
        || message.message?.extendedTextMessage?.text
        || '';
}

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;

    // Le handler est partagé entre .voir et .save : on relit le texte brut pour
    // savoir laquelle des deux commandes a été invoquée.
    const bodyText = getRawText(message);
    const invoked  = (bodyText.slice(ctx.prefix.length).trim().split(/\s+/)[0] || '').toLowerCase();
    const isSave   = invoked === 'save';

    // .voir -> jid actuel (le groupe, si utilisé en groupe).
    // .save -> toujours le DM de la personne, jamais le groupe.
    const sender     = message.key.participant || jid;
    const destination = isSave ? sender : jid;

    const rawQuoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    if (!rawQuoted) {
        return client.sendMessage(jid, {
            text: ctx.box(['👁️ Voir', `réponds à un média vue unique avec ${ctx.prefix}${invoked || 'voir'}`])
        }, { quoted: message });
    }

    const inner = unwrapViewOnce(rawQuoted);
    const media = inner?.imageMessage || inner?.videoMessage || inner?.audioMessage;

    if (!media) {
        return client.sendMessage(jid, { text: ctx.box('❌ Aucun média vue unique trouvé dans le message cité') }, { quoted: message });
    }

    // Message d'attente : le média vue unique peut mettre quelques secondes à
    // se télécharger (surtout vidéo/audio) — on prévient pour éviter que la
    // personne pense que la commande n'a pas marché.
    const waitMsg = await client.sendMessage(jid, {
        text: ctx.box('⏳ Récupération du média en cours, patiente un instant…'),
    }, { quoted: message });

    try {
        const fakeMsg = { key: { ...message.key }, message: inner };
        const buffer  = await downloadMediaMessage(fakeMsg, 'buffer', {});
        if (!buffer || !buffer.length) throw new Error('Téléchargement impossible — le média a peut-être expiré ou déjà été vu ailleurs');

        if (inner.imageMessage) {
            await client.sendMessage(destination, { image: buffer, caption: ctx.box('👁️ Média vue unique révélé') });
        } else if (inner.videoMessage) {
            await client.sendMessage(destination, { video: buffer, caption: ctx.box('👁️ Média vue unique révélé') });
        } else {
            await client.sendMessage(destination, { audio: buffer, mimetype: 'audio/mp4', ptt: inner.audioMessage?.ptt || false });
            await client.sendMessage(destination, { text: ctx.box('👁️ Média vue unique révélé') });
        }

        // Si envoyé en DM depuis un groupe, petite confirmation dans le groupe
        // (sans révéler le contenu) pour que la personne sache où regarder.
        if (isSave && jid.endsWith('@g.us')) {
            await client.sendMessage(jid, {
                text: ctx.box('✅ Envoyé en message privé'),
                mentions: [sender]
            }, { quoted: message });
        }
    } catch (err) {
        console.error('❌ Erreur voir:', err.message);
        // Cause la plus fréquente : le média vue unique a déjà été ouvert une
        // fois (par n'importe qui) — WhatsApp supprime alors la clé de
        // déchiffrement et le téléchargement devient définitivement impossible,
        // même pour un bot. Ce n'est pas un bug du plugin.
        return client.sendMessage(jid, {
            text: ctx.box(
                ['❌ Impossible de récupérer ce média', err.message],
                ['ℹ️ Raison probable', 'le média a déjà été ouvert une fois (WhatsApp supprime alors la clé) — ça ne vient pas du bot']
            ),
        }, { quoted: message });
    }
}

export default {
    name: 'voir',
    commands: ['voir', 'save'],
    category: 'outils',
    description: 'Révèle un média vue unique cité — voir : dans le groupe, save : en message privé',
    handler,
};
