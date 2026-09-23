// utils/pluginManager.js — Cœur du système de plugins

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { pathToFileURL } from 'url';
import { box, S } from './style.js';

const PLUGINS_DIR  = './plugins';
const PLUGINS_LIST = './database/plugins.json';

class _PluginManager {

    constructor() {
        this.plugins  = new Map(); // name → { meta, module }
        this.commands = new Map(); // command → pluginName
        this._ensureDirs();
    }

    _ensureDirs() {
        fs.mkdirSync(PLUGINS_DIR,    { recursive: true });
        fs.mkdirSync('./database',   { recursive: true });
        if (!fs.existsSync(PLUGINS_LIST))
            fs.writeFileSync(PLUGINS_LIST, '[]');
    }

    // ── Charger tous les plugins au démarrage ──────────────────────────────
    async loadAll() {
        const list = this._readList();
        for (const meta of list) {
            if (!meta.enabled) continue;
            try {
                await this._loadPlugin(meta);
                console.log(`✅ Plugin chargé : ${meta.name} (${meta.commands.join(', ')})`);
            } catch (e) {
                console.error(`❌ Plugin "${meta.name}" : ${e.message}`);
            }
        }
    }

    // ── Charger un plugin depuis son fichier ───────────────────────────────
    async _loadPlugin(meta) {
        const filePath = path.resolve(PLUGINS_DIR, `${meta.name}.js`);
        if (!fs.existsSync(filePath))
            throw new Error(`Fichier introuvable : ${filePath}`);

        // Forcer le rechargement avec cache-busting
        const fileUrl = pathToFileURL(filePath).href + `?t=${Date.now()}`;
        const mod = await import(fileUrl);

        // Support format objet : export default { name, commands, handler }
        // Support format fonction : export default async function(client, msg, args)
        const exported = mod.default;
        if (!exported) throw new Error(`Le plugin n'exporte rien (export default manquant)`);

        // Si c'est un objet avec handler → extraire les vraies métadonnées
        if (typeof exported === 'object' && exported.handler) {
            // Fusionner les métadonnées de l'objet avec celles du fichier plugins.json
            const merged = {
                ...meta,
                name:        exported.name        || meta.name,
                version:     exported.version     || meta.version,
                description: exported.description || meta.description,
                author:      exported.author      || meta.author,
                commands:    exported.commands     || meta.commands,
                category:    exported.category    || meta.category,
            };
            this.plugins.set(merged.name, { meta: merged, module: mod });
            for (const cmd of merged.commands) {
                this.commands.set(cmd.toLowerCase(), merged.name);
            }
        }
        // Si c'est une fonction directe
        else if (typeof exported === 'function') {
            this.plugins.set(meta.name, { meta, module: mod });
            for (const cmd of meta.commands) {
                this.commands.set(cmd.toLowerCase(), meta.name);
            }
        } else {
            throw new Error(`Format de plugin invalide`);
        }
    }

    // ── Installer depuis une URL ───────────────────────────────────────────
    async installFromUrl(url) {
        const code = await this._download(url);

        // Essayer d'abord de lire les métadonnées depuis l'export objet
        // On crée un fichier temp pour l'importer
        const tmpName = `_tmp_${Date.now()}`;
        const tmpPath = path.join(PLUGINS_DIR, `${tmpName}.js`);
        fs.writeFileSync(tmpPath, code, 'utf-8');

        let meta;
        try {
            const tmpUrl = pathToFileURL(tmpPath).href + `?t=${Date.now()}`;
            const mod    = await import(tmpUrl);
            const exp    = mod.default;

            if (exp && typeof exp === 'object' && exp.name && exp.commands) {
                // Format objet — lire les métadonnées directement
                meta = {
                    name:        exp.name,
                    version:     exp.version     || '1.0.0',
                    description: exp.description || '',
                    author:      exp.author      || 'Inconnu',
                    commands:    Array.isArray(exp.commands) ? exp.commands : [exp.commands],
                    category:    exp.category    || 'general',
                    url,
                    enabled: true,
                };
            } else {
                // Format commentaires // @name etc.
                meta = this._parseMetaFromComments(code, url);
                if (!meta.name) throw new Error('Métadonnées introuvables');
            }
        } catch (e) {
            fs.unlinkSync(tmpPath);
            throw new Error(`Impossible de lire le plugin : ${e.message}`);
        }

        // Supprimer le tmp et sauvegarder avec le bon nom
        fs.unlinkSync(tmpPath);
        const finalPath = path.join(PLUGINS_DIR, `${meta.name}.js`);
        fs.writeFileSync(finalPath, code, 'utf-8');

        // Mettre à jour plugins.json
        const list = this._readList();
        const idx  = list.findIndex(p => p.name === meta.name);
        if (idx !== -1) list[idx] = meta;
        else list.push(meta);
        this._saveList(list);

        // Charger dynamiquement sans redémarrage
        await this._loadPlugin(meta);

        return meta;
    }

