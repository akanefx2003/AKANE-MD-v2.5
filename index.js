// AKANE MD — Bot WhatsApp (Baileys simple + plugins)
// Usage: node index.js

import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import settings from './settings.js';
import { applyCanalInfo, followOfficialChannel } from './boutons.js';
import { applyAntiBan } from './antiban.js';
import { t, getLang, LANGS } from './lang.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INSTANCE_DIR = process.env.INSTANCE_DIR ? path.resolve(process.env.INSTANCE_DIR) : __dirname;
const PLUGINS_DIR  = path.join(__dirname, 'plugins');
const CONFIG_FILE  = path.join(INSTANCE_DIR, 'database', 'config.json');
const REPO_LINK    = 'https://github.com/dev-akane/akane-md'; // ← remplace par ton vrai lien
const PING_IMAGE   = settings.menuImage;

// ─── Keep-alive / redémarrage auto / message de connexion ────────────────────
const RESTART_EVERY_MS     = 2 * 60 * 60 * 1000; // nettoyage + redémarrage toutes les 2 h
const KEEPALIVE_EVERY_MS   = 4 * 60 * 1000;      // sonde de vie toutes les 4 min
const KEEPALIVE_TIMEOUT_MS = 20 * 1000;          // pas de réponse en 20 s = sonde échouée
const KEEPALIVE_MAX_FAILS  = 2;                  // 2 sondes ratées d'affilée → redémarrage
const MAX_CLOSED_MS        = 5 * 60 * 1000;      // déconnecté > 5 min → redémarrage

const CONNECT_TITLE = 'AKANE MD CONNECTER AVEC SUCCÈS';
const CONNECT_IMAGE = 'https://tinyurl.com/24vhgx6y'; // même image que le welcome
const CONNECT_LINKS = [
    ['LIEN DU SITE DE DÉPLOIEMENT', 'https://v2-website.onrender.com'],
    ['MA CHAÎNE YOUTUBE',           'https://youtube.com/@akanefx-j3k9o?si=cPol4CQyEg0Ei2rJ'],
    ['MON GITHUB',                  'https://github.com/akanefx2003'],
    ['MON GROUPE DE SUPPORT',       'https://chat.whatsapp.com/F9yJB6Xnbks55gS6URvdX2'],
    ['MA CHAÎNE WHATSAPP',          'https://whatsapp.com/channel/0029Vb865EJ0QeapgV7MkP2D'],
    ['MON CANAL TELEGRAM',          'https://t.me/akane_md'],
    ['MON GROUPE TELEGRAM',         'https://t.me/+u1LxUwWBtxBlMzE0'],
];
const CONNECT_NOTE = 'Suivre et partager ces liens est le meilleur moyen de soutenir le dev 🙏';

if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
if (!fs.existsSync(path.join(INSTANCE_DIR, 'database'))) fs.mkdirSync(path.join(INSTANCE_DIR, 'database'), { recursive: true });

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch {}
    const defaults = { prefix: '.', publicMode: false, sudoList: [], reaction: '🌹', groups: {}, language: settings.language || 'fr' };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }

function uptimeStr() {
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600).toString().padStart(2, '0');
    const m = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(uptime % 60).toString().padStart(2, '0');
    return `${h}h:${m}min:${s}s`;
}

