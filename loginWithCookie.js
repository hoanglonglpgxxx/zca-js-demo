import { Zalo, ThreadType } from "zca-js";
import msgActions from "./msgActions.js";
import groupEventListener from "./groupEventListener.js";
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const zalo = new Zalo({
    selfListen: false, // mặc định false, lắng nghe sự kiện của bản thân
    checkUpdate: true, // mặc định true, kiểm tra update
    logging: true // mặc định true, bật/tắt log mặc định của thư viện
});

app.get('/getQR', (req, res) => {
    const imgPath = path.join(__dirname, './zalo_data/zaloQR.png');
    // If file doesn't exist yet, respond with 404 or a JSON error
    if (!fs.existsSync(imgPath)) {
        return res.status(404).json({ error: 'QR image not found' });
    }
    return res.sendFile(imgPath);
});

// Start the HTTP server so localhost requests succeed
const PORT = process.env.PORT || 3302;
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});

let api;
try {
    console.log('chờ login');
    //wait event connect để call login
    const cookie = JSON.parse(fs.readFileSync("./cookie.json", "utf-8"));
    //viết hàm test cho case login 2 account
    api = await zalo.login({
        cookie: cookie,
        imei: "27e551d7-bb93-47d7-a773-6e0cb8860a8b-f1f6b29a6cc1f79a0fea05b885aa33d0", // điền giá trị đã lấy ở bước 3
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    });
    console.log('login thành công');
    app.get('/getContext', (req, res) => {
        return res.json(api.getContext());
    });
    app.get('/getCookie', (req, res) => {
        return res.json(api.getCookie());
    });
    msgActions(api);

    groupEventListener(api);

    /* setInterval(() => {
         api.fetchAccountInfo() // dùng cái này để check xem còn trong session không
            .then(console.log)
            .catch(console.error); 
        api.keepAlive()
            .then(console.log)
            .catch(console.error);
    }, 2000); */
} catch (err) {
    console.error('Failed to login via QR:', err);
}


api.listener.start(); // bắt đầu lắng nghe sự kiện
