// pair-server.js
// Bot Telegram de "pairing" pour AKANE MD v2.5.
//
// Ce que ça fait :
//   1. Quelqu'un tape /pair sur Telegram (avec son numéro WhatsApp).
//   2. Le serveur crée une SESSION WHATSAPP INDÉPENDANTE pour ce numéro
//      (dossier de session séparé, socket Baileys séparé) et demande un
//      code de pairing (8 caractères) à WhatsApp pour ce numéro.
//   3. Le code est envoyé sur Telegram. La personne l'entre dans
//      WhatsApp > Appareils connectés > Connecter un appareil > "Se
//      connecter avec le numéro de téléphone".
//   4. Dès que la connexion s'ouvre, le bot est actif pour CE numéro,
//      et Telegram reçoit une confirmation.
//
// ── Pourquoi une session par numéro (important) ───────────────────────────
// Le bug connu "tous les numéros pairés sont traités comme le même bot"
// vient presque toujours du fait de réutiliser UNE SEULE variable/instance
// de socket globale pour tout le monde. Ici, chaque numéro a :
//   - son propre dossier d'auth : ./sessions/<numero>/
//   - son propre socket Baileys, stocké dans sessions.get(numero)
//   - ses propres event listeners (jamais partagés entre numéros)
// Ne modifie jamais ce fichier pour utiliser un seul "sock" partagé.
//
// ── Intégration avec le vrai bot AKANE MD ─────────────────────────────────
// Au démarrage, ce script clone TOUT SEUL le repo AKANE-MD-v2.5 (git clone
// + npm install) s'il n'est pas déjà présent sur le serveur — voir
// ensureRepoCloned() plus bas. Ensuite, il essaie de charger automatiquement
// le point d'entrée du repo (lu depuis son package.json) et de détecter la
// fonction qui gère les messages — voir loadBotModule().
//
// ⚠️ Je n'ai jamais pu lire le contenu réel du repo (GitHub bloque la
// lecture automatisée sur github.com, et je n'ai pas d'accès réseau direct
// pour tester le clone moi-même). La détection automatique ci-dessous est
// donc une BEST-EFFORT : au premier lancement, regarde les logs de la
// console — ils affichent la liste des exports trouvés dans le module
// chargé. Si aucun candidat ne matche, dis-moi le nom exact du fichier et
// de la fonction/export à utiliser et je fixe `HANDLER_EXPORT_NAME` en dur.
//
// ── Installation ───────────────────────────────────────────────────────
//   npm install telegraf @whiskeysockets/baileys pino
//   (git doit être installé sur le serveur pour le clone automatique)
//
// ── Lancement ─────────────────────────────────────────────────────────
//   node pair-server.js

import { Telegraf } from 'telegraf';
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    delay,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';

// ── Configuration (tout en dur) ────────────────────────────────────────
const CONFIG = {
    TELEGRAM_BOT_TOKEN: '8863220568:AAEa2Nxj1qJM7Gyg4HFbGz8Btxdz_Gzhh0wI', // via @BotFather
    SESSIONS_DIR: './sessions',                        // un sous-dossier par numéro
    REPO_URL: 'https://github.com/akanefx2003/AKANE-MD-v2.5.git',
    REPO_DIR: './AKANE-MD-v2.5',                        // où le repo est cloné
    // Si l'auto-détection échoue, mets ici le nom exact de l'export à
    // utiliser (ex: 'handleMessages', 'default'...) et le script l'utilisera
    // directement sans essayer de deviner.
    HANDLER_EXPORT_NAME: null,
};

if (!CONFIG.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_BOT_TOKEN.includes('METS_TON_TOKEN')) {
    console.error('❌ Renseigne TELEGRAM_BOT_TOKEN dans CONFIG en haut du fichier.');
    process.exit(1);
}

fs.mkdirSync(CONFIG.SESSIONS_DIR, { recursive: true });