// Code de pairing personnalisé (settings.js) : doit faire exactement 8
// caractères alphanumériques (règle imposée par WhatsApp). Sinon on laisse
// WhatsApp générer un code aléatoire (undefined = comportement par défaut).
function getPairingCode() {
    const code = (settings.pairingCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return code.length === 8 ? code : undefined;
}

// ─── Style — un seul cadre, petit, pour tout le bot ───────────────────────────
// ╭⊷─────────◈
// *┃ · ͟͟͞͞➳❥label :* *_valeur_*
// ╰⊷─────────◈
// > *© <botName>* by *<devName>*
// Le nom du bot et du dev viennent de settings.js — les changer là-bas
// suffit à mettre à jour ce footer partout (menu, commandes, plugins...).

const FRAME_TOP = '╭⊷─────────◈';
const FRAME_BOT = '╰⊷─────────◈';
const FOOTER    = `> *© ${settings.botName}* by *${settings.devName}*`;
const LINE      = (txt) => `┆ *㊧ ${txt}*`;

// Cadre décoratif utilisé uniquement par le menu (sections multiples)
function styledBox(title, lines) {
    return [`\`${title}\``, FRAME_TOP, ...lines.map(LINE), FRAME_BOT].join('\n');
}

// Cadre standard pour TOUTES les réponses de commandes.
// Accepte des chaînes simples ("titre") ou des paires [label, valeur].
// Nouveau cadre — même style que le menu BOT-INFOS (╭⊷ ... ╰⊷, connecteur
// "┃ · ͟͟͞͞➳❥*" et footer avec 🌹). Signature inchangée (rétrocompatible avec
// tous les appels existants box(...) / box([label, valeur])) : le style de
// TOUTE commande qui passe par box() (core, groupe, et tous les plugins via
// ctx.box) change automatiquement, sans avoir à toucher chaque appel.
const BOX_TOP    = '*╭⊷──────────⊷*';
const BOX_BOTTOM = () => `╰⊷─────────◈`;
const boxLine = (item) => {
    if (typeof item === 'string' && item.startsWith('┠')) return `*${item}*`; // séparateur brut (ex: version)
    return Array.isArray(item)
        ? `*┃ · ͟͟͞͞➳❥* *${item[0]} :* _${item[1]}_`
        : ` *┃ · ͟͟͞͞➳❥* ${item}`;
};

function box(...items) {
    return [BOX_TOP, ...items.map(boxLine), BOX_BOTTOM()].join('\n');
}

// Même style, avec un titre en en-tête : *╭⊷〔 TITRE 〕*
// Utilisé par les commandes "outils" (song, mail, url...) pour afficher leur
// nom, comme dans le menu. ctx.titledBox('SONG', ...) depuis un plugin.
function titledBox(title, ...items) {
    return [`*╭⊷〔 ${title} 〕*`, ...items.map(boxLine), BOX_BOTTOM()].join('\n');
}

// ─── Gestionnaire de plugins ────────────────────────────────────────────────
// Un plugin est un fichier .js dans ./plugins qui exporte par défaut :
// { name, commands: [...], category: 'outils' | 'groupe', description, handler(client, message, args, ctx), onMessage?(client, message, ctx), onGroupUpdate?(client, update, ctx) }

class PluginManager {
    constructor() { this.plugins = new Map(); }

    async loadFromFile(filePath) {
        try {
            const url    = pathToFileURL(filePath).href + '?t=' + Date.now();
            const mod    = await import(url);
            const plugin = mod.default || mod;
            if (!plugin.name || !Array.isArray(plugin.commands) || typeof plugin.handler !== 'function') {
                throw new Error('Plugin invalide : doit exporter { name, commands, handler }');
            }
            this.plugins.set(plugin.name, plugin);
            console.log(`✅ Plugin chargé : ${plugin.name} (${plugin.commands.join(', ')})`);
        } catch (err) {
            console.error(`❌ Erreur chargement plugin ${filePath} :`, err.message);
        }
    }

    async loadAll() {
        if (!fs.existsSync(PLUGINS_DIR)) return;
        const files = fs.readdirSync(PLUGINS_DIR).filter(f => f.endsWith('.js'));
        for (const file of files) await this.loadFromFile(path.join(PLUGINS_DIR, file));
        console.log(`📦 ${this.plugins.size} plugin(s) chargé(s)`);
    }

    // Enregistre une commande codée en dur (index.js) comme un plugin nommé,
    // au même titre qu'un fichier chargé depuis ./plugins — elle compte dans
    // le total de plugins et apparaît via list()/resolve() comme les autres.
    registerNative(name, category, handleCoreCommand) {
        this.plugins.set(name, {
            name,
            commands: [name],
            category,
            native: true,
            handler: (client, message, args, ctx) => handleCoreCommand(client, message, name, args, ctx.config),
        });
    }

    // Retourne le plugin qui gère cette commande, ou null si elle n'existe dans aucun plugin
    resolve(command) {
        for (const plugin of this.plugins.values()) {
            if (plugin.commands.includes(command)) return plugin;
        }
        return null;
    }

    list(category) {
        return [...this.plugins.values()].filter(p => p.enabled !== false && (!category || p.category === category));
    }
}

const pluginManager  = new PluginManager();
const activeGames    = new Map(); // sender -> { type, answer } (utilisé par les plugins jeux)
const subSessions    = new Map(); // numéro -> socket Baileys (sessions créées via .pair)

// ─── Anti-doublon des messages ─────────────────────────────────────────────
// Baileys peut réémettre 'messages.upsert' pour un même message (retry de
// déchiffrement, replay après reconnexion, historique...), ce qui faisait
// répondre le bot deux fois à une seule commande (ex: .menu envoyé 2x) — et,
// deux médias envoyés coup sur coup pouvait aussi faire apparaître « en
// attendant de ce message... » côté destinataire. On ne traite chaque
// message qu'une seule fois, quel que soit le nombre de fois où Baileys le
// livre.
const PROCESSED_TTL_MS   = 5 * 60 * 1000;
const processedMessageIds = new Map(); // "chat:id" -> timestamp de traitement

function alreadyProcessed(key) {
    if (!key) return false;
    const now = Date.now();
    for (const [k, t] of processedMessageIds) {
        if (now - t > PROCESSED_TTL_MS) processedMessageIds.delete(k);
    }
    if (processedMessageIds.has(key)) return true;
    processedMessageIds.set(key, now);
    return false;
}

// ─── Menu ──────────────────────────────────────────────────────────────────

// ─── Menu "BOT-INFOS" (traduit fr/en) ──────────────────────────────────────
// Affiché par .menu / .help ET quand quelqu'un envoie une simple lettre.
// Le texte ET l'image changent selon config.language (settings.images.menuFr
// / settings.images.menuEn) — jamais la même image pour les deux langues.
// USER : affiche le pushName (nom WhatsApp) de la personne qui a tapé la
// commande — repli sur settings.userLabel (« monarque »/« monarch ») si
// WhatsApp n'a pas transmis de pushName.
function buildBotInfosMenu(config, message) {
    const isFr  = getLang(config) === 'fr';
    const date  = new Date().toLocaleDateString('fr-FR');
    const fallbackUser = settings.userLabel?.[isFr ? 'fr' : 'en'] || (isFr ? 'monarque' : 'monarch');
    const user  = message?.pushName?.trim() || fallbackUser;
    const dev   = settings.devShortName || 'akane';
    const theme = settings.theme || 'jin woo';
    const link  = settings.botLink || REPO_LINK;
    const langCmd = isFr ? 'setlangue' : 'setlanguage';
    const cmdCount = pluginManager.plugins.size;

    const lines = isFr ? [
        '*╭⊷〔 BOT-INFOS 〕*',
        `*┃· ͟͟͞͞➳❥* *ULTIME :* *_${uptimeStr()}_*`,
        `*┃ · ͟͟͞͞➳❥* *DATE :* *_${date}_*`,
        `*┃ · ͟͟͞͞➳❥* *PREFIX :* *_${config.prefix}_*`,
        `*┃ · ͟͟͞͞➳❥* *LANGUE :* *_français_*`,
        `*┃ · ͟͟͞͞➳❥* *COMMANDES :* *_${cmdCount}_*`,
        `*┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5*`,
        `*┃ · ͟͟͞͞➳❥* *THÈME :*  *_${theme}_*`,
        `*┃ · ͟͟͞͞➳❥* *DEV :* *_${dev}_*`,
        `*┃ · ͟͟͞͞➳❥* *USER :* _${user}_`,
        `*┃ · ͟͟͞͞➳❥* *LIEN DU BOT :* ${link}`,
        '╭─────────◈',
        '*┃  A*┃ *allmenu*',
        '*┃  K* ❥ *bot-menu*',
        `*┃  4* *❥ ${langCmd}*`,
        '*┃  N* *❥ tools-menu*',
        '*┃  E  ❥ gc-menu*',
        '*┃  M ❥ fun-menu*',
        '*┃  D* *┃dev-menu*',
        `╰⊷─────────◈`,
        '> *Écrivez une lettre pour voir le menu.*',
    ] : [
        '*╭⊷〔 BOT-INFOS 〕*',
        `*┃· ͟͟͞͞➳❥* *UPTIME :* *_${uptimeStr()}_*`,
        `*┃ · ͟͟͞͞➳❥* *DATE :* *_${date}_*`,
        `*┃ · ͟͟͞͞➳❥* *PREFIX :* *_${config.prefix}_*`,
        `*┃ · ͟͟͞͞➳❥* *LANGUAGE :* *_english_*`,
        `*┃ · ͟͟͞͞➳❥* *COMMANDS :* *_${cmdCount}_*`,
        `*┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5*`,
        `*┃ · ͟͟͞͞➳❥* *THEME :*  *_${theme}_*`,
        `*┃ · ͟͟͞͞➳❥* *DEV :* *_${dev}_*`,
        `*┃ · ͟͟͞͞➳❥* *USER :* _${user}_`,
        `*┃ · ͟͟͞͞➳❥* *BOT-LINK :* ${link}`,
        '╭─────────◈',
        '*┃  A*┃ *allmenu*',
        '*┃  K* ❥ *bot-menu*',
        `*┃  4* *❥ ${langCmd}*`,
        '*┃  N* *❥ tools-menu*',
        '*┃  E  ❥ gc-menu*',
        '*┃  M ❥ fun-menu*',
        '*┃  D* *┃dev-menu*',
        `╰⊷─────────◈`,
        '> *Write any letter to see the menu.*',
    ];

    return lines.join('\n');
}

function botInfosImage(config) {
    const isFr = getLang(config) === 'fr';
    return (isFr ? settings.images?.menuFr : settings.images?.menuEn) || settings.menuImage;
}

async function sendBotInfosMenu(client, sender, config, message) {
    const caption = buildBotInfosMenu(config, message);
    const image   = botInfosImage(config);
    if (image) return client.sendMessage(sender, { image: { url: image }, caption }, { quoted: message });
    return client.sendMessage(sender, { text: caption }, { quoted: message });
}

function buildMenu(config) {
    const mode  = config.publicMode ? '𝗽𝘂𝗯𝗹𝗶𝗰' : '𝗽𝗿𝗶𝘃𝗲';
    const owner = config.owner || '𝗮𝗸𝗮𝗻𝗲';

    const system = styledBox('ᑲ᥆𝗍-sᥡs𝗍ᥱmᥱs', [
        `𝐌𝐎𝐃𝐄 : _${mode}_`,
        `𝐀𝐋𝐈𝐕𝐄 : _${uptimeStr()}_`,
        `𝐍𝐀𝐌𝐄 : _${settings.botName}_`,
        `𝐃𝐄𝐕 : _${settings.devName}_`,
        `𝐕𝐄𝐑𝐒𝐈𝐎𝐍 : _personnalisé_`,
        `𝐏𝐋𝐔𝐆𝐈𝐍𝐒 : _${pluginManager.plugins.size}/100_`,
        `𝐏𝐑𝐄𝐅𝐈𝐗𝐄 : _${config.prefix}_`,
        `𝐔𝐒𝐄𝐑 : _${owner}_`,
    ]);

    const botMenu = styledBox('ᑲ᥆𝗍-mᥱᥒᥙ', pluginManager.list('core').flatMap(p => p.commands).map(c => `_${c}_`));

    const groupe = styledBox('gr᥆ᥙ⍴ᥱ', pluginManager.list('groupe').flatMap(p => p.commands).map(c => `_${c}_`));

    // ── Outils-jeu : uniquement les commandes réellement présentes dans ./plugins ──
    const outilsPlugins = pluginManager.list('outils');
    let outils = null;
    if (outilsPlugins.length) {
        const lines = outilsPlugins.flatMap(p => p.commands).map(c => `_${c}_`);
        outils = styledBox('᥆ᥙ𝗍іᥣs-ȷᥱᥙ', lines);
    }

    const blocks = [system, botMenu, groupe];
    if (outils) blocks.push(outils);
    blocks.push(FOOTER);
    return blocks.join('\n');
}

// ─── Sous-menus tools-menu / gc-menu / fun-menu / dev-menu ─────────────────
// Même style que le menu (titledBox), traduits fr/en, avec leur propre photo
// gérée depuis settings.js (settings.images.tools / .gc / .fun / .dev).
function buildSubMenu(config, category, titleKey) {
    const title    = t(config, titleKey);
    const commands = pluginManager.list(category).flatMap(p => p.commands);
    if (!commands.length) return titledBox(title, t(config, 'menuEmpty'));
    return titledBox(title, ...commands.map(c => `*${config.prefix}${c}*`));
}

async function sendSubMenu(client, sender, config, message, category, titleKey, imageKey) {
    const caption = buildSubMenu(config, category, titleKey);
    const image   = settings.images?.[imageKey] || settings.menuImage;
    if (image) return client.sendMessage(sender, { image: { url: image }, caption }, { quoted: message });
    return client.sendMessage(sender, { text: caption }, { quoted: message });
}

const sendToolsMenu = (client, sender, config, message) => sendSubMenu(client, sender, config, message, 'outils', 'toolsMenuTitle', 'tools');
const sendGcMenu    = (client, sender, config, message) => sendSubMenu(client, sender, config, message, 'groupe', 'gcMenuTitle', 'gc');
const sendFunMenu   = (client, sender, config, message) => sendSubMenu(client, sender, config, message, 'fun', 'funMenuTitle', 'fun');
const sendDevMenu   = (client, sender, config, message) => sendSubMenu(client, sender, config, message, 'dev', 'devMenuTitle', 'dev');

async function sendMenu(client, sender, config, message) {
    const caption = buildMenu(config);
    if (settings.menuImage) {
        return client.sendMessage(sender, { image: { url: settings.menuImage }, caption }, { quoted: message });
    }
    return client.sendMessage(sender, { text: caption }, { quoted: message });
}

// ─── Commandes core (toujours actives, sans plugin) ───────────────────────────

const CORE_COMMANDS  = ['menu', 'allmenu', 'help', 'setprefix', 'ping', 'restart', 'repo', 'public', 'private', 'pair', 'setlangue', 'setlanguage', 'tools-menu', 'toolsmenu', 'gc-menu', 'gcmenu', 'fun-menu', 'funmenu', 'dev-menu', 'devmenu', 'getjid', 'channeljid'];
const GROUP_COMMANDS = ['invite', 'tagall', 'kick', 'kickall', 'kickall2', 'promote', 'demote', 'setname', 'setprofil', 'left'];
// antibot / antilink / welcome sont des plugins (./plugins) mais restent réservés au owner
const OWNER_ONLY = new Set(['setprefix', 'restart', 'public', 'private', 'pair', 'antibot', 'antilink', 'welcome', 'left', 'kickall', 'kickall2', 'promote', 'demote', 'setlangue', 'setlanguage', 'getjid', 'channeljid']);

// Ces commandes sont codées en dur juste en dessous (handleCoreCommand), mais
// on les enregistre quand même comme des plugins nommés dans le PluginManager :
// elles comptent dans le total de plugins et sortent dans le menu comme les autres.
CORE_COMMANDS.forEach(c => pluginManager.registerNative(c, 'core', handleCoreCommand));
GROUP_COMMANDS.forEach(c => pluginManager.registerNative(c, 'groupe', handleCoreCommand));

// Déballe les messages enveloppés (discussions éphémères, vue unique...)
function unwrapMessage(m) {
    let cur = m;
    for (let i = 0; i < 5 && cur; i++) {
        const inner = cur.ephemeralMessage?.message || cur.viewOnceMessage?.message
            || cur.viewOnceMessageV2?.message || cur.documentWithCaptionMessage?.message;
        if (!inner) break;
        cur = inner;
    }
    return cur;
}

const _digits  = (jid) => (jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
const isAdminP = (p) => p?.admin === 'admin' || p?.admin === 'superadmin';

// Un participant peut être identifié par son numéro OU par son LID (groupes en @lid) :
// on compare tous ses identifiants, pas seulement p.id.
function participantDigits(p) {
    return [p.id, p.lid, p.phoneNumber].filter(Boolean).map(_digits);
}
function botDigits(client) {
    return [client.user?.id, client.user?.lid].filter(Boolean).map(_digits);
}

const NOT_ADMIN_MSG = () => box(['⚠️ Je ne suis pas admin', 'Passe-moi admin dans ce groupe pour utiliser cette commande']);
const isNotAuthorized = (e) => /not-authorized|forbidden/i.test(e?.message || '') || e?.output?.statusCode === 403 || e?.data === 403;

// Vérifie que le bot est admin AVANT d'agir. S'il ne l'est pas : il prévient et ne fait rien
// (jamais de départ du groupe). Si son statut est indéterminable, on laisse essayer :
// une éventuelle erreur « not-authorized » est traduite par le même avertissement.
async function guardBotAdmin(client, groupJid, message) {
    const meta = await client.groupMetadata(groupJid);
    const me   = botDigits(client);
    const botP = meta.participants.find(p => participantDigits(p).some(d => me.includes(d)));
    if (botP && !isAdminP(botP)) {
        await client.sendMessage(groupJid, { text: NOT_ADMIN_MSG() }, { quoted: message });
        return null;
    }
    return { meta, me };
}

async function removeMembers(client, groupJid, jids) {
    const res = await client.groupParticipantsUpdate(groupJid, jids, 'remove');
    return Array.isArray(res) ? res.filter(r => String(r.status) === '200').length : jids.length;
}

function getTargetJid(message) {
    const ctx = unwrapMessage(message.message)?.extendedTextMessage?.contextInfo;
    if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
    if (ctx?.participant) return ctx.participant;
    return null;
}

const GROUP_ONLY_MSG = () => box('❌ Commande réservée aux groupes');

async function handleCoreCommand(client, message, command, args, config) {
    const sender  = message.key.remoteJid;
    const isGroup = sender.endsWith('@g.us');

    switch (command) {
        case 'menu':
            return sendBotInfosMenu(client, sender, config, message);

        // Menu détaillé : infos système + liste de TOUTES les commandes chargées
        // (contrairement à .menu qui n'affiche que la carte BOT-INFOS)
        case 'allmenu':
            return sendMenu(client, sender, config, message);

        case 'tools-menu':
        case 'toolsmenu':
            return sendToolsMenu(client, sender, config, message);

        case 'gc-menu':
        case 'gcmenu':
            return sendGcMenu(client, sender, config, message);

        case 'fun-menu':
        case 'funmenu':
            return sendFunMenu(client, sender, config, message);

        case 'dev-menu':
        case 'devmenu':
            return sendDevMenu(client, sender, config, message);

        case 'help': {
            const all = pluginManager.list().flatMap(p => p.commands);
            const caption = box(['📖 Aide', 'Commandes disponibles'], [config.prefix, all.join(` • ${config.prefix}`)]);
            const helpImage = settings.images?.help || settings.menuImage;
            if (helpImage) {
                return client.sendMessage(sender, { image: { url: helpImage }, caption }, { quoted: message });
            }
            return client.sendMessage(sender, { text: caption }, { quoted: message });
        }

        // .getjid [lien ou code d'invitation] — récupère le JID technique
        // (xxxx@newsletter) d'une chaîne WhatsApp à partir de son lien
        // d'invitation. Sans argument, utilise settings.channelLink.
        // Le JID renvoyé est celui à coller dans settings.channelJid.
        case 'getjid':
        case 'channeljid': {
            const input = (args[0] || settings.channelLink || '').trim();
            if (!input) {
                return client.sendMessage(sender, {
                    text: box(['Usage', `${config.prefix}getjid [lien ou code d'invitation de la chaîne]`]),
                }, { quoted: message });
            }
            const inviteMatch = input.match(/channel\/([A-Za-z0-9]+)/i);
            const code = inviteMatch ? inviteMatch[1] : input;

            if (typeof client.newsletterMetadata !== 'function') {
                return client.sendMessage(sender, {
                    text: box(['❌ Indisponible', "Cette version de Baileys ne supporte pas newsletterMetadata"]),
                }, { quoted: message });
            }

            try {
                const meta = await client.newsletterMetadata('invite', code);
                const jid  = meta?.id || meta?.jid;
                if (!jid) throw new Error('JID introuvable dans la réponse de WhatsApp');
                return client.sendMessage(sender, {
                    text: box(['✅ JID de la chaîne', jid], ['Nom', meta.name || meta.subject || '—']),
                }, { quoted: message });
            } catch (err) {
                return client.sendMessage(sender, {
                    text: box(['❌ Erreur', err.message || 'Lien/code invalide ou chaîne introuvable']),
                }, { quoted: message });
            }
        }

        case 'ping': {
            const start = Date.now();
            await client.sendMessage(sender, { react: { text: '🏓', key: message.key } });
            const ms = Date.now() - start;
            return client.sendMessage(sender, {
                image: { url: PING_IMAGE },
                caption: box(['pong', `${ms}ms`], ['runtime', uptimeStr()]),
            }, { quoted: message });
        }

        case 'setprefix': {
            const newPrefix = args[0];
            if (!newPrefix || newPrefix.length > 3) return client.sendMessage(sender, { text: box(['Usage', `${config.prefix}setprefix [caractère]`]) }, { quoted: message });
            config.prefix = newPrefix;
            saveConfig(config);
            return client.sendMessage(sender, { text: box(['✅ Préfixe changé', newPrefix]) }, { quoted: message });
        }

        // .setlangue fr|en (ou .setlanguage fr|en) — change la langue du bot.
        // S'applique immédiatement au menu BOT-INFOS et à tous les plugins
        // traduits (song, mail...) via ctx.config.language / t(ctx.config, clé).
        case 'setlangue':
        case 'setlanguage': {
            const wanted = (args[0] || '').toLowerCase();
            if (!LANGS.includes(wanted)) {
                return client.sendMessage(sender, {
                    text: box([t(config, 'langUsage'), `${config.prefix}${t(config, 'langUsageEx')}`]),
                }, { quoted: message });
            }
            config.language = wanted;
            saveConfig(config);
            return client.sendMessage(sender, {
                text: box([t(config, 'langChanged'), wanted === 'fr' ? 'français' : 'english']),
            }, { quoted: message });
        }

        case 'restart':
            await client.sendMessage(sender, { text: box('🔄 Redémarrage en cours...') }, { quoted: message });
            shutdown('restart'); // ferme proprement le socket puis quitte — à relancer via un supervisor (pm2, panel...)
            return;

        case 'repo':
            return client.sendMessage(sender, { text: box(['📦 Code source', REPO_LINK]), nativeFlow: [{ text: 'VOIR LE REPO 📦', url: REPO_LINK }] }, { quoted: message });

        case 'public':
            config.publicMode = true; saveConfig(config);
            return client.sendMessage(sender, { text: box('✅ Mode public activé') }, { quoted: message });

        case 'private':
            config.publicMode = false; saveConfig(config);
            return client.sendMessage(sender, { text: box('✅ Mode privé activé') }, { quoted: message });

        case 'pair': {
            const number = (args[0] || '').replace(/[^0-9]/g, '');
            if (!number) return client.sendMessage(sender, { text: box(['Usage', `${config.prefix}pair [numéro]`]) }, { quoted: message });
            if (subSessions.has(number)) {
                return client.sendMessage(sender, { text: box(['⚠️ Déjà connecté', `+${number} a déjà sa propre session active`]) }, { quoted: message });
            }
            await client.sendMessage(sender, { text: box(['⏳ Session en cours de création', `+${number}`], ['Info', 'Le code de connexion arrive dans quelques secondes...']) }, { quoted: message });
            createSubSession(number, sender, client).catch(err => {
                client.sendMessage(sender, { text: box(['❌ Erreur', err.message]) }).catch(() => {});
            });
            return;
        }

        // ── Groupe ──
        case 'invite': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const code = await client.groupInviteCode(sender);
            return client.sendMessage(sender, { text: box(['🔗 Lien', `https://chat.whatsapp.com/${code}`]) }, { quoted: message });
        }

        case 'tagall': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const meta     = await client.groupMetadata(sender);
            const mentions = meta.participants.map(p => p.id);
            const text     = args.join(' ') || 'Attention à tous 📢';
            const lines    = [`📢 ${text}`, ...mentions.map(m => `@${m.split('@')[0]}`)];
            return client.sendMessage(sender, { text: box(...lines), mentions }, { quoted: message });
        }

        case 'kick': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const target = getTargetJid(message);
            if (!target) return client.sendMessage(sender, { text: box(['Usage', `mentionne ou réponds à quelqu'un avec ${config.prefix}kick`]) }, { quoted: message });
            if (!await guardBotAdmin(client, sender, message)) return;
            await client.groupParticipantsUpdate(sender, [target], 'remove');
            return client.sendMessage(sender, { text: box('✅ Membre retiré') }, { quoted: message });
        }

        // kickall  : retire les membres NON-ADMINS, par lots de ~4/seconde jusqu'à la fin
        // kickall2 : retire tout le monde SAUF les admins, EN UN SEUL COUP
        // Le bot, le créateur du groupe, celui qui lance la commande et TOUS les admins
        // ne sont jamais retirés (par les deux commandes).
        case 'kickall':
        case 'kickall2': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const info = await guardBotAdmin(client, sender, message);
            if (!info) return;

            const skip = new Set([...info.me, _digits(message.key.participant)].filter(Boolean));
            const targets = info.meta.participants
                .filter(p => !participantDigits(p).some(d => skip.has(d)))
                .filter(p => !p.admin) // admins ET superadmins exclus, pour les deux commandes
                .map(p => p.id);

            if (!targets.length) return client.sendMessage(sender, { text: box('ℹ️ Aucun membre à retirer') }, { quoted: message });

            let ok = 0, ko = 0, denied = false;

            if (command === 'kickall2') {
                await client.sendMessage(sender, { text: box(['⏳ Expulsion en cours', `${targets.length} membre(s) d'un coup (admins épargnés)`]) }, { quoted: message });
                try { ok = await removeMembers(client, sender, targets); }
                catch (e) { if (isNotAuthorized(e)) denied = true; else throw e; }
                ko = denied ? 0 : targets.length - ok;
            } else {
                const CHUNK = 4; // ~4 membres/seconde
                await client.sendMessage(sender, { text: box(['⏳ Expulsion en cours', `${targets.length} membre(s), ${CHUNK}/seconde (admins épargnés)`]) }, { quoted: message });
                for (let i = 0; i < targets.length; i += CHUNK) {
                    const batch = targets.slice(i, i + CHUNK);
                    try { ok += await removeMembers(client, sender, batch); }
                    catch (e) { if (isNotAuthorized(e)) { denied = true; break; } }
                    if (i + CHUNK < targets.length) await new Promise(r => setTimeout(r, 1000)); // 1s entre chaque lot de 4
                }
                ko = denied ? 0 : targets.length - ok;
            }

            if (denied && !ok) return client.sendMessage(sender, { text: NOT_ADMIN_MSG() }, { quoted: message });

            const rows = [['✅ Retirés', `${ok}/${targets.length}`]];
            if (ko)     rows.push(['⚠️ Échecs', ko]);
            if (denied) rows.push(['⚠️ Refusé par WhatsApp', 'vérifie que je suis bien admin']);
            return client.sendMessage(sender, { text: box(...rows) }, { quoted: message });
        }

        case 'promote': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const target = getTargetJid(message);
            if (!target) return client.sendMessage(sender, { text: box(['Usage', `mentionne ou réponds à quelqu'un avec ${config.prefix}promote`]) }, { quoted: message });
            if (!await guardBotAdmin(client, sender, message)) return;
            await client.groupParticipantsUpdate(sender, [target], 'promote');
            return client.sendMessage(sender, { text: box('✅ Membre promu admin') }, { quoted: message });
        }

        case 'demote': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const target = getTargetJid(message);
            if (!target) return client.sendMessage(sender, { text: box(['Usage', `mentionne ou réponds à quelqu'un avec ${config.prefix}demote`]) }, { quoted: message });
            if (!await guardBotAdmin(client, sender, message)) return;
            await client.groupParticipantsUpdate(sender, [target], 'demote');
            return client.sendMessage(sender, { text: box('✅ Admin rétrogradé') }, { quoted: message });
        }

        case 'setname': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const name = args.join(' ');
            if (!name) return client.sendMessage(sender, { text: box(['Usage', `${config.prefix}setname [nom]`]) }, { quoted: message });
            await client.groupUpdateSubject(sender, name);
            return client.sendMessage(sender, { text: box('✅ Nom du groupe mis à jour') }, { quoted: message });
        }

        // Photo du groupe : réponds à une image avec la commande, ou envoie une image avec la commande en légende
        case 'setprofil': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            const content = unwrapMessage(message.message);
            const quoted  = unwrapMessage(content?.extendedTextMessage?.contextInfo?.quotedMessage);
            const image   = content?.imageMessage || quoted?.imageMessage;
            if (!image) {
                return client.sendMessage(sender, { text: box(['Usage', `réponds à une image avec ${config.prefix}setprofil`], ['Astuce', `ou envoie une image avec ${config.prefix}setprofil en légende`]) }, { quoted: message });
            }
            if (!await guardBotAdmin(client, sender, message)) return;

            const { downloadContentFromMessage } = await import('baileys');
            let buffer = Buffer.alloc(0);
            for await (const chunk of await downloadContentFromMessage(image, 'image')) buffer = Buffer.concat([buffer, chunk]);

            await client.updateProfilePicture(sender, buffer);
            return client.sendMessage(sender, { text: box('✅ Photo du groupe mise à jour') }, { quoted: message });
        }

        case 'left': {
            if (!isGroup) return client.sendMessage(sender, { text: GROUP_ONLY_MSG() }, { quoted: message });
            await client.sendMessage(sender, { text: box('👋 À bientôt !') });
            return client.groupLeave(sender);
        }
    }
}

