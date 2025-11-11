// --- Imports ---
import { Zalo } from "zca-js";
import msgActions from "./msgActions.js";
import groupEventListener from "./groupEventListener.js";
import { debugLog } from './Utils.js';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cluster from 'cluster';
import os from 'os';
// import { createClient } from 'redis';
//import 'dotenv/config';

// --- Imports cho tính năng mới ---
import ejs from 'ejs';
import { Server } from "socket.io";
import { HttpsProxyAgent } from "https-proxy-agent";
import nodefetch from "node-fetch";

const numCPUs = os.cpus().length;

// ===============================
// KHỐI PRIMARY (QUẢN LÝ)
// ===============================
if (cluster.isPrimary) {
    debugLog(`[Cluster] Primary ${process.pid} is running.`);
    const workersToFork = Math.max(1, Math.floor(numCPUs / 4));
    debugLog(`[Cluster] Sẽ tạo ra ${workersToFork} worker...`);

    for (let i = 0; i < workersToFork; i++) {
        cluster.fork({ SHARD_ID: i });
    }

    cluster.on('exit', (worker, code, signal) => {
        // Thêm kiểm tra an toàn để tránh crash
        const workerShardId = (worker.process && worker.process.env)
            ? worker.process.env.SHARD_ID
            : 'unknown';

        debugLog(`[Cluster] Worker ${worker.process.pid} (Shard ${workerShardId}) đã chết. Khởi động lại...`);

        if (workerShardId !== 'unknown') {
            cluster.fork({ SHARD_ID: workerShardId });
        } else {
            debugLog(`[Cluster] LỖI: Không thể khởi động lại worker ${worker.process.pid} vì không tìm thấy SHARD_ID.`);
        }
    });

} else {
    // ===============================
    // KHỐI WORKER (ỨNG DỤNG CỦA BẠN)
    // ===============================

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const shardId = parseInt(process.env.SHARD_ID, 10);
    const accountsPerShard = 2; // Số lượng tài khoản mỗi worker sẽ xử lý

    if (isNaN(shardId)) {
        debugLog(`[Worker ${process.pid}] LỖI NGHIÊM TRỌNG: Không có SHARD_ID.`);
        process.exit(1);
    }
    debugLog(`[Worker ${process.pid}] (Shard ${shardId}) đã khởi động.`);

    // --- Khởi tạo Redis Client ---
    // const redisUrl = `redis://default:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`;
    // const pubClient = createClient({ url: redisUrl });

    const runningBots = {};

    const app = express();
    app.use(express.json());
    const PORT = process.env.PORT || 3302;
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    let activeWs = null;

    // --- Logic đọc account từ thư mục 'data' ---
    let allAccountsData = [];
    try {
        const cookiesDir = '/u01/colombo/www/colombo4/nodejs/data/cookies';
        if (!fs.existsSync(cookiesDir)) {
            fs.mkdirSync(cookiesDir, { recursive: true });
            debugLog('NO_ADDR', `[Worker ${shardId}] Thư mục ${cookiesDir} không tồn tại, đã tạo mới.`);
        }

        const cookieFiles = fs.readdirSync(cookiesDir)
            .filter(file => file.startsWith('cred_') && file.endsWith('.json'));

        allAccountsData = cookieFiles.map(file => {
            const filePath = path.join(cookiesDir, file);
            try {
                const fileData = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(fileData);
            } catch (e) {
                debugLog('NO_ADDR', `[Worker ${shardId}] LỖI: Không thể đọc hoặc parse file ${file}: ${e.message}`);
                return null;
            }
        }).filter(account => account !== null);

        debugLog('NO_ADDR', `[Worker ${shardId}] Đã tải thành công ${allAccountsData.length} tài khoản cookie từ thư mục ${cookiesDir}.`);

    } catch (err) {
        debugLog('NO_ADDR', `[Worker ${shardId}] LỖI: Không thể đọc thư mục cookies: ${err.message}`);
    }


    function getMyAccounts(shardId) {
        const startIndex = shardId * accountsPerShard;
        const endIndex = startIndex + accountsPerShard;
        const myAccounts = allAccountsData.slice(startIndex, endIndex);
        return myAccounts;
    }


    async function loginZaloAccountWithQR(customProxy, cred) {
        debugLog('Bắt đầu quá trình đăng nhập Zalo QR...');
        let agent;
        if (customProxy && customProxy.trim() !== "") {
            agent = new HttpsProxyAgent(customProxy);
        } else {
            agent = null;
        }

        let zalo;
        if (agent) {
            zalo = new Zalo({ agent: agent, polyfill: nodefetch });
        } else {
            zalo = new Zalo({});
        }

        let resolveQrPromise;
        let rejectQrPromise;
        const qrPromise = new Promise((resolve, reject) => {
            resolveQrPromise = resolve;
            rejectQrPromise = reject;
        });

        zalo.loginQR(null, (qrData) => {
            if (qrData?.data?.image) {
                const qrCodeImage = `data:image/png;base64,${qrData.data.image}`;
                debugLog('Đã tạo mã QR, đang trả về cho API...');
                resolveQrPromise({ qrCodeImage: qrCodeImage });
            } else {
                rejectQrPromise(new Error("Không thể lấy mã QR"));
            }
        })
            .then(async (api) => {
                // 3. PHẦN NÀY SẼ CHẠY NGẦM SAU KHI USER QUÉT MÃ THÀNH CÔNG
                debugLog('Đăng nhập QR thành công, đang chờ kết nối listener...');

                msgActions(api);
                groupEventListener(api);

                api.listener.onConnected(() => {
                    debugLog("Zalo SDK đã kết nối listener");
                    if (activeWs) {
                        activeWs.send("login_success");
                    }
                });

                await api.listener.start();

                // 4. LƯU THÔNG TIN
                const accountInfo = await api.fetchAccountInfo();
                const { profile } = accountInfo;
                const ownId = profile.userId;
                debugLog(`Đăng nhập thành công: ${profile.displayName} (${ownId})`);

                const context = await api.getContext();
                const { imei, cookie, userAgent } = context;
                const data = { imei, cookie, userAgent };
                const cookiesDir = '/u01/colombo/www/colombo4/nodejs/data/cookies';
                if (!fs.existsSync(cookiesDir)) fs.mkdirSync(cookiesDir, { recursive: true });
                fs.writeFileSync(`${cookiesDir}/cred_${ownId}.json`, JSON.stringify(data, null, 4));
                debugLog(`Đã lưu cookie vào file cred_${ownId}.json`);

                runningBots[ownId] = api;

            })
            .catch(error => {
                // Xử lý lỗi nếu đăng nhập thất bại (ví dụ: QR hết hạn)
                console.error('Lỗi trong quá trình đăng nhập Zalo:', error);
                if (rejectQrPromise) rejectQrPromise(error);
            });

        // 5. TRẢ VỀ PROMISE CỦA QR CODE NGAY LẬP TỨC
        return qrPromise;
    }


    async function initializeBotFromFile(account, index) {
        const accountIdentifier = `Shard_${shardId}_Account_${index}`;
        try {
            const zalo = new Zalo({ selfListen: false, checkUpdate: true, logging: true });
            const api = await zalo.login({
                cookie: account.cookie,
                imei: account.imei,
                userAgent: account.userAgent // Đọc userAgent từ file
            });
            const accountId = await api.getOwnId();
            runningBots[accountId] = api;
            msgActions(api);
            groupEventListener(api);
            await api.listener.start();
            debugLog('NO_ADDR', `[WORKER ${shardId}] Đăng nhập tự động thành công: ${accountId}`);
        } catch (e) {
            debugLog('NO_ADDR', `[WORKER ${shardId}] Lỗi đăng nhập tự động ${accountIdentifier}:`, e.message);
        }
    }


    async function runWorker() {

        // try {
        //     await pubClient.connect();
        //     debugLog('NO_ADDR', `[Worker ${process.pid}] (Shard ${shardId}) Đã kết nối Redis.`);
        // } catch (e) {
        //     debugLog('NO_ADDR', `[Worker ${process.pid}] (Shard ${shardId}) LỖI: Không thể kết nối Redis. ${e.message}`);
        //     process.exit(1);
        // }

        app.get('/status', (req, res) => {
            res.json({
                worker_pid: process.pid,
                shard_id: shardId,
                status: "Running",
                bots_running: Object.keys(runningBots).length
            });
        });

        app.get('/zalo-login', (req, res) => {
            res.render('login-zalo');
        });

        app.post('/zalo-login', async (req, res) => {
            const { proxy } = req.body;
            try {
                const result = await loginZaloAccountWithQR(proxy, null);

                // Trả về QR code ngay lập tức
                res.json({ success: true, qrCodeImage: result.qrCodeImage });

            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        const server = app.listen(PORT, "0.0.0.0", () => {
            debugLog(`[Worker ${process.pid}] (Shard ${shardId}) API server đang lắng nghe trên cổng ${PORT}`);
        });

        const io = new Server(server, { path: '/ws', cors: { origin: "*" } });

        io.on('connection', ws => {
            debugLog(`[Worker ${process.pid}] Client WebSocket đã kết nối.`);
            if (activeWs) {
                ws.close(1013, 'Một client khác đang đăng nhập. Vui lòng thử lại sau.');
                return;
            }
            activeWs = ws;

            ws.on('close', () => {
                debugLog(`[Worker ${process.pid}] Client WebSocket đã ngắt kết nối.`);
                if (activeWs === ws) {
                    activeWs = null;
                }
            });
        });

        const accountsToManage = getMyAccounts(shardId);
        if (accountsToManage.length > 0) {
            debugLog('NO_ADDR', `[WORKER ${shardId}] Bắt đầu khởi tạo ${accountsToManage.length} phiên tự động...`);
            for (let i = 0; i < accountsToManage.length; i++) {
                const account = accountsToManage[i];
                await initializeBotFromFile(account, i);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            debugLog('NO_ADDR', `[WORKER ${shardId}] Đã khởi tạo xong ${accountsToManage.length} phiên tự động.`);
        }
    }

    runWorker();
}