    // ── Exécuter une commande ──────────────────────────────────────────────
    async execute(command, client, message, args) {
        const pluginName = this.commands.get(command.toLowerCase());
        if (!pluginName) return false;

        const entry = this.plugins.get(pluginName);
        if (!entry) return false;

        const exported = entry.module.default;

        try {
            if (typeof exported === 'object' && exported.handler) {
                // Format objet avec handler
                await exported.handler(client, message, args, { box, S, cmd: command });
            } else if (typeof exported === 'function') {
                // Format fonction directe
                await exported(client, message, args, { box, S, cmd: command });
            }
        } catch (e) {
            console.error(`❌ Erreur plugin ${pluginName} :`, e.message);
            const jid = message.key.remoteJid;
            await client.sendMessage(jid, {
                text: box(`│ *❌ ERREUR PLUGIN : ${pluginName}*`, `│`, `│ *${e.message}*`),
                nativeFlow: S.chan
            }).catch(() => {});
        }

        return true;
    }

    // ── Désinstaller ───────────────────────────────────────────────────────
    uninstall(name) {
        const entry = this.plugins.get(name);
        if (!entry) throw new Error(`Plugin "${name}" introuvable`);
        for (const cmd of entry.meta.commands) this.commands.delete(cmd.toLowerCase());
        this.plugins.delete(name);
        const filePath = path.join(PLUGINS_DIR, `${name}.js`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        this._saveList(this._readList().filter(p => p.name !== name));
    }

    // ── Toggle on/off ──────────────────────────────────────────────────────
    toggle(name, enabled) {
        const list = this._readList();
        const idx  = list.findIndex(p => p.name === name);
        if (idx === -1) throw new Error(`Plugin "${name}" introuvable`);
        list[idx].enabled = enabled;
        this._saveList(list);
        if (!enabled) {
            const entry = this.plugins.get(name);
            for (const cmd of (entry?.meta?.commands || [])) this.commands.delete(cmd.toLowerCase());
            this.plugins.delete(name);
        }
    }

    list()       { return this._readList(); }
    count()      { return this.plugins.size; }
    getCommands(){ return [...this.commands.keys()]; }

    // ── Helpers privés ─────────────────────────────────────────────────────
    _readList() {
        try { return JSON.parse(fs.readFileSync(PLUGINS_LIST, 'utf-8')); }
        catch { return []; }
    }

    _saveList(list) {
        fs.writeFileSync(PLUGINS_LIST, JSON.stringify(list, null, 2));
    }

    _parseMetaFromComments(code, url) {
        const get = (key) => {
            const m = code.match(new RegExp(`^\\s*//\\s*@${key}\\s+(.+)$`, 'm'));
            return m ? m[1].trim() : '';
        };
        return {
            name:        get('name')        || '',
            version:     get('version')     || '1.0.0',
            description: get('description') || '',
            author:      get('author')      || 'Inconnu',
            commands:    get('commands').split(/[\s,]+/).filter(Boolean),
            category:    get('category')    || 'general',
            url,
            enabled: true,
        };
    }

    _download(url) {
        return new Promise((resolve, reject) => {
            const lib = url.startsWith('https') ? https : http;
            lib.get(url, { headers: { 'User-Agent': 'AkaneMD/2.0' } }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return this._download(res.headers.location).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200)
                    return reject(new Error(`Erreur HTTP ${res.statusCode} — vérifie que l'URL est accessible`));
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (!data.trim()) return reject(new Error('Fichier vide reçu'));
                    resolve(data);
                });
            }).on('error', reject);
        });
    }

}

export const PluginManager = new _PluginManager();
