import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { t } from '../lang.js' // ← adapte le chemin si lang.js n'est pas à la racine du projet

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_FILE = path.join(__dirname, '..', 'database', 'welcome.json')

// ───────── Réglages (tout est écrit en dur, aucune dépendance aux settings) ─────────
const WELCOME_IMG = 'https://tinyurl.com/232hz8de'
const GOODBYE_IMG = 'https://tinyurl.com/2cho3aoh'

const BOT_LINK = 'https://urls.fr/MjktBF'
const TELEGRAM = 'https://t.me/dev_akane'
const MAIL = 'akanefx99@gmail.com'

const DEDUPE_MS = 20000      // anti-doublon d'un même événement
const FLOOD_WINDOW_MS = 5000 // fenêtre anti-flood goodbye
const FLOOD_MAX = 3          // au-delà de 3 départs dans la fenêtre → pas de message pour les suivants

const CMDS = ['welcome', 'goodbye']

// ───────── Mise en forme ─────────
const TOP = '╭⊷─────────◈'
const END = '╰⊷─────────◈'
const B = '┃ · ͟͟͞͞➳❥'
const BRAND = '┠─ 🄰🄺🄰🄽🄴 🄼🄳 v2.5'
const SIGN = '> *BY DEV AKANE 🌹*'

// ligne entièrement en gras : *┃ · ͟͟͞͞➳❥ texte*
const line = (txt) => `*${B} ${txt}*`
// ligne avec libellé : *┃ · ͟͟͞͞➳❥* *LIBELLÉ :* valeur
const field = (label, value) => `*${B}* *${label} :* ${value}`

function contactBlock(config) {
    return [
        `*${t(config, 'wgCustomBot')}*`,
        TOP,
        line(`${t(config, 'wgBotLink')} :`),
        `*${B}* ${BOT_LINK}`,
        line(`${t(config, 'wgTelegram')} :`),
        `*${B}* ${TELEGRAM}`,
        line(`${t(config, 'wgMail')} :`),
        `*${B}* ${MAIL}`,
        END,
        SIGN
    ].join('\n')
}

function welcomeText(config, tags, members) {
    return [
        TOP,
        field(t(config, 'wgWelcomeTitle'), tags),
        members ? field(t(config, 'wgMembers'), `*_${members}_*`) : '',
        line(t(config, 'wgWelcomeLine1')),
        line(t(config, 'wgWelcomeLine2')),
        `*${BRAND}*`,
        END,
        contactBlock(config)
    ].filter(Boolean).join('\n')
}

function goodbyeText(config, tags, members) {
    return [
        TOP,
        field(t(config, 'wgGoodbyeTitle'), tags),
        members ? field(t(config, 'wgMembers'), `*_${members}_*`) : '',
        line(t(config, 'wgGoodbyeLine1')),
        line(t(config, 'wgGoodbyeLine2')),
        `*${BRAND}*`,
        END,
        contactBlock(config)
    ].filter(Boolean).join('\n')
}

// Cadre simple pour les réponses aux commandes (.welcome / .goodbye)
const frame = (...lines) =>
    ['╭─────────◈', ...lines.filter(Boolean).map(l => `*┆㊧  ${l}*`), '╰─────────◈'].join('\n')

const panel = (...lines) => `${frame(...lines)}\n${SIGN}`

// ───────── Base de données (uniquement on/off + anti-flood) ─────────
function loadDB() {
    let raw = {}
    try {
        if (fs.existsSync(DB_FILE)) raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) || {}
    } catch {}
    return {
        welcome: { enabled: raw.welcome?.enabled !== false },
        goodbye: {
            enabled: raw.goodbye?.enabled !== false,
            limit: raw.goodbye?.limit !== false // anti-flood actif par défaut
        }
    }
}

function saveDB(db) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

// ───────── Utilitaires JID ─────────
const _num = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')

function _jidOf(p) {
    if (typeof p === 'string') return p
    return p?.phoneNumber || p?.jid || p?.id || null
}

// JID propre (sans :device) utilisable pour les mentions
function _norm(jid) {
    const n = _num(jid)
    if (!n) return null
    const domain = String(jid).split('@')[1] || 's.whatsapp.net'
    return `${n}@${domain}`
}

// ───────── Anti-doublon ─────────
const _recent = new Map()
function _seenRecently(key) {
    const now = Date.now()
    for (const [k, ts] of _recent) if (now - ts > DEDUPE_MS) _recent.delete(k)
    if (_recent.has(key)) return true
    _recent.set(key, now)
    return false
}

// ───────── Anti-flood goodbye ─────────
// Compte TOUS les départs (mentionnés ou non) : tant que la vague continue,
// le 4ème et les suivants ne sont pas mentionnés.
const _leaves = new Map()
function _floodAllowed(group) {
    const now = Date.now()
    const list = (_leaves.get(group) || []).filter(ts => now - ts < FLOOD_WINDOW_MS)
    list.push(now)
    _leaves.set(group, list)
    return list.length <= FLOOD_MAX
}

// ───────── Groupe / image ─────────
async function getMemberCount(client, group) {
    try {
        const meta = await client.groupMetadata(group)
        return meta?.participants?.length || 0
    } catch {
        return 0
    }
}

const _imgCache = new Map()
async function getImage(url) {
    if (!url) return null
    if (_imgCache.has(url)) return _imgCache.get(url)
    try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
        if (!res.ok) return null
        const type = res.headers.get('content-type') || ''
        if (type && !type.startsWith('image/') && !type.includes('octet-stream')) return null
        const buf = Buffer.from(await res.arrayBuffer())
        if (!buf.length) return null
        _imgCache.set(url, buf)
        return buf
    } catch {
        return null
    }
}

