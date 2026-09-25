// plugins/obfuscate.js — Obscurcit un fichier .js envoyé dans le chat.
// Usage : réponds à un fichier .js avec {prefix}obfuscate
//
// Nécessite la dépendance "javascript-obfuscator" dans package.json
// (npm install javascript-obfuscator, ou ajoute-la à la main et laisse ton
// hébergeur réinstaller les dépendances au prochain déploiement).

import { downloadMediaMessage } from '@whiskeysockets/baileys';
import JavaScriptObfuscator from 'javascript-obfuscator';

// Réglages pensés pour du Node.js serveur (pas du JS navigateur) : selfDefending
// et debugProtection désactivés exprès, ils causent des crashs/boucles infinies
// en environnement serveur (voir notes dans la conversation).
const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.3,
    identifierNamesGenerator: 'hexadecimal',
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    debugProtection: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.85,
    splitStrings: true,
    splitStringsChunkLength: 8,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
};

async function handler(client, message, args, ctx) {
    const jid = message.key.remoteJid;

    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const docMsg = quoted?.documentMessage || message.message?.documentMessage;

    if (!docMsg) {
        return client.sendMessage(jid, {
            text: ctx.box(['🔒 Obfuscate', `envoie ou réponds à un fichier .js avec ${ctx.prefix}obfuscate`])
        }, { quoted: message });
    }

    if (!docMsg.fileName?.toLowerCase().endsWith('.js')) {
        return client.sendMessage(jid, { text: ctx.box('❌ Ce fichier n\'est pas un .js') }, { quoted: message });
    }

    try {
        await client.sendMessage(jid, { text: ctx.box('⏳ Obscurcissement en cours...') }, { quoted: message });

        const fakeMsg = {
            key: message.key,
            message: quoted ? { documentMessage: docMsg } : message.message,
        };
        const buffer = await downloadMediaMessage(fakeMsg, 'buffer', {});
        if (!buffer || !buffer.length) throw new Error('Téléchargement du fichier impossible');

        const code   = buffer.toString('utf-8');
        const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS).getObfuscatedCode();
        const outBuffer = Buffer.from(result, 'utf-8');
        const outName   = docMsg.fileName.replace(/\.js$/i, '.obf.js');

        await client.sendMessage(jid, {
            document: outBuffer,
            fileName: outName,
            mimetype: 'application/javascript',
            caption: ctx.box('✅ Fichier obscurci')
        }, { quoted: message });

    } catch (err) {
        console.error('❌ Erreur obfuscate:', err.message);
        return client.sendMessage(jid, { text: ctx.box(['❌ Erreur', err.message]) }, { quoted: message });
    }
}

export default {
    name: 'obfuscate',
    commands: ['obfuscate'],
    category: 'outils',
    description: 'Obscurcit un fichier .js envoyé ou cité dans le chat',
    handler,
};
