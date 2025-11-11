import msgActions from "../msgActions.js";
import groupEventListener from "../groupEventListener.js";
export const runningBots = {};
// --- HÀM KHỞI TẠO BOT TỰ ĐỘNG (TỪ FILE) ---
async function initializeBotFromFile(account, index) {
    // `account` bây giờ là: { imei: "...", cookie: [...] }
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
export async function buildWorkers(accountsToManage) {
    if (accountsToManage.length > 0) {
        debugLog('NO_ADDR', `[WORKER ${shardId}] Bắt đầu khởi tạo ${accountsToManage.length} phiên tự động...`);
        for (let i = 0; i < accountsToManage.length; i++) {
            const account = accountsToManage[i];
            await initializeBotFromFile(account, i);
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        debugLog('NO_ADDR', `[WORKER ${shardId}] Đã khởi tạo xong ${accountsToManage.length} phiên tự động.`);
    }
}