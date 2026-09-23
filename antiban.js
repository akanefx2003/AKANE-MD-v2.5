// antiban.js — Protection anti-ban / anti-spam WhatsApp.
//
// WhatsApp détecte et bannit les numéros qui envoient des messages en rafale
// ou floodent un même destinataire — comportement typique d'un bot mal réglé.
// Ce module fait passer TOUS les sendMessage() par une file d'attente qui :
//
//   1. Espace chaque envoi d'un délai aléatoire (comportement moins "robotique")
//   2. Empêche de spammer un même chat au-delà d'un seuil raisonnable par minute
//
// À appliquer juste après makeWASocket(), comme applyCanalInfo — l'ordre entre
// les deux n'a pas d'importance, ils se composent (chacun enveloppe sendMessage).
//
//   import { applyAntiBan } from './antiban.js';
//   const sock = makeWASocket({ ... });
//   applyAntiBan(sock);
//   applyCanalInfo(sock);

const MIN_DELAY_MS       = 500;    // délai mini entre 2 envois
const MAX_DELAY_MS       = 1500;   // délai maxi entre 2 envois (aléatoire dans cette fourchette)
const PER_CHAT_LIMIT     = 8;      // max messages vers UN MÊME chat...
const PER_CHAT_WINDOW_MS = 60_000; // ...par minute

const _chatSendTimes = new Map(); // jid -> [timestamps des derniers envois]

function _rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _isFlooding(jid) {
    const now = Date.now();
    const arr = (_chatSendTimes.get(jid) || []).filter(t => now - t < PER_CHAT_WINDOW_MS);
    _chatSendTimes.set(jid, arr);
    return arr.length >= PER_CHAT_LIMIT;
}

function _recordSend(jid) {
    const arr = _chatSendTimes.get(jid) || [];
    arr.push(Date.now());
    _chatSendTimes.set(jid, arr);
    if (_chatSendTimes.size > 5000) { const f = _chatSendTimes.keys().next().value; _chatSendTimes.delete(f); }
}

function applyAntiBan(sock, opts = {}) {
    if (sock.__antiBanApplied) return sock;

    const minDelay = opts.minDelayMs ?? MIN_DELAY_MS;
    const maxDelay = opts.maxDelayMs ?? MAX_DELAY_MS;

    const originalSendMessage = sock.sendMessage.bind(sock);
    let queue = Promise.resolve();

    sock.sendMessage = (jid, content, options) => {
        // Réactions et suppressions sont légères pour WhatsApp : pas besoin de les ralentir
        const light = content && (content.react || content.delete);

        const task = async () => {
            if (!light) {
                if (_isFlooding(jid)) {
                    console.warn(`⚠️ [antiban] Trop de messages vers ${jid} récemment — pause pour éviter un flag WhatsApp`);
                    await new Promise(r => setTimeout(r, PER_CHAT_WINDOW_MS / PER_CHAT_LIMIT));
                }
                _recordSend(jid);
                await new Promise(r => setTimeout(r, _rand(minDelay, maxDelay)));
            }
            return originalSendMessage(jid, content, options);
        };

        const result = queue.then(task, task); // exécute après le précédent, même si celui-ci a échoué
        queue = result.then(() => {}, () => {}); // la file continue même si CE message échoue
        return result;
    };

    sock.__antiBanApplied = true;
    return sock;
}

export { applyAntiBan };