// Réponses libres pour les jeux en cours (posés par des plugins via activeGames)
async function handleActiveGame(client, message) {
    const sender = message.key.remoteJid;
    const game   = activeGames.get(sender);
    if (!game) return false;
    const body = (message.message?.extendedTextMessage?.text || message.message?.conversation || '').trim().toLowerCase();
    if (!body) return false;
    if (body === game.answer.toLowerCase()) {
        activeGames.delete(sender);
        await client.sendMessage(sender, { text: box('🎉 Bonne réponse !') }, { quoted: message });
        return true;
    }
    return false;
}

// ─── Handler principal ────────────────────────────────────────────────────────

// Numéros des sessions du bot (principale + .pair) : les plugins ne doivent jamais les traiter comme des membres
function getOwnNumbers() {
    return [mainSock, ...subSessions.values()]
        .flatMap(sk => [sk?.user?.id, sk?.user?.lid])
        .concat([...subSessions.keys()])
        .filter(Boolean).map(_digits);
}

// Événements de groupe (arrivées, départs, promotions...) transmis aux plugins qui exposent onGroupUpdate
async function handleGroupUpdate(client, update) {
    const config = loadConfig();
    const ctx    = { config, box, titledBox, prefix: config.prefix, activeGames, PLUGINS_DIR, settings, ownNumbers: getOwnNumbers(), t: (key) => t(config, key) };
    for (const plugin of pluginManager.plugins.values()) {
        if (plugin.enabled === false || typeof plugin.onGroupUpdate !== 'function') continue;
        try { await plugin.onGroupUpdate(client, update, ctx); } catch (e) { console.error(`❌ onGroupUpdate "${plugin.name}":`, e.message); }
    }
}

