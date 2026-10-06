// plugins/setgname.js
// .setgname <nouveau nom> — renomme le groupe

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
    name: 'setgname',
    commands: ['setgname'],
    category: 'groupe',
    description: 'Renomme le groupe',

    async handler(client, message, args, ctx) {
        const remoteJid = message.key.remoteJid;
        const prefix = ctx?.prefix || '.';

        if (!remoteJid.endsWith('@g.us')) {
            return client.sendMessage(remoteJid, { text: box('❌ GROUPE UNIQUEMENT !', []) }, { quoted: message });
        }

        const newName = args.join(' ').trim();
        if (!newName) {
            return client.sendMessage(remoteJid, {
                text: box('📝 UTILISATION :', [`${prefix}setgname [NOM]`, '', '💡 EXEMPLE :', `${prefix}setgname Mon Groupe 🔥`]),
            }, { quoted: message });
        }

        try {
            await client.groupUpdateSubject(remoteJid, newName);
            await client.sendMessage(remoteJid, { text: box('✅ NOM CHANGÉ !', [`📌 ${newName}`]) }, { quoted: message });
        } catch (err) {
            console.error('❌ setgname:', err.message);
            const raison = err.message.includes('not-authorized') ? 'Bot non admin' : err.message;
            await client.sendMessage(remoteJid, { text: box(`❌ ERREUR : ${raison}`, []) }, { quoted: message }).catch(() => {});
        }
    },
};
