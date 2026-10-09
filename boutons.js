// boutons.js
// Bouton "Voir la chaîne" (cta_url) ajouté aux messages TEXTE envoyés par le bot
// + abonnement automatique du numéro à la chaîne WhatsApp AKANE MD à la connexion.
//
// ⚠️ IMPORTANT : @whiskeysockets/baileys (le core officiel) n'a AUCUN support pour
// interactiveButtons dans sock.sendMessage() — la clé est silencieusement ignorée
// (c'est exactement pour ça que le message arrivait "Transféré" mais sans bouton :
// seul contextInfo.isForwarded passait, interactiveButtons était juste jeté).
// Un vrai bouton natif doit être construit à la main (proto + noeuds binaires
// biz/native_flow/bot) et envoyé via relayMessage — voir baileys-buttons.mjs,
// à placer dans le même dossier que ce fichier.
//
// Le bouton s'ajoute aux messages TEXTE et aux messages IMAGE/VIDÉO avec légende
// (les @mentions sont conservées). Les autres types (audio, document, sticker,
// GIF, vue unique) gardent seulement le tag "chaîne officielle" (isForwarded).
//
// Utilisation du bouton lien perso, depuis n'importe quel plugin (en plus du
// bouton "Voir la chaîne" qui est ajouté automatiquement) :
//   client.sendMessage(jid, {
//       text: 'Regarde ça 👀',
//       link: { url: 'https://example.com', text: 'Ouvrir le lien' },
//   }, { quoted: message });
//
// - `link` accepte aussi juste une string ('https://...') → texte par défaut "Ouvrir le lien".
// - Jusqu'à 2 liens en passant un tableau : link: [{ url, text }, { url, text }]
//   (1 place est toujours réservée au bouton "Voir la chaîne", max 3 boutons WhatsApp).

import settings from './settings.js';
import { sendUrlButtons } from './buttons.mjs';

const canalInfo = {
    isForwarded: true,
    forwardingScore: 1
};

// Types de contenu qui acceptent un contextInfo.
// Les réactions, suppressions, transferts, sondages... n'en ont pas : ils passent sans modification.
const CONTENT_KEYS = ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts'];

// À appeler une fois juste après makeWASocket() : enveloppe sock.sendMessage pour que
// TOUS les messages texte (commandes, plugins, menu, jeux...) portent le bouton
// "Voir la chaîne", sans avoir à modifier chaque commande.
function applyCanalInfo(sock) {

    if (sock.__canalInfoApplied) return sock;

    const originalSendMessage = sock.sendMessage.bind(sock);

    sock.sendMessage = async (jid, content, options = {}) => {

        // Un plugin peut passer { skipCanal: true } dans les options pour que
        // CE message précis n'ait jamais le tag/bouton "chaîne officielle"
        // (ex: one-shot, one-shot2, big-citation).
        const skipCanal = options.skipCanal === true;
        const forwardedOptions = { ...options };
        delete forwardedOptions.skipCanal;

        const skip = skipCanal
            || !content
            || typeof content !== 'object'
            || typeof jid !== 'string'
            || jid.endsWith('@newsletter')
            || jid === 'status@broadcast'
            || !CONTENT_KEYS.some(key => key in content);

        // Cas texte / image / vidéo (avec légende) : vrai bouton natif "Voir la chaîne"
        // (+ liens éventuels passés via content.link), envoyé via le helper interactive.
        const isText = typeof content.text === 'string';
        const isMedia = !isText && (content.image || content.video) && !content.viewOnce && !content.gifPlayback;

        if (!skip && (isText || isMedia) && !content.interactiveButtons) {

            try {

                const rawLinks = content.link
                    ? (Array.isArray(content.link) ? content.link : [content.link])
                    : [];

                const linkButtons = rawLinks
                    .filter(Boolean)
                    .slice(0, 2) // 1 place réservée au bouton "Voir la chaîne" (max 3)
                    .map((l) => typeof l === 'string'
                        ? { displayText: 'Ouvrir le lien', url: l }
                        : { displayText: l.text || 'Ouvrir le lien', url: l.url })
                    .filter((b) => b.url);

                const buttons = [...linkButtons, { displayText: 'Voir la chaîne', url: settings.channelLink }]
                    .filter((b) => b.url)
                    .slice(0, 3);

                return await sendUrlButtons(sock, jid, {
                    text: (isText ? content.text : content.caption) || ' ',
                    footer: content.footer,
                    title: content.title,
                    quoted: forwardedOptions.quoted,
                    image: isMedia ? content.image : undefined,
                    video: isMedia ? content.video : undefined,
                    // Les @mentions (tagall, welcome, goodbye...) doivent être conservées
                    mentions: content.mentions || content.contextInfo?.mentionedJid,
                    buttons,
                });

            } catch (err) {

                console.warn('⚠️ Envoi du bouton "Voir la chaîne" échoué, envoi en texte simple :', err.message);
                // On continue ci-dessous : envoi normal en fallback, avec juste le tag forwardé.

            }

        }

        if (!skip) {
            content = {
                ...content,
                contextInfo: { ...canalInfo, ...(content.contextInfo || {}) }
            };
        }

        return originalSendMessage(jid, content, forwardedOptions);

    };

    sock.__canalInfoApplied = true;

    return sock;

}

// ─── Abonnement automatique à la chaîne ────────────────────────────────────
// Appelée quand un numéro se connecte au bot (connection === 'open'), qu'il
// s'agisse du bot principal ou d'une sous-session créée via .pair / le site.
// Chaque numéro qui se connecte est ainsi automatiquement ajouté à la chaîne
// AKANE MD, pour recevoir les mises à jour et les infos du bot.
const followedNumbers = new Set();

async function followOfficialChannel(sock) {

    const jid = settings.channelJid;
    const number = (sock.user?.id || '').split(':')[0].split('@')[0];

    if (!jid || !number || followedNumbers.has(number)) return false;

    if (typeof sock.newsletterFollow !== 'function') {

        console.warn('⚠️ sock.newsletterFollow indisponible : abonnement automatique à la chaîne désactivé.');
        return false;

    }

    try {

        await sock.newsletterFollow(jid);
        followedNumbers.add(number);
        console.log(`📢 +${number} ajouté automatiquement à la chaîne AKANE MD`);
        return true;

    } catch (err) {

        console.warn(`⚠️ Abonnement à la chaîne échoué pour +${number} :`, err.message);
        return false;

    }

}

export { canalInfo, applyCanalInfo, followOfficialChannel }