async function handleMessage(client, event) {
    // Ignore les lots qui ne sont pas de vrais nouveaux messages en direct
    // (ex: 'append' lors d'une resynchro) — seul 'notify' correspond à un
    // message qui vient réellement d'arriver.
    if (event.type && event.type !== 'notify') return;

    const config  = loadConfig();
    const { prefix, publicMode, sudoList } = config;
    const msgs    = event.messages;
    // ctx.t('cle') : traduction dans la langue courante du groupe/DM (config.language),
    // dispo pour tous les plugins (utilisé par url.js, et réutilisable par les autres).
    const ctx     = { config, box, titledBox, prefix, activeGames, PLUGINS_DIR, settings, ownNumbers: getOwnNumbers(), t: (key) => t(config, key) };

    for (const message of msgs) {
        if (!message.message) continue;

        // Anti-doublon : si ce message (même chat + même id) a déjà été
        // traité récemment, on l'ignore silencieusement — évite les réponses
        // envoyées deux fois pour une seule commande de l'utilisateur.
        const dedupeKey = message.key?.id ? `${message.key.remoteJid}:${message.key.id}` : null;
        if (dedupeKey && alreadyProcessed(dedupeKey)) continue;

        const content   = unwrapMessage(message.message);
        const body      = (content?.extendedTextMessage?.text || content?.conversation || content?.imageMessage?.caption || content?.videoMessage?.caption || '').trim();
        const sender    = message.key.remoteJid;
        const fromMe    = message.key.fromMe;
        const senderJid = message.key.participant || sender;
        const isOwner   = fromMe || sudoList.includes(senderJid);
        const isAllowed = publicMode || isOwner;

        // Hooks des plugins (ex : jeu en attente d'une réponse)
        for (const plugin of pluginManager.plugins.values()) {
            if (typeof plugin.onMessage === 'function') {
                try { await plugin.onMessage(client, message, ctx); } catch (e) { console.error(`❌ onMessage "${plugin.name}":`, e.message); }
            }
        }

        if (!body.startsWith(prefix)) {
            // "Écrivez une lettre pour voir le menu." / "Write any letter to see the menu." :
            // un message qui n'est qu'une seule lettre (n'importe laquelle) affiche le menu.
            if (/^[a-zA-Z]$/.test(body) && isAllowed) {
                const letterCommand = {
                    n: () => sendToolsMenu(client, sender, config, message),
                    e: () => sendGcMenu(client, sender, config, message),
                    m: () => sendFunMenu(client, sender, config, message),
                    d: () => sendDevMenu(client, sender, config, message),
                    a: () => sendMenu(client, sender, config, message),
                    k: () => sendBotInfosMenu(client, sender, config, message),
                }[body.toLowerCase()];
                try { await (letterCommand ? letterCommand() : sendBotInfosMenu(client, sender, config, message)); }
                catch (e) { console.error('❌ Erreur menu (lettre) :', e.message); }
                continue;
            }
            try { await handleActiveGame(client, message); } catch {}
            continue;
        }

        const commandAndArgs = body.slice(prefix.length).trim();
        const parts          = commandAndArgs.split(/\s+/);
        const command        = parts[0].toLowerCase();
        const args            = parts.slice(1);

        const plugin = pluginManager.resolve(command);

        // Commande introuvable (ni native, ni plugin) → on ferme simplement, aucune réponse
        if (!plugin) continue;

        const isMenuCmd  = command === 'menu' || command === 'help';
        // Toutes les commandes de groupe (GROUP_COMMANDS) + celles explicitement listées
        // dans OWNER_ONLY (dont antibot/antilink/welcome, des plugins) sont réservées au owner,
        // même si le bot est en mode public.
        const needsOwner = (OWNER_ONLY.has(command) || GROUP_COMMANDS.includes(command)) && !isMenuCmd;

        if (!isMenuCmd) {
            if (needsOwner && !isOwner) continue;
            if (!needsOwner && !isAllowed) continue;
        }

        try {
            await client.sendMessage(sender, { react: { text: config.reaction || '🌹', key: message.key } });
            await plugin.handler(client, message, args, ctx);
        } catch (e) {
            console.error(`❌ Erreur commande "${command}":`, e.message);
            const errText = isNotAuthorized(e) ? NOT_ADMIN_MSG() : box(['❌ Erreur', e.message]);
            await client.sendMessage(sender, { text: errText }).catch(() => {});
        }
    }
}

