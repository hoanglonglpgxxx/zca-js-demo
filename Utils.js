// import fs from 'fs';
import os from 'os';
import path from 'path';

function formatDateTime(dateObj) {
    const pad = (number) => String(number).padStart(2, '0');
    const Y = dateObj.getFullYear();
    const m = pad(dateObj.getMonth() + 1);
    const d = pad(dateObj.getDate());
    const H = pad(dateObj.getHours());
    const i = pad(dateObj.getMinutes());
    const s = pad(dateObj.getSeconds());
    return `${Y}-${m}-${d} ${H}:${i}:${s}`;
}

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

function debugLog(...args) {
    const now = new Date();
    const formattedString = formatDateTime(now);
    const prefix = `[${formattedString}] [${os.hostname()}]`;

    const textParts = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
    });
    const line = `${prefix} ${textParts.join(' ')}\n`;

    console.log(line);
}

export {
    debugLog
};