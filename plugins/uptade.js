// plugins/update.js — Met à jour le bot depuis le repo GitHub (git pull + npm install),
// annonce les commandes nouvellement ajoutées, puis redémarre.
//
// ⚠️ Réservé au owner : ajoute 'update' (et 'uptade' si tu gardes l'alias) à OWNER_ONLY
// dans index.js, ex. :
//   const OWNER_ONLY = new Set([..., 'update', 'uptade']);
// Sans ça, n'importe qui peut déclencher un git pull + redémarrage si publicMode est activé.

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { t } from '../lang.js';
import { pluginManager } from '../index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Racine du repo git (index.js, plugins/, database/...), un cran au-dessus de ./plugins.
// ⚠️ Adapte si ton repo git n'est pas exactement au même niveau que index.js.
const REPO_ROOT = path.join(__dirname, '..');

function snapshotCommands() {
    const map = new Map(); // commande -> description du plugin
    for (const plugin of pluginManager.plugins.values()) {
        for (const cmd of plugin.commands || []) map.set(cmd, plugin.description || '');
    }
    return map;
}

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;
    const cfg = ctx.config;
    const say = (...lines) => client.sendMessage(jid, { text: ctx.box(...lines) }, { quoted: message });

    const before = snapshotCommands();

    await say(t(cfg, 'updChecking'));

    let pullOutput = '';
    try {
        pullOutput = execSync('git pull', {
            cwd: REPO_ROOT,
            encoding: 'utf-8',
            timeout: 30000,
            env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // jamais de prompt interactif
        });
    } catch (err) {
        return say([t(cfg, 'updErrorTitle'), err.message]);
    }

    // "Already up to date." (git en) / "Déjà à jour." (git fr) selon la locale du serveur
    if (/already up to date/i.test(pullOutput) || /déjà à jour/i.test(pullOutput)) {
        return say(t(cfg, 'updUpToDate'));
    }

    // Réinstalle les dépendances au cas où package.json a changé (échec non bloquant :
    // on continue même si npm install a un souci, pour ne pas bloquer le rechargement des plugins).
    try {
        execSync('npm install', { cwd: REPO_ROOT, stdio: 'ignore', timeout: 120000 });
    } catch (err) {
        console.error('⚠️ [UPDATE] npm install :', err.message);
    }

    // Recharge tous les plugins depuis le disque (fichiers modifiés/ajoutés par le git pull)
    // pour détecter les nouvelles commandes AVANT le redémarrage complet.
    try {
        await pluginManager.loadAll();
    } catch (err) {
        console.error('⚠️ [UPDATE] rechargement plugins :', err.message);
    }

    const after = snapshotCommands();
    const added = [...after.keys()].filter((cmd) => !before.has(cmd));

    const lines = [t(cfg, 'updDoneTitle')];
    if (added.length) {
        lines.push(t(cfg, 'updNewCommands'));
        for (const cmd of added) {
            const desc = after.get(cmd);
            lines.push(desc ? `${ctx.prefix}${cmd} — ${desc}` : `${ctx.prefix}${cmd}`);
        }
    } else {
        lines.push(t(cfg, 'updNoNewCommands'));
    }
    lines.push(t(cfg, 'updRestarting'));

    await say(lines);

    // Redémarrage — même principe que la commande .restart existante (shutdown('restart') dans
    // index.js) : on quitte proprement, le supervisor (pm2, panel, katabump...) relance le process.
    setTimeout(() => process.exit(0), 2500);
}

export default {
    name: 'update',
    commands: ['update', 'uptade'], // "uptade" gardé en alias au cas où c'est la faute de frappe que tu comptais garder
    category: 'core',
    description: 'Met à jour le bot depuis GitHub, annonce les nouvelles commandes, puis redémarre',
    handler,
};
