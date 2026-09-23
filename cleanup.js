import fs from 'fs'
import path from 'path'
import os from 'os'

const TEMP_DIR = path.join(os.tmpdir(), 'akane-stickers')

export function cleanupTempFiles() {
    try {
        if (!fs.existsSync(TEMP_DIR)) return

        const files = fs.readdirSync(TEMP_DIR)
        let cleaned = 0

        files.forEach(file => {
            try {
                const filePath = path.join(TEMP_DIR, file)
                const stats = fs.statSync(filePath)
                const ageMs = Date.now() - stats.mtimeMs
                const ageHours = ageMs / (1000 * 60 * 60)

                // Supprimer les fichiers de plus de 1 heure
                if (ageHours > 1) {
                    fs.unlinkSync(filePath)
                    cleaned++
                }
            } catch (e) {
                console.error(`❌ Erreur suppression ${file}:`, e.message)
            }
        })

        if (cleaned > 0) {
            console.log(`🧹 ${cleaned} fichiers temp supprimés`)
        }
    } catch (e) {
        console.error('❌ Erreur cleanup:', e.message)
    }
}

// Lancer toutes les heures
setInterval(cleanupTempFiles, 60 * 60 * 1000)

console.log('🧹 Nettoyage temp activé (toutes les heures)')
