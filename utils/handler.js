// utils/handler.js
import { PluginManager } from './pluginManager.js';
import { config } from './config.js';
import { builtins } from './builtins.js';

export async function handleMessage(client, message) {
    if (!message.message || message.key.fromMe) return;
    const body = message.message?.extendedTextMessage?.text || message.message?.conversation || '';
    if (!body) return;

    const prefix = config.prefix;
    const sender = message.key.participant || message.key.remoteJid;
    const isOwner = config.owner === sender?.replace('@s.whatsapp.net','') || config.sudoList?.includes(sender);

    // Commandes publiques sans restriction : pair
    const publicCmds = ['plugin', 'menu', 'aide', 'help'];

    if (!body.startsWith(prefix)) return;

    const [rawCmd, ...args] = body.slice(prefix.length).trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase();

    const isPublic = config.publicMode || message.key.fromMe || isOwner || publicCmds.includes(cmd);
    if (!isPublic) return;

    // Built-ins d'abord
    if (await builtins(cmd, client, message, args, { isOwner })) return;

    // Plugins
    await PluginManager.execute(cmd, client, message, args);
}