// ─── Connexion WhatsApp (pairing code) ───────────────────────────────────────

import readline from 'readline';

function askNumber() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question('\n📱 Entre ton numéro WhatsApp (ex: 242053889794) : ', (ans) => {
            rl.close();
            resolve(ans.trim().replace(/[^0-9]/g, ''));
        });
    });
}

// ─── Arrêt propre & anti-conflit de session ──────────────────────────────────
// Deux sockets qui utilisent les mêmes clés Signal (deux instances qui se
// chevauchent au redémarrage, ou un processus tué en pleine écriture) font
// diverger les sessions de chiffrement → « Bad MAC ». On évite les deux cas.

let shuttingDown = false;
let mainSock     = null;
let restarting     = false;  // redémarrage automatique en cours
let pendingNotify  = true;   // message de connexion à envoyer au prochain 'open' (1 fois par lancement)
let reconnectTimer = null;
let pluginsLoaded  = false;
let mainState      = 'close';
let closedSince    = Date.now();
let probeFails     = 0;

function shutdown(reason = 'signal') {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`🛑 Arrêt propre (${reason})...`);
    try { mainSock?.end(undefined); } catch {}
    for (const s of subSessions.values()) { try { s.end(undefined); } catch {} }
    // Laisse 1,5 s aux écritures de clés en cours avant de quitter
    setTimeout(() => process.exit(0), 1500);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Détache et ferme un socket mort avant d'en recréer un
