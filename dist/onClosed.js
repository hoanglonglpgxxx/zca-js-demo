
export default function onClosed(api) {
    api.listener.onClosed(() => {
        console.log(`Closed - API listener đã ngắt kết nối cho tài khoản ${ownId}`);

        // Xử lý đăng nhập lại khi API listener bị đóng
        handleRelogin(api);
    });
}

async function handleRelogin(api) {
    try {
        console.log("Đang thử đăng nhập lại...");

        // Lấy ownId của tài khoản bị ngắt kết nối
        const ownId = api.getOwnId();

        if (!ownId) {
            console.error("Không thể xác định ownId, không thể đăng nhập lại");
            return;
        }

        // Kiểm tra thời gian relogin gần nhất
        const lastReloginTime = reloginAttempts.get(ownId);
        const now = Date.now();

        if (lastReloginTime && now - lastReloginTime < RELOGIN_COOLDOWN) {
            console.log(`Bỏ qua việc đăng nhập lại tài khoản ${ownId}, đã thử cách đây ${Math.floor((now - lastReloginTime) / 1000)} giây`);
            return;
        }

        // Cập nhật thời gian relogin
        reloginAttempts.set(ownId, now);

        // Tìm thông tin proxy từ mảng zaloAccounts
        const accountInfo = zaloAccounts.find(acc => acc.ownId === ownId);
        const customProxy = accountInfo?.proxy || null;

        // Tìm file cookie tương ứng
        const cookiesDir = './data/cookies';
        const cookieFile = `${cookiesDir}/cred_${ownId}.json`;

        if (!fs.existsSync(cookieFile)) {
            console.error(`Không tìm thấy file cookie cho tài khoản ${ownId}`);
            return;
        }

        // Đọc cookie từ file
        const cookie = JSON.parse(fs.readFileSync(cookieFile, "utf-8"));

        // Đăng nhập lại với cookie
        console.log(`Đang đăng nhập lại tài khoản ${ownId} với proxy ${customProxy || 'không có'}...`);

        // Thực hiện đăng nhập lại
        await loginZaloAccount(customProxy, cookie);
        console.log(`Đã đăng nhập lại thành công tài khoản ${ownId}`);
    } catch (error) {
        console.error("Lỗi khi thử đăng nhập lại:", error);
    }
}