// ── Clonage automatique du repo AKANE-MD-v2.5 ─────────────────────────────
function ensureRepoCloned() {
    if (fs.existsSync(path.join(CONFIG.REPO_DIR, '.git'))) {
        // Repo déjà cloné : on ne touche plus à rien, on garde tel quel la
        // version locale (pas de git pull, pour éviter d'écraser des modifs
        // locales ou de tomber sur un fichier corrompu après un pull partiel).
        console.log('📦 Repo AKANE-MD-v2.5 déjà présent — on ignore la mise à jour, on garde la version locale.');
        return;
    }
    console.log(`⬇️  Clonage de ${CONFIG.REPO_URL} dans ${CONFIG.REPO_DIR}...`);
    try {
        execSync(`git clone ${CONFIG.REPO_URL} ${CONFIG.REPO_DIR}`, {
            stdio: 'inherit',
            timeout: 30000, // 30s max — au-delà, on considère que ça bloque
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // jamais de prompt interactif
        });
    } catch (err) {
        console.error('❌ Le clonage a échoué ou a dépassé 30s. Causes probables :');
        console.error('   • Le repo est privé (git demandait un login qui ne peut jamais arriver ici)');
        console.error('   • Pas d\'accès réseau sortant vers github.com depuis ce serveur');
        console.error('   Détail :', err.message);
        process.exit(1);
    }
    console.log('📦 Installation des dépendances du repo cloné (npm install)...');
    execSync('npm install', { cwd: CONFIG.REPO_DIR, stdio: 'inherit' });
    console.log('✅ Repo cloné et installé.');
}

// Charge le module principal du repo cloné (le vrai index.js d'AKANE MD) et
// récupère directement sa fonction handleMessage — plus de devinette de nom
// d'export : index.js exporte maintenant explicitement handleMessage,
// handleGroupUpdate et pluginManager pour cet usage précis. Il faut aussi
// initialiser pluginManager (charger les plugins) UNE SEULE FOIS ici, sinon
// aucune commande ("menu" y compris) ne sera reconnue pour les sessions
// pairées depuis Telegram.
async function loadBotModule() {
    const pkgPath = path.join(CONFIG.REPO_DIR, 'package.json');
    let mainFile = 'index.js';
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        mainFile = pkg.main || mainFile;
    }

    const entryPath = path.resolve(CONFIG.REPO_DIR, mainFile);
    if (!fs.existsSync(entryPath)) {
        console.warn(`⚠️ Point d'entrée introuvable : ${entryPath}. Le bot restera en mode "pairing seul".`);
        return { module: null, handlerFn: null };
    }

    const mod = await import(pathToFileURL(entryPath).href);
    console.log('📋 Exports trouvés dans', mainFile, ':', Object.keys(mod));

    let handlerFn = null;
    if (typeof mod.handleMessage === 'function') {
        handlerFn = mod.handleMessage;
        console.log('✅ handleMessage trouvé et branché.');
    } else if (CONFIG.HANDLER_EXPORT_NAME && typeof mod[CONFIG.HANDLER_EXPORT_NAME] === 'function') {
        handlerFn = mod[CONFIG.HANDLER_EXPORT_NAME];
    } else {
        // repli : anciens noms possibles, au cas où index.js n'a pas encore
        // été mis à jour avec l'export explicite handleMessage
        const candidates = ['handleMessages', 'handler', 'messageHandler', 'default'];
        for (const name of candidates) {
            if (typeof mod[name] === 'function') {
                handlerFn = mod[name];
                console.log(`✅ Handler auto-détecté : export "${name}"`);
                break;
            }
        }
    }

    if (!handlerFn) {
        console.warn(
            '⚠️ Aucun handler détecté. Vérifie que index.js exporte bien "handleMessage" ' +
            '(export { handleMessage } en bas du fichier).'
        );
    }

    // Charge les plugins une seule fois, sinon aucune commande ("menu" y
    // compris) ne sera reconnue pour les sessions pairées depuis Telegram.
    if (mod.pluginManager && typeof mod.pluginManager.loadAll === 'function') {
        await mod.pluginManager.loadAll();
        console.log('✅ Plugins chargés pour les sessions pairées depuis Telegram.');
    }

    return { module: mod, handlerFn };
}

// numero (string, chiffres uniquement) -> { sock, status, telegramChatId }
const sessions = new Map();
// telegramChatId -> Set<numero>  (pour /status et /unpair)
const chatToNumbers = new Map();

function cleanNumber(raw) {
    return (raw || '').replace(/[^0-9]/g, '');
}

function trackChatNumber(chatId, number) {
    if (!chatToNumbers.has(chatId)) chatToNumbers.set(chatId, new Set());
    chatToNumbers.get(chatId).add(number);
}

// Rempli au démarrage par loadBotModule() — voir main() tout en bas.
let botHandlerFn = null;
// Envoie le DM de confirmation ("AKANE MD CONNECTER AVEC SUCCÈS" + liens) —
// exactement le même message que reçoit le numéro principal du bot. Sans ça,
// le pairing Telegram réussissait bien côté WhatsApp mais ce message
// n'arrivait jamais (seule la confirmation Telegram était envoyée).
let botSendConnectedMessage = null;
// Fonctions exportées par index.js / boutons.js : elles donnent aux sessions
// Telegram exactement le même comportement que le bot déployé directement sur
// un panel (tag « Voir la chaîne » sur chaque message + abonnement à la chaîne
// + événements de groupe).
let botApplyCanalInfo = null;
let botFollowChannel = null;
let botGroupHandlerFn = null;

