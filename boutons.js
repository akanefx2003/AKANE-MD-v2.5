// boutons.js
// 1) Tag "Voir la chaîne officielle 📢" ajouté à chaque message envoyé par le bot
// 2) Abonnement automatique du numéro à la chaîne WhatsApp AKANE MD v2 à la connexion

const canalInfo = {
    isForwarded: true,
    forwardingScore: 1,
    forwardedNewsletterMessageInfo: {
        newsletterJid: "120363423070848478@newsletter",
        serverMessageId: 100,
        newsletterName: "Voir la chaîne officielle 📢"
    }
};

// Types de contenu qui acceptent un contextInfo.
// Les réactions, suppressions, transferts, sondages... n'en ont pas : ils passent sans modification.
const CONTENT_KEYS = ['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts'];

// À appeler une fois juste après makeWASocket() : enveloppe sock.sendMessage pour que
// TOUS les messages (commandes, plugins, menu, jeux...) portent le tag de la chaîne,
// sans avoir à modifier chaque commande.
function applyCanalInfo(sock) {

    if (sock.__canalInfoApplied) return sock;

    const originalSendMessage = sock.sendMessage.bind(sock);

    sock.sendMessage = (jid, content, options) => {

        try {

            const skip = !content
                || typeof content !== 'object'
                || typeof jid !== 'string'
                || jid.endsWith('@newsletter')
                || jid === 'status@broadcast'
                || !CONTENT_KEYS.some(key => key in content);

            if (!skip) {

                // Si une commande définit déjà son propre contextInfo, il garde la priorité
                content = { ...content, contextInfo: { ...canalInfo, ...(content.contextInfo || {}) } };

            }

        } catch {}

        return originalSendMessage(jid, content, options);

    };

    sock.__canalInfoApplied = true;

    return sock;

}

// ─── Abonnement automatique à la chaîne ────────────────────────────────────
// Appelée quand un numéro se connecte au bot (connection === 'open'), qu'il
// s'agisse du bot principal ou d'une sous-session créée via .pair / le site.
// Chaque numéro qui se connecte est ainsi automatiquement ajouté à la chaîne
// AKANE MD v2, pour recevoir les mises à jour et les infos du bot.
const followedNumbers = new Set();

async function followOfficialChannel(sock) {

    const jid = canalInfo.forwardedNewsletterMessageInfo.newsletterJid;
    const number = (sock.user?.id || '').split(':')[0].split('@')[0];

    if (!jid || !number || followedNumbers.has(number)) return false;

    // sock.newsletterFollow existe sur les forks Baileys récents (dont crysnovax/baileys).
    if (typeof sock.newsletterFollow !== 'function') {

        console.warn('⚠️ sock.newsletterFollow indisponible : abonnement automatique à la chaîne désactivé.');
        return false;

    }

    try {

        await sock.newsletterFollow(jid);
        followedNumbers.add(number);
        console.log(`📢 +${number} ajouté automatiquement à la chaîne AKANE MD v2`);
        return true;

    } catch (err) {

        console.warn(`⚠️ Abonnement à la chaîne échoué pour +${number} :`, err.message);
        return false;

    }

}

export { canalInfo, applyCanalInfo, followOfficialChannel }
