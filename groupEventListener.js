import { GroupEventType } from "zca-js";

export default function groupEventListener(api) {
    api.listener.on("group_event", (data) => {
        if (data.type == GroupEventType.JOIN_REQUEST) {
            // sự kiện yêu cầu tham gia
            console.log('có user yc tham gia');
        } else {
            // các sự kiện khác
            console.log('có event khác', data.type);
        }
    });
}