function dropSocket(sock) {
    try { sock.ev.removeAllListeners(); } catch {}
    try { sock.end(undefined); } catch {}
}

// Crée une session Baileys indépendante pour un numéro donné (via .pair).
// Ce nouveau socket a son propre dossier d'auth, tourne en parallèle du bot
// principal, répond aux mêmes commandes (handleMessage) et envoie le code de
// pairing au demandeur (requesterJid) dès qu'il est prêt.
async function createSubSession(number, requesterJid, notifierClient) {
    const sessionDir = path.join(INSTANCE_DIR, 'sessions', `pair_${number}`);
    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    const sock = makeWASocket({
        version,
        auth:                state,
        printQRInTerminal:   false,
        logger:              pino({ level: 'silent' }),
        browser:             Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
    });

    applyAntiBan(sock);
    applyCanalInfo(sock);

    subSessions.set(number, sock);
    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection === 'connecting' && !codeSent && !sock.authState.creds.registered) {
            codeSent = true;
            await new Promise(r => setTimeout(r, 1500));
            try {
                const code = await sock.requestPairingCode(number, getPairingCode());
                const fmt  = code.match(/.{1,4}/g)?.join('-') || code;
                await notifierClient?.sendMessage(requesterJid, { text: box(['numéro', `+${number}`], ['code', fmt]) });
            } catch (err) {
                await notifierClient?.sendMessage(requesterJid, { text: box(['❌ Erreur', err.message]) })?.catch(() => {});
                subSessions.delete(number);
            }
        }

        if (connection === 'open') {
            console.log(`✅ Session +${number} connectée (${settings.botName})`);
            followOfficialChannel(sock).catch(() => {});
            const marker = path.join(sessionDir, '.welcomed');
            if (!fs.existsSync(marker)) {
                fs.writeFileSync(marker, String(Date.now()));
                setTimeout(() => sendConnectedMessage(sock).catch(e => console.error(`❌ [+${number}] message de connexion :`, e.message)), 3000);
            }
        }

        if (connection === 'close') {
            if (shuttingDown) return;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const replaced   = statusCode === DisconnectReason.connectionReplaced;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !replaced;
            if (replaced) {
                // Session ouverte ailleurs : on ne se reconnecte pas, sinon les deux se remplacent en boucle
                console.log(`⚠️ [+${number}] session remplacée (440) — pas de reconnexion`);
                dropSocket(sock);
                subSessions.delete(number);
            } else if (shouldReconnect) {
                dropSocket(sock);
                const retry = (delay) => setTimeout(() => {
                    createSubSession(number, requesterJid, notifierClient).catch(err => {
                        console.error(`❌ [+${number}] reconnexion :`, err.message);
                        retry(10000);
                    });
                }, delay);
                retry(3000);
            } else {
                subSessions.delete(number);
                try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
            }
        }
    });

    sock.ev.on('messages.upsert', async (event) => {
        try { await handleMessage(sock, event); } catch (err) { console.error(`❌ [+${number}] handleMessage :`, err.message); }
    });

    sock.ev.on('group-participants.update', (update) => {
        handleGroupUpdate(sock, update).catch(err => console.error(`❌ [+${number}] handleGroupUpdate :`, err.message));
    });

    return sock;
}

