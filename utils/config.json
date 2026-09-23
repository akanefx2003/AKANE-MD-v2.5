// utils/config.js
import fs from 'fs';

const CONFIG_FILE = './database/config.json';
const DEFAULT = {
    prefix: '.',
    publicMode: false,
    owner: '',
    sudoList: [],
    reaction: '🌹',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbCrJRnGufIyytPXy606',
};

function load() {
    try {
        if (!fs.existsSync(CONFIG_FILE)) {
            fs.mkdirSync('./database', { recursive: true });
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT, null, 2));
            return { ...DEFAULT };
        }
        return { ...DEFAULT, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) };
    } catch (e) { return { ...DEFAULT }; }
}

export const config = load();
export function saveConfig(cfg) {
    Object.assign(config, cfg);
    fs.mkdirSync('./database', { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}
