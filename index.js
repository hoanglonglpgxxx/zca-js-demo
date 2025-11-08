import { Zalo } from "zca-js";
import fs from "fs";

const SESSION_FILE = "./my-session.json";

async function startBot() {
    let zalo;
    let savedSession;

    try {
        if (fs.existsSync(SESSION_FILE)) {
            console.log("Đã tìm thấy session, đang tải...");
            const data = fs.readFileSync(SESSION_FILE, "utf-8");
            savedSession = JSON.parse(data);
        }
    } catch (e) {
        console.error("Lỗi khi đọc file session:", e);
    }

    // === SỬA LỖI Ở ĐÂY ===
    // Phải dùng 'new' để khởi tạo
    zalo = new Zalo({
        selfListen: false, // mặc định false, lắng nghe sự kiện của bản thân
        checkUpdate: true, // mặc định true, kiểm tra update
        logging: true // mặc định true, bật/tắt log mặc định của thư viện });
    });

    // Bắt đầu quá trình đăng nhập
    const api = await zalo.loginQR({
    });

    api.listener.on("ready", () => {
        console.log("Bot đã sẵn sàng và kết nối thành công!");
    });

    // (Nên có) Lắng nghe tin nhắn
    api.listener.on("message", (message) => {
        console.log("Tin nhắn mới từ:", message.threadId);
        console.log("Nội dung:", JSON.stringify(message));

        // Ví dụ tự động trả lời
        // if (message.body === "ping") {
        //     api.sendMessage("pong", message.threadId);
        // }

    });
    api.getSession().then(console.log)
        .catch(console.error);
    api.listener.start();
    // ======================



}

// Chạy bot
startBot();