// Appelée une seule fois par session, juste après que la connexion soit
// "open". `sock` est LE socket de cette session (et seulement celle-ci).
// IMPORTANT : handleMessage(sock, event) attend l'ÉVÉNEMENT complet (avec
// event.messages, un tableau, et event.type) — exactement comme index.js
// l'utilise pour sa propre session. Ne PAS extraire messages[0] et l'envoyer
// seul : c'était le bug qui faisait que rien ne répondait jamais côté
// WhatsApp après un pairing réussi depuis Telegram (le handler recevait un
// objet dans un format qu'il ne reconnaissait pas, ou n'était jamais appelé
// du tout faute d'avoir été détecté).
function attachBotHandler(sock, number) {
    sock.ev.on('messages.upsert', async (event) => {
        try {
            if (botHandlerFn) {
                await botHandlerFn(sock, event);
            } else {
                console.warn(`⚠️ [${number}] Message reçu mais aucun handler branché (voir CONFIG.HANDLER_EXPORT_NAME).`);
            }
        } catch (err) {
            console.warn(`⚠️ [${number}] Erreur handler message :`, err.message);
        }
    });

    sock.ev.on('group-participants.update', (update) => {
        if (!botGroupHandlerFn) return;
        botGroupHandlerFn(sock, update).catch((err) =>
            console.warn(`⚠️ [${number}] Erreur handler groupe :`, err.message)
        );
    });
}

async function startPairingSession(ctx, number) {
    if (sessions.has(number) && sessions.get(number).status === 'connected') {
        return ctx.reply(`✅ Le numéro +${number} est déjà connecté.`);
    }

    const sessionPath = path.join(CONFIG.SESSIONS_DIR, number);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'), // requis pour le pairing par code
    });

    // Tag « Voir la chaîne » sur TOUS les messages envoyés par ce socket (y compris
    // le message de connexion). Sans cet appel, le bouton n'apparaît jamais pour
    // les sessions pairées depuis Telegram (il marchait seulement sur panel, car
    // index.js l'appelle pour ses propres sockets).
    if (typeof botApplyCanalInfo === 'function') botApplyCanalInfo(sock);

    sessions.set(number, { sock, status: 'pairing', telegramChatId: ctx.chat.id });
    trackChatNumber(ctx.chat.id, number);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const entry = sessions.get(number);

        if (connection === 'open') {
            if (entry) entry.status = 'connected';
            attachBotHandler(sock, number);
            if (typeof botFollowChannel === 'function') botFollowChannel(sock).catch(() => {});
            await ctx.telegram.sendMessage(
                entry?.telegramChatId ?? ctx.chat.id,
                `🎉 Le numéro +${number} est maintenant connecté ! Le bot est actif pour ce numéro.`
            );
            console.log(`✅ [${number}] Session connectée.`);

            // DM de confirmation côté WhatsApp (une seule fois par numéro,
            // même logique que createSubSession() dans index.js : un fichier
            // marqueur évite de le renvoyer à chaque reconnexion).
            const marker = path.join(sessionPath, '.welcomed');
            if (typeof botSendConnectedMessage === 'function' && !fs.existsSync(marker)) {
                fs.writeFileSync(marker, String(Date.now()));
                setTimeout(() => {
                    botSendConnectedMessage(sock).catch((err) =>
                        console.warn(`⚠️ [${number}] Message de connexion WhatsApp :`, err.message)
                    );
                }, 3000);
            } else if (typeof botSendConnectedMessage !== 'function') {
                console.warn(`⚠️ [${number}] sendConnectedMessage indisponible (index.js pas à jour ?) — DM de connexion non envoyé.`);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const loggedOut = statusCode === DisconnectReason.loggedOut;

            if (loggedOut) {
                sessions.delete(number);
                fs.rmSync(sessionPath, { recursive: true, force: true });
                await ctx.telegram.sendMessage(
                    entry?.telegramChatId ?? ctx.chat.id,
                    `🔌 Le numéro +${number} a été déconnecté (déconnexion depuis le téléphone). Retape /pair pour reconnecter.`
                );
                console.log(`🔌 [${number}] Déconnecté (logout), session supprimée.`);
            } else {
                console.warn(`⚠️ [${number}] Connexion fermée, tentative de reconnexion...`);
                await delay(2000);
                startPairingSession(ctx, number); // reconnexion, même session isolée
            }
        }
    });

    // Demande le code de pairing seulement si ce numéro n'est pas déjà enregistré
    if (!sock.authState.creds.registered) {
        await delay(1500); // laisse le socket s'initialiser avant de demander le code
        try {
            const code = await sock.requestPairingCode(number);
            await ctx.reply(
                `🔑 Code de pairing pour +${number} :\n\n\`${code}\`\n\n` +
                `Sur WhatsApp : Paramètres > Appareils connectés > Connecter un appareil > ` +
                `"Se connecter avec le numéro de téléphone", puis entre ce code.`,
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            sessions.delete(number);
            await ctx.reply(`❌ Impossible de générer un code pour +${number} : ${err.message}`);
        }
    }
}

