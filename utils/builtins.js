// utils/builtins.js — Commandes intégrées (plugin, menu, help)
import { PluginManager } from './pluginManager.js';
import { config, saveConfig } from './config.js';
import { box, sendBox, S } from './style.js';
import fs from 'fs';

export async function builtins(cmd, client, message, args, { isOwner }) {
    const jid = message.key.remoteJid;

    // ── MENU / AIDE ────────────────────────────────────────────────────────
    if (cmd === 'menu' || cmd === 'aide' || cmd === 'help') {
        const plugins = PluginManager.list();
        const bycat = {};
        for (const p of plugins) {
            if (!p.enabled) continue;
            const cat = p.category || 'general';
            if (!bycat[cat]) bycat[cat] = [];
            bycat[cat].push(p);
        }
        const catEmoji = { tools: '🔧', fun: '🎉', media: '🎵', general: '📦', admin: '⚙️', games: '🎮' };
        let lines = [`│ *PRÉFIXE : ${config.prefix}*`, `│`];
        for (const [cat, list] of Object.entries(bycat)) {
            lines.push(`│ ${catEmoji[cat] || '📦'} *${cat.toUpperCase()}*`);
            for (const p of list) {
                lines.push(`│  ┕ *${p.commands.map(c => config.prefix + c).join(' • ')}*`);
                lines.push(`│     ${p.description}`);
            }
            lines.push(`│`);
        }
        if (plugins.length === 0) lines.push(`│ *Aucun plugin installé*`, `│`, `│ *plugin store* pour voir les plugins dispo`);
        lines.push(`│ *${PluginManager.count()} plugin(s) actif(s)*`);
        await client.sendMessage(jid, { text: box(...lines), nativeFlow: S.chan });
        return true;
    }

    // ── PLUGIN ────────────────────────────────────────────────────────────
    if (cmd === 'plugin' || cmd === 'plugins') {
        const sub = args[0]?.toLowerCase();

        // plugin list
        if (!sub || sub === 'list') {
            const list = PluginManager.list();
            if (!list.length) {
                await client.sendMessage(jid, { text: box(`│ *📦 Aucun plugin installé*`, `│`, `│ *plugin store* → voir les plugins`, `│ *plugin add [URL]* → installer`), nativeFlow: S.chan });
            } else {
                let lines = [`│ *📦 PLUGINS INSTALLÉS (${list.length})*`, `│`];
                for (const p of list) {
                    lines.push(`│ ${p.enabled ? '🟢' : '🔴'} *${p.name}* v${p.version}`);
                    lines.push(`│    ${p.description}`);
                    lines.push(`│    Cmds : ${p.commands.map(c => config.prefix + c).join(' • ')}`);
                    lines.push(`│`);
                }
                await client.sendMessage(jid, { text: box(...lines), nativeFlow: S.chan });
            }
            return true;
        }

        // plugin add [URL]
        if (sub === 'add') {
            const url = args[1];
            if (!url || !url.startsWith('http')) {
                await client.sendMessage(jid, { text: box(`│ *⚠️ UTILISATION :*`, `│ *plugin add [URL]*`, `│`, `│ Exemple :`, `│ plugin add https://akane-plugins.vercel.app/p/ping.js`), nativeFlow: S.chan });
                return true;
            }
            await client.sendMessage(jid, { text: `🔄 *Iׁׅnׁׅsׁׅtׁׅaׁׅlׁׅlׁׅaׁׅtׁׅiׁׅoׁׅnׁׅ eׁׅnׁׅ cׁׅoׁׅuׁׅrׁׅsׁׅ...*` });
            try {
                const meta = await PluginManager.installFromUrl(url);
                await client.sendMessage(jid, {
                    text: box(
                        `│ *✅ PLUGIN INSTALLÉ !*`, `│`,
                        `│ *📦 NOM : ${meta.name}*`,
                        `│ *📝 VERSION : ${meta.version}*`,
                        `│ *👤 AUTEUR : ${meta.author}*`,
                        `│ *💬 DESC : ${meta.description}*`,
                        `│ *⚡ COMMANDES : ${meta.commands.map(c => config.prefix + c).join(' • ')}*`,
                    ),
                    nativeFlow: S.chan
                });
            } catch (e) {
                await client.sendMessage(jid, { text: box(`│ *❌ ERREUR INSTALLATION*`, `│`, `│ *${e.message}*`), nativeFlow: S.chan });
            }
            return true;
        }

        // plugin remove [nom]
        if (sub === 'remove' || sub === 'del') {
            if (!isOwner) { await client.sendMessage(jid, { text: box(`│ *❌ Réservé au propriétaire*`), nativeFlow: S.chan }); return true; }
            const name = args[1];
            if (!name) { await client.sendMessage(jid, { text: box(`│ *plugin remove [nom]*`), nativeFlow: S.chan }); return true; }
            try {
                PluginManager.uninstall(name);
                await client.sendMessage(jid, { text: box(`│ *🗑️ Plugin "${name}" supprimé*`), nativeFlow: S.chan });
            } catch (e) {
                await client.sendMessage(jid, { text: box(`│ *❌ ${e.message}*`), nativeFlow: S.chan });
            }
            return true;
        }

        // plugin on/off [nom]
        if (sub === 'on' || sub === 'off') {
            if (!isOwner) { await client.sendMessage(jid, { text: box(`│ *❌ Réservé au propriétaire*`), nativeFlow: S.chan }); return true; }
            const name = args[1];
            try {
                PluginManager.toggle(name, sub === 'on');
                await client.sendMessage(jid, { text: box(`│ *${sub === 'on' ? '🟢' : '🔴'} Plugin "${name}" ${sub === 'on' ? 'activé' : 'désactivé'}*`), nativeFlow: S.chan });
            } catch (e) {
                await client.sendMessage(jid, { text: box(`│ *❌ ${e.message}*`), nativeFlow: S.chan });
            }
            return true;
        }

        // plugin store — liste les plugins du store
        if (sub === 'store') {
            await client.sendMessage(jid, {
                text: box(
                    `│ *🏪 AKANE PLUGIN STORE*`, `│`,
                    `│ *🌐 Site :*`,
                    `│ https://akane-plugins.vercel.app`,
                    `│`,
                    `│ *💡 Installe un plugin :*`,
                    `│ *plugin add [URL du .js]*`,
                    `│`,
                    `│ *Trouve les plugins, lis les avis,*`,
                    `│ *like tes favoris sur le site !*`,
                ),
                nativeFlow: [{ text: '🏪 VOIR LE STORE 🍁', url: 'https://akane-plugins.vercel.app' }]
            });
            return true;
        }

        return true;
    }

    // ── PREFIX ────────────────────────────────────────────────────────────
    if (cmd === 'prefix' && isOwner) {
        if (!args[0]) { await client.sendMessage(jid, { text: box(`│ *Préfixe actuel : ${config.prefix}*`, `│ *prefix [nouveau]*`), nativeFlow: S.chan }); return true; }
        saveConfig({ prefix: args[0] });
        await client.sendMessage(jid, { text: box(`│ *✅ Préfixe changé : ${args[0]}*`), nativeFlow: S.chan });
        return true;
    }

    return false;
}