async function startBot() {
    clearTimeout(reconnectTimer);
    if (!pluginsLoaded) { await pluginManager.loadAll(); pluginsLoaded = true; }

    const { version }          = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(path.join(INSTANCE_DIR, 'sessions', 'main'));

    const sock = makeWASocket({
        version,
        auth:                           state,
        printQRInTerminal:              false,
        logger:                         pino({ level: 'silent' }),
        browser:                        Browsers.ubuntu('Chrome'),
        keepAliveIntervalMs:            10000,
        connectTimeoutMs:               60000,
        syncFullHistory:                false,
        markOnlineOnConnect:            true,
        generateHighQualityLinkPreview: true,
    });

    mainSock = sock;

    applyAntiBan(sock);
    applyCanalInfo(sock);

    sock.ev.on('creds.update', saveCreds);

    let codeSent = false;

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {

        if (connection === 'connecting' && !codeSent && !sock.authState.creds.registered) {
            codeSent = true;
            await new Promise(r => setTimeout(r, 2000));
            try {
                let number = process.env.OWNER_NUMBER || loadConfig().owner;
                if (!number) number = await askNumber();
                number = number.replace(/[^0-9]/g, '');

                const code = await sock.requestPairingCode(number, getPairingCode());
                const fmt  = code.match(/.{1,4}/g)?.join('-') || code;

                console.log(`\n${FRAME_TOP}`);
                console.log(`┆ ⊹ ${settings.botName} ⊹`);
                console.log(`┆ 🔑 NUMÉRO : +${number}`);
                console.log(`┆ 🔐 CODE   : ${fmt}`);
                console.log(`┆ ⚠️  EXPIRE DANS : 60s`);
                console.log(`${FRAME_BOT}`);
                console.log(`\n👉 Va dans WhatsApp → Appareils connectés → Connecter → Entre le code\n`);
            } catch (err) {
                console.error('❌ Erreur pairing code :', err.message);
                process.exit(1);
            }
        }

        if (connection === 'open') {
            console.log(`✅ ${settings.botName} connecté !`);
            mainState = 'open'; closedSince = 0; probeFails = 0;
            followOfficialChannel(sock).catch(() => {});
            const number = sock.user.id.split(':')[0];
            const cfg = loadConfig();
            if (!cfg.owner) { cfg.owner = number; saveConfig(cfg); }
            if (pendingNotify) {
                pendingNotify = false;
                setTimeout(() => sendConnectedMessage(sock).catch(e => console.error('❌ Message de connexion :', e.message)), 3000);
            }
        }

        if (connection === 'close') {
            if (shuttingDown) return;
            const statusCode      = lastDisconnect?.error?.output?.statusCode;
            const replaced        = statusCode === DisconnectReason.connectionReplaced;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !replaced;
            mainState = 'close'; closedSince = Date.now();
            console.log('🔌 Connexion fermée. Code :', statusCode, '| Reconnexion :', shouldReconnect);

            if (replaced) {
                // Une autre instance utilise déjà cette session (440). Se reconnecter ferait
                // se battre les deux instances sur les mêmes clés → Bad MAC. On s'arrête.
                console.log('⚠️ Session ouverte par une autre instance du bot — arrêt pour éviter le conflit.');
                process.exit(0);
            } else if (shouldReconnect) {
                dropSocket(sock);
                scheduleReconnect(3000);
            } else {
                console.log('🚪 Déconnecté (logout) — nettoyage de la session et arrêt du process.');
                try { fs.rmSync(path.join(INSTANCE_DIR, 'sessions', 'main'), { recursive: true, force: true }); } catch (e) {}
                process.exit(0);
            }
        }
    });

    sock.ev.on('messages.upsert', async (event) => {
        try {
            await handleMessage(sock, event);
        } catch (err) {
            console.error('❌ Erreur handleMessage :', err.message);
        }
    });

    sock.ev.on('group-participants.update', (update) => {
        handleGroupUpdate(sock, update).catch(err => console.error('❌ Erreur handleGroupUpdate :', err.message));
    });

    return sock;
}