// ── Bot Telegram ────────────────────────────────────────────────────────
const bot = new Telegraf(CONFIG.TELEGRAM_BOT_TOKEN);

bot.start((ctx) =>
    ctx.reply(
        '👋 Bienvenue sur le pairing AKANE MD.\n\n' +
        'Utilise /pair <numéro avec indicatif> pour connecter ton WhatsApp.\n' +
        'Exemple : /pair 2250700000000'
    )
);

bot.command('pair', async (ctx) => {
    const arg = ctx.message.text.split(' ').slice(1).join(' ');
    const number = cleanNumber(arg);

    if (!number || number.length < 8) {
        return ctx.reply('❌ Envoie ton numéro avec l\'indicatif, ex : /pair 2250700000000');
    }

    await ctx.reply(`⏳ Génération du code de pairing pour +${number}...`);
    startPairingSession(ctx, number).catch((err) =>
        ctx.reply(`❌ Erreur : ${err.message}`)
    );
});

bot.command('status', (ctx) => {
    const numbers = chatToNumbers.get(ctx.chat.id);
    if (!numbers || numbers.size === 0) {
        return ctx.reply('Aucune session liée à ce chat. Utilise /pair pour en créer une.');
    }
    const lines = [...numbers].map((n) => {
        const s = sessions.get(n);
        return `+${n} — ${s?.status === 'connected' ? '✅ connecté' : '⏳ en attente'}`;
    });
    ctx.reply(lines.join('\n'));
});

bot.command('unpair', async (ctx) => {
    const arg = ctx.message.text.split(' ').slice(1).join(' ');
    const number = cleanNumber(arg);
    const entry = sessions.get(number);

    if (!entry) return ctx.reply('❌ Ce numéro n\'a pas de session active.');

    await entry.sock.logout().catch(() => {});
    sessions.delete(number);
    fs.rmSync(path.join(CONFIG.SESSIONS_DIR, number), { recursive: true, force: true });
    ctx.reply(`🗑️ Session de +${number} supprimée.`);
});

async function main() {
    ensureRepoCloned();
    const { module, handlerFn } = await loadBotModule();
    botHandlerFn = handlerFn;
    if (module && typeof module.sendConnectedMessage === 'function') {
        botSendConnectedMessage = module.sendConnectedMessage;
    }
    if (module && typeof module.applyCanalInfo === 'function') botApplyCanalInfo = module.applyCanalInfo;
    if (module && typeof module.followOfficialChannel === 'function') botFollowChannel = module.followOfficialChannel;
    if (module && typeof module.handleGroupUpdate === 'function') botGroupHandlerFn = module.handleGroupUpdate;
    if (!botApplyCanalInfo) {
        console.warn('⚠️ index.js n\'exporte pas applyCanalInfo : le bouton « Voir la chaîne » ne sera pas ajouté aux sessions Telegram (index.js pas à jour sur le repo ?).');
    }

    try {
        await bot.launch();
    } catch (err) {
        // 401 ici = le TELEGRAM_BOT_TOKEN dans CONFIG est refusé par Telegram (faux ou
        // révoqué). Avant, cette erreur passait par le handler global "unhandledRejection"
        // importé depuis index.js, qui se contentait de l'afficher sans rien faire : le
        // process n'avait alors plus rien à faire et s'éteignait tout seul en silence.
        if (err?.response?.error_code === 401 || /401/.test(err?.message || '')) {
            console.error('❌ Telegram a refusé TELEGRAM_BOT_TOKEN (401 Unauthorized).');
            console.error('   → Reprends le token EXACT donné par @BotFather (commande /token ou /mybots > API Token) et remplace-le en haut du fichier.');
        } else {
            console.error('❌ bot.launch() a échoué :', err?.message || err);
        }
        process.exit(1);
    }
    console.log('🤖 Bot Telegram de pairing lancé.');
}

main().catch((err) => {
    console.error('❌ Démarrage de pair-server.js échoué :', err?.message || err);
    process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
