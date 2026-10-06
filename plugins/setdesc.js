// plugins/setgdesc.js
// .setgdesc <nouvelle description> — change la description du groupe

function box(title, lines) {
    return [
        '╭─✧🌹━━━━━━━━━━━━━❂',
        '┊',
        `*┊${title}*`,
        ...lines.map((l) => `*┊${l}*`),
        '┊',
        '╰─────────────────❂',
    ].join('\n');
}

export default {
    name: 'setgdesc',
    commands: ['setgdesc'],
    category: 'groupe',
    description: 'Change la description du groupe',

    async handler(client, message, args, ctx) {
        const remoteJid = message.key.remoteJid;
        const prefix = ctx?.prefix || '.';

        if (!remoteJid.endsWith('@g.us')) {
            return client.sendMessage(remoteJid, { text: box('❌ GROUPE UNIQUEMENT !', []) }, { quoted: message });
        }

        const newDesc = args.join(' ').trim();
        if (!newDesc) {
            return client.sendMessage(remoteJid, {
                text: box('📝 UTILISATION :', [`${prefix}setgdesc [DESCRIPTION]`, '', '💡 EXEMPLE :', `${prefix}setgdesc Bienvenue sur notre groupe !`]),
            }, { quoted: message });
        }

        try {
            await client.groupUpdateDescription(remoteJid, newDesc);
            const preview = newDesc.length > 60 ? `${newDesc.slice(0, 60)}...` : newDesc;
            await client.sendMessage(remoteJid, { text: box('✅ DESCRIPTION CHANGÉE !', [`📋 ${preview}`]) }, { quoted: message });
        } catch (err) {
            console.error('❌ setgdesc:', err.message);
            const raison = err.message.includes('not-authorized') ? 'Bot non admin' : err.message;
            await client.sendMessage(remoteJid, { text: box(`❌ ERREUR : ${raison}`, []) }, { quoted: message }).catch(() => {});
        }
    },
};