// ─── Message de connexion (DM) ───────────────────────────────────────────────

function buildConnectedMessage() {
    return [
        FRAME_TOP,
        `*┆㊧  ${CONNECT_TITLE} ✅*`,
        FRAME_BOT,
        '',
        ...CONNECT_LINKS.map(([label, url]) => `*${label} :* ${url}`),
        '',
        `_${CONNECT_NOTE}_`,
        FOOTER,
    ].join('\n');
}

async function fetchImageBuffer(url) {
    try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return buf.length ? buf : null;
    } catch { return null; }
}

// Envoie le message de confirmation en DM (« Moi-même ») avec l'image du welcome.
async function sendConnectedMessage(sock) {
    const me = _digits(sock.user?.id);
    if (!me) return;
    const jid     = `${me}@s.whatsapp.net`;
    const caption = buildConnectedMessage();
    const image   = await fetchImageBuffer(CONNECT_IMAGE);
    if (image) {
        try { await sock.sendMessage(jid, { image, caption }); return; }
        catch (e) { console.error('❌ Envoi image de connexion :', e.message); }
    }
    await sock.sendMessage(jid, { text: caption });
}

// ─── Nettoyage, keep-alive et redémarrage automatique ────────────────────────
// Redémarrage « à chaud » : on ferme proprement tous les sockets, on vide ce qui
// s'accumule en mémoire / dans /tmp, puis on relance — sans quitter le process,
// donc ça marche sur n'importe quel hébergeur (panel, Render, pm2...).
// Les clés de session (sessions/) ne sont JAMAIS supprimées : les effacer
// provoque des « Bad MAC ».

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function withTimeout(promise, ms) {
    let t;
    return Promise.race([
        promise,
        new Promise((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); }),
    ]).finally(() => clearTimeout(t));
}

function cleanEverything() {
    activeGames.clear();
    try {
        const tmp = path.join(os.tmpdir(), 'akane-stickers');
        fs.rmSync(tmp, { recursive: true, force: true });
        fs.mkdirSync(tmp, { recursive: true });
    } catch {}
    try { global.gc?.(); } catch {}
}

function scheduleReconnect(delay = 3000) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        startBot().catch(err => {
            console.error('❌ Reconnexion échouée :', err.message);
            scheduleReconnect(10000);
        });
    }, delay);
}

// Relance les sessions .pair déjà enregistrées (sinon elles sont perdues à chaque redémarrage)
function restoreSubSessions() {
    const dir = path.join(INSTANCE_DIR, 'sessions');
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const name of names) {
        const m = name.match(/^pair_(\d+)$/);
        if (!m || subSessions.has(m[1])) continue;
        try {
            const creds = JSON.parse(fs.readFileSync(path.join(dir, name, 'creds.json'), 'utf-8'));
            if (!creds.registered) continue;
        } catch { continue; }
        createSubSession(m[1], null, null).catch(err => console.error(`❌ Restauration +${m[1]} :`, err.message));
    }
}

async function softRestart(reason) {
    if (restarting || shuttingDown) return;
    restarting = true;
    console.log(`♻️ Redémarrage automatique (${reason}) — nettoyage en cours...`);
    try {
        clearTimeout(reconnectTimer);
        if (mainSock) dropSocket(mainSock);
        for (const s of subSessions.values()) dropSocket(s);
        subSessions.clear();
        mainState = 'close'; closedSince = Date.now(); probeFails = 0;
        await sleep(3000);          // laisse finir les écritures de clés en cours
        cleanEverything();
        await startBot();
        restoreSubSessions();
        console.log('✅ Redémarrage automatique terminé');
    } catch (err) {
        console.error('❌ Redémarrage automatique échoué :', err.message);
        scheduleReconnect(10000);
    } finally {
        restarting = false;
    }
}

// Sonde de vie : le même ping que Baileys envoie, mais on attend vraiment la réponse.
async function probe(sock) {
    if (typeof sock?.query !== 'function') return true;
    try {
        await withTimeout(sock.query({
            tag: 'iq',
            attrs: { to: '@s.whatsapp.net', type: 'get', xmlns: 'w:p' },
            content: [{ tag: 'ping', attrs: {} }],
        }), KEEPALIVE_TIMEOUT_MS);
        return true;
    } catch { return false; }
}

async function watchdog() {
    if (shuttingDown || restarting || !mainSock) return;
    if (!mainSock.authState?.creds?.registered) return; // pairing en cours : on ne touche à rien
    if (mainState !== 'open') {
        if (closedSince && Date.now() - closedSince > MAX_CLOSED_MS) softRestart('déconnecté trop longtemps');
        return;
    }
    if (await probe(mainSock)) { probeFails = 0; return; }
    probeFails++;
    console.log(`⚠️ Sonde keep-alive sans réponse (${probeFails}/${KEEPALIVE_MAX_FAILS})`);
    if (probeFails >= KEEPALIVE_MAX_FAILS) softRestart('bot figé (keep-alive)');
}

// Hébergeurs web (Render...) : port HTTP ouvert + auto-ping pour éviter la mise en veille.
// Actif uniquement si PORT est défini ; auto-ping si KEEP_ALIVE_URL ou RENDER_EXTERNAL_URL l'est.
function startKeepAliveServer() {
    const port = process.env.PORT;
    if (port) {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`${settings.botName} en ligne — ${uptimeStr()}`);
        });
        server.on('error', (e) => console.error('⚠️ Serveur keep-alive :', e.message));
        server.listen(Number(port), () => console.log(`🌐 Keep-alive HTTP sur le port ${port}`));
    }
    const url = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (url) setInterval(() => fetch(url).catch(() => {}), 5 * 60 * 1000);
}

// Une erreur isolée ne doit pas tuer ni figer le bot
process.on('unhandledRejection', (err) => console.error('⚠️ unhandledRejection :', err?.message || err));
process.on('uncaughtException',  (err) => console.error('⚠️ uncaughtException :',  err?.message || err));

async function bootstrap() {
    startKeepAliveServer();
    await startBot();
    restoreSubSessions();
    setInterval(() => softRestart('toutes les 2 h'), RESTART_EVERY_MS);
    setInterval(() => watchdog().catch(() => {}), KEEPALIVE_EVERY_MS);
}

bootstrap().catch(err => { console.error('❌ Démarrage :', err.message); process.exit(1); });
