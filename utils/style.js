// utils/style.js — Style global AKANE MD v2
export const CHANNEL = 'https://whatsapp.com/channel/0029VbCrJRnGufIyytPXy606';
export const S = {
    top:   '╭┄─̣✦┄─̣✦┄─̣✦┄─̣✦',
    mid:   '│┄─̣┄─̣┄─̣┄─̣┄─̣',
    bot:   '╰┄─̣✦┄─̣✦┄─̣✦┄─̣✦',
    title: '│ ⊹ *ɑׁׁׅׅƙׁׁׅׅɑׁׁׅׅ݊ꪀׁׅꫀׁׁׅܻׅ݊ ꩇׁׅ֪݊ ׁׅ֒ꪜ2* ⊹',
    foot:  '\n> *© AKANE MD v2 🌹*',
    chan:  [{ text: 'VOIR LA CHAÎNE 🍁', url: CHANNEL }],
};
export function box(...lines) {
    return [S.top, S.title, S.mid, ...lines, S.bot + S.foot].join('\n');
}
export function send(client, jid, text, opts = {}) {
    return client.sendMessage(jid, { text, nativeFlow: S.chan, ...opts });
}
export function sendBox(client, jid, ...lines) {
    return client.sendMessage(jid, { text: box(...lines), nativeFlow: S.chan });
}