async function sendWithImage(client, group, text, mentions, imgUrl) {
    const img = await getImage(imgUrl)
    if (img) {
        try {
            await client.sendMessage(group, { image: img, caption: text, mentions })
            return
        } catch (e) {
            console.error('❌ [WELCOME-GOODBYE] envoi image:', e.message)
        }
    }
    await client.sendMessage(group, { text, mentions })
}

// ───────── Lecture de la commande ─────────
function parseCommand(message, args = []) {
    const m = message.message || {}
    const body = m.conversation || m.extendedTextMessage?.text
        || m.imageMessage?.caption || m.videoMessage?.caption || ''
    const words = body.trim().split(/\s+/).filter(Boolean)
    const name = (words[0] || '').replace(/^[^a-zA-Z0-9]+/, '').toLowerCase()
    if (CMDS.includes(name)) return { name, rest: words.slice(1) }
    const a0 = String(args[0] || '').toLowerCase()
    if (CMDS.includes(a0)) return { name: a0, rest: args.slice(1) }
    return { name: null, rest: args }
}

export default {
    name: 'welcome-goodbye',
    commands: ['welcome', 'goodbye'],
    category: 'groupe',
    description: 'Messages de bienvenue et au revoir automatiques',

    // `config` = la config du bot (celle qui contient config.language).
    // Il faut la passer depuis index.js : plugin.onGroupUpdate(client, update, { ownNumbers, config })
    async onGroupUpdate(client, update, { ownNumbers = [], config } = {}) {
        try {
            const group = update.id
            if (!group?.endsWith('@g.us')) return

            const db = loadDB()
            const me = [client.user?.id, client.user?.lid].filter(Boolean).map(_num)

            // ✅ WELCOME
            if (update.action === 'add' && db.welcome.enabled) {
                const jids = (update.participants || [])
                    .map(_jidOf)
                    .map(_norm)
                    .filter(Boolean)
                    .filter(j => !me.includes(_num(j)) && !ownNumbers.includes(_num(j)))
                    .filter(j => !_seenRecently(`${group}:add:${_num(j)}`))

                if (!jids.length) return

                const members = await getMemberCount(client, group)
                const tags = jids.map(j => `@${_num(j)}`).join(' ')
                const text = welcomeText(config, tags, members)

                await sendWithImage(client, group, text, jids, WELCOME_IMG)
                return
            }

            // ❌ GOODBYE
            if (update.action === 'remove' && db.goodbye.enabled) {
                const jids = (update.participants || [])
                    .map(_jidOf)
                    .map(_norm)
                    .filter(Boolean)
                    .filter(j => !me.includes(_num(j)))
                    .filter(j => !_seenRecently(`${group}:remove:${_num(j)}`))
                    // anti-flood : 4ème départ et suivants (en 5 s) ignorés
                    .filter(() => !db.goodbye.limit || _floodAllowed(group))

                if (!jids.length) return

                const members = await getMemberCount(client, group)
                const tags = jids.map(j => `@${_num(j)}`).join(' ')
                const text = goodbyeText(config, tags, members)

                await sendWithImage(client, group, text, jids, GOODBYE_IMG)
            }
        } catch (e) {
            console.error('❌ [WELCOME-GOODBYE]:', e.message)
        }
    },

    async handler(client, message, args = [], ctx = {}) {
        const jid = message.key.remoteJid
        const pf = ctx.prefix || '.'
        const cfg = ctx.config
        const say = (...lines) =>
            client.sendMessage(jid, { text: panel(...lines) }, { quoted: message })

        if (!jid.endsWith('@g.us')) return say(t(cfg, 'wgGroupOnly'))

        const { name, rest } = parseCommand(message, args)
        const sub = String(rest[0] || '').toLowerCase()
        const db = loadDB()

        if (name === 'welcome') {
            if (sub === 'on') {
                db.welcome.enabled = true
                saveDB(db)
                return say(t(cfg, 'wgWelcomeOn'))
            }
            if (sub === 'off') {
                db.welcome.enabled = false
                saveDB(db)
                return say(t(cfg, 'wgWelcomeOff'))
            }
            return say(
                `👋 Welcome : ${db.welcome.enabled ? '✅' : '❌'}`,
                `${pf}welcome on / off`
            )
        }

        if (name === 'goodbye') {
            if (sub === 'on') {
                db.goodbye.enabled = true
                saveDB(db)
                return say(t(cfg, 'wgGoodbyeOn'))
            }
            if (sub === 'off') {
                db.goodbye.enabled = false
                saveDB(db)
                return say(t(cfg, 'wgGoodbyeOff'))
            }
            if (['limite', 'limit', 'flood', 'antiflood'].includes(sub)) {
                const v = String(rest[1] || '').toLowerCase()
                if (v !== 'on' && v !== 'off') {
                    return say(`❌ ${t(cfg, 'langUsage')} : ${pf}goodbye limit on / off`)
                }
                db.goodbye.limit = v === 'on'
                saveDB(db)
                return say(db.goodbye.limit ? t(cfg, 'wgLimitOn') : t(cfg, 'wgLimitOff'))
            }
            return say(
                `👋 Goodbye : ${db.goodbye.enabled ? '✅' : '❌'}`,
                `${t(cfg, 'wgAntiFlood')} : ${db.goodbye.limit ? '✅' : '❌'}`,
                `${pf}goodbye on / off`,
                `${pf}goodbye limit on / off`
            )
        }

        // Commande non identifiée → aide générale
        return say(
            `👋 Welcome : ${db.welcome.enabled ? '✅' : '❌'}`,
            `👋 Goodbye : ${db.goodbye.enabled ? '✅' : '❌'}`,
            `${pf}welcome on / off`,
            `${pf}goodbye on / off / limit`
        )
    }
}
