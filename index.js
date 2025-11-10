import { Zalo } from "zca-js";
import msgActions from "./msgActions.js";
import groupEventListener from "./groupEventListener.js";
import { debugLog } from './Utils.js'; // Đảm bảo bạn có file Utils.js
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cluster from 'cluster';
import os from 'os';
import { createClient } from 'redis';

const numCPUs = os.cpus().length;

import 'dotenv/config'; // SAU BỎ
// ===============================
// KHỐI PRIMARY (QUẢN LÝ)
// ===============================
if (cluster.isPrimary) {
    console.log(`[Cluster] Primary ${process.pid} is running.`);
    const workersToFork = Math.max(1, Math.floor(numCPUs / 4));
    console.log(`[Cluster] Sẽ tạo ra ${workersToFork} worker...`);

    for (let i = 0; i < workersToFork; i++) {
        cluster.fork({
            SHARD_ID: i
        });
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`[Cluster] Worker ${worker.process.pid} (Shard ${worker.process.env.SHARD_ID}) đã chết. Khởi động lại...`);
        cluster.fork({
            SHARD_ID: worker.process.env.SHARD_ID
        });
    });

} else {
    // ===============================
    // KHỐI WORKER (ỨNG DỤNG CỦA BẠN)
    // ===============================
    // Toàn bộ code logic sẽ nằm trong khối else này

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const shardId = parseInt(process.env.SHARD_ID, 10);
    const accountsPerShard = 100;

    if (isNaN(shardId)) {
        console.log(`[Worker ${process.pid}] LỖI NGHIÊM TRỌNG: Không có SHARD_ID.`);
    }

    console.log(`[Worker ${process.pid}] (Shard ${shardId}) đã khởi động.`);

    // --- Khởi tạo Redis Client cho worker này ---
    const redisUrl = `redis://default:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
    console.log(redisUrl);
    const pubClient = createClient({ url: redisUrl });

    // Nơi lưu trữ các instance 'api' đang chạy (chỉ dành cho listener)
    const runningBots = {};

    // --- Web Server ---
    const app = express();
    app.use(express.json());
    const PORT = process.env.PORT || 3302; // Lấy PORT từ biến môi trường

    // --- Logic đọc Cookie ---
    let allCookieArrays = [];
    try {
        const data = fs.readFileSync('cookies.json', 'utf8');
        allCookieArrays = JSON.parse(data);
        debugLog('NO_ADDR', `[Worker ${shardId}] Đã tải thành công ${allCookieArrays.length} mảng cookie.`);
    } catch (err) {
        debugLog('NO_ADDR', `[Worker ${shardId}] LỖI NGHIÊM TRỌNG: Không thể đọc file cookies.json: ${err.message}`);
    }

    /**
     * Lấy 100 mảng cookie cho worker này
     */
    function getMyCookieArrays(shardId) {
        const startIndex = shardId * accountsPerShard;
        const endIndex = startIndex + accountsPerShard;
        const myCookieArrays = allCookieArrays.slice(startIndex, endIndex);
        return myCookieArrays;
    }

    /**
     * Khởi tạo một bot Zalo duy nhất
     */
    async function initializeBot(cookieArray, index) {
        const accountIdentifier = `Shard_${shardId}_Account_${index}`;
        try {
            // Tạo một instance Zalo MỚI cho mỗi tài khoản
            const zalo = new Zalo({
                selfListen: false,
                checkUpdate: true,
                logging: true
            });

            // Đăng nhập bằng mảng cookie
            const api = await zalo.login({
                cookie: cookieArray,
                imei: "27e551d7-bb93-47d7-a773-6e0cb8860a8b-f1f6b29a6cc1f79a0fea05b885aa33d0",
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            });

            // Lấy ID tài khoản (để dùng làm key)
            const accountId = await api.getOwnId();
            debugLog('NO_ADDR', `[Worker ${shardId}] Đăng nhập thành công: ${accountId} (Định danh: ${accountIdentifier})`);

            // Lấy context và cookie để lưu vào Redis
            const context = api.getContext();
            const cookie = api.getCookie();

            // Lưu trạng thái vào Redis
            await pubClient.hSet(`zalo_contexts`, accountId, JSON.stringify(context));
            await pubClient.hSet(`zalo_cookies`, accountId, JSON.stringify(cookie));

            // Lưu instance 'api' vào bộ nhớ cục bộ để gắn listener
            runningBots[accountId] = api;

            // Gắn listener
            msgActions(api);
            groupEventListener(api);

            // Bắt đầu lắng nghe
            await api.listener.start();

        } catch (e) {
            if (e.message.includes('INVALID_COOKIES')) {
                debugLog('NO_ADDR', `[WORKER ${shardId}] LỖI COOKIE HẾT HẠN cho tài khoản: ${accountIdentifier}`);
            } else {
                debugLog('NO_ADDR', `[WORKER ${shardId}] Lỗi đăng nhập ${accountIdentifier}:`, e.message);
            }
        }
    }

    /**
     * Hàm chạy chính của Worker
     */
    async function runWorker() {
        // Kết nối Redis trước khi làm bất cứ điều gì
        try {
            await pubClient.connect();
            debugLog('NO_ADDR', `[Worker ${process.pid}] (Shard ${shardId}) Đã kết nối Redis.`);
        } catch (e) {
            debugLog('NO_ADDR', `[Worker ${process.pid}] (Shard ${shardId}) LỖI: Không thể kết nối Redis. ${e.message}`);
        }

        app.get('/status', (req, res) => {
            res.json({
                worker_pid: process.pid,
                shard_id: shardId,
                status: "Running",
                bots_running: Object.keys(runningBots).length // Trả về số bot đang chạy
            });
        });

        app.get('/getContext', async (req, res) => {
            const accountId = req.query.accountId;
            if (!accountId) {
                return res.status(400).json({ error: 'accountId is required' });
            }
            try {
                // pubClient bây giờ đã được đảm bảo là đã kết nối
                const contextString = await pubClient.hGet('zalo_contexts', accountId);
                console.log(contextString); // Log này bây giờ sẽ chạy
                if (!contextString) {
                    return res.status(404).json({ error: 'Bot context not found in Redis cache.' });
                }
                // Dòng này sẽ được thực thi
                return res.json(JSON.parse(contextString));
            } catch (e) {
                return res.status(500).json({ error: 'Failed to read from Redis.' });
            }
        });

        app.get('/getCookie', async (req, res) => {
            const accountId = req.query.accountId;
            if (!accountId) {
                return res.status(400).json({ error: 'accountId is required' });
            }
            try {
                const cookieString = await pubClient.hGet('zalo_cookies', accountId);
                if (!cookieString) {
                    return res.status(404).json({ error: 'Bot cookie not found in Redis cache.' });
                }
                return res.json(JSON.parse(cookieString));
            } catch (e) {
                return res.status(500).json({ error: 'Failed to read from Redis.' });
            }
        });

        app.listen(PORT, () => {
            console.log(`[Worker ${process.pid}] (Shard ${shardId}) đang lắng nghe trên cổng ${PORT}`);
        });

        const accountsToManage = getMyCookieArrays(shardId);
        if (accountsToManage.length === 0) {
            debugLog('NO_ADDR', `[WORKER ${shardId}] Không tìm thấy tài khoản nào để quản lý.`);
            return;
        }

        debugLog('NO_ADDR', `[WORKER ${shardId}] Bắt đầu khởi tạo ${accountsToManage.length} phiên...`);

        // Lặp qua và khởi tạo từng bot
        for (let i = 0; i < accountsToManage.length; i++) {
            const cookieArray = accountsToManage[i];
            await initializeBot(cookieArray, i);

            // Tạm dừng một chút để tránh spam đăng nhập
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        debugLog('NO_ADDR', `[WORKER ${shardId}] Đã khởi tạo xong tất cả ${accountsToManage.length} phiên.`);
    }

    // Khởi chạy worker
    runWorker();
}