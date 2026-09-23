import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'

const MAX_SECONDS = 8
const MAX_BYTES = 900 * 1024
const MAX_INPUT = 30 * 1024 * 1024
const TEMP_DIR = path.join(os.tmpdir(), 'akane-stickers')

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

function unwrap(m) {
    let cur = m
    for (let i = 0; i < 5 && cur; i++) {
        const inner = cur.ephemeralMessage?.message
            || cur.viewOnceMessage?.message
            || cur.viewOnceMessageV2?.message
            || cur.viewOnceMessageV2Extension?.message
            || cur.documentWithCaptionMessage?.message
            || cur.editedMessage?.message
        if (!inner) break
        cur = inner
    }
    return cur
}

// Média présent dans un message (image ou vidéo/gif)
function pickMedia(m) {
    if (!m) return null
    if (m.imageMessage) return { type: 'image', msg: m.imageMessage }
    if (m.videoMessage) return { type: 'video', msg: m.videoMessage }
    return null
}

// Message cité (réponse) : le contextInfo est dans le type de message (extendedTextMessage, imageMessage…)
function findQuoted(m) {
    if (!m) return null
    for (const key of Object.keys(m)) {
        const q = m[key]?.contextInfo?.quotedMessage
        if (q) return unwrap(q)
    }
    return null
}

async function downloadMedia(mediaMessage, type) {
    let lib
    try { lib = await import('baileys') } catch { lib = await import('@crysnovax/baileys') }
    const stream = await lib.downloadContentFromMessage(mediaMessage, type)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    return Buffer.concat(chunks)
}

async function processImage(buffer) {
    try {
        return await sharp(buffer)
            .resize(512, 512, { fit: 'cover' })
            .webp({ quality: 80 })
            .toBuffer()
    } catch (e) {
        throw new Error('Erreur image')
    }
}

async function processVideo(buffer) {
    return new Promise((resolve, reject) => {
        const id = Date.now()
        const tmpInput = path.join(TEMP_DIR, `input_${id}.mp4`)
        const tmpOutput = path.join(TEMP_DIR, `output_${id}.webp`)

        try {
            fs.writeFileSync(tmpInput, buffer)

            const args = [
                '-i', tmpInput,
                '-t', MAX_SECONDS.toString(),
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2,fps=10',
                '-q', '50',
                tmpOutput
            ]

            execFile(ffmpegPath, args, { timeout: 30000 }, (err) => {
                try {
                    if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput)

                    if (err) {
                        reject(new Error('Erreur ffmpeg'))
                        return
                    }

                    if (!fs.existsSync(tmpOutput)) {
                        reject(new Error('Aucun sticker'))
                        return
                    }

                    const webp = fs.readFileSync(tmpOutput)
                    fs.unlinkSync(tmpOutput)

                    if (webp.length > MAX_BYTES) {
                        reject(new Error('Sticker trop volumineux'))
                        return
                    }

                    resolve(webp)
                } catch (e) {
                    reject(e)
                }
            })
        } catch (e) {
            if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput)
            reject(e)
        }
    })
}

export default {
    name: 'sticker',
    commands: ['sticker', 's'],
    category: 'outils',
    description: 'Convertir une image/vidéo en sticker (envoyée ou en réponse)',

    async handler(client, message, args, { box, prefix } = {}) {
        const chat = message.key.remoteJid
        const pf = prefix || '.'

        // 1) média dans le message lui-même (image + légende .sticker)
        // 2) sinon, média du message auquel on répond
        const current = unwrap(message.message)
        const media = pickMedia(current) || pickMedia(findQuoted(current))

        if (!media) {
            return client.sendMessage(chat, {
                text: box(`❌ Envoie ou réponds à une image/vidéo avec ${pf}sticker`)
            }, { quoted: message })
        }

        try {
            let sticker
            if (media.type === 'image') {
                const img = await downloadMedia(media.msg, 'image')
                sticker = await processImage(img)
            } else {
                const vid = await downloadMedia(media.msg, 'video')
                if (vid.length > MAX_INPUT) {
                    return client.sendMessage(chat, { text: box('❌ Vidéo max 30 Mo') }, { quoted: message })
                }
                sticker = await processVideo(vid)
            }

            await client.sendMessage(chat, { sticker }, { quoted: message })
        } catch (e) {
            console.error('❌ Sticker:', e.message)
            await client.sendMessage(chat, { text: box('❌ ' + e.message) }, { quoted: message })
        }
    }
}
