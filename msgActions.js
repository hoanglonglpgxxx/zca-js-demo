import { ThreadType } from "zca-js";
import { debugLog } from "./Utils.js";
export default function msgActions(api) {

    api.listener.on("message", (message) => {
        const isPlainText = typeof message.data.content === "string";
        switch (message.type) {
            case ThreadType.User: {
                if (isPlainText) {
                    console.log('có tin user', message);
                }
                break;
            }
            case ThreadType.Group: {
                if (isPlainText) {
                    console.log('có tin group', message);
                }
                break;
            }
        }
        message.type = 'message';
        debugLog(message);
    });

    api.listener.on("reaction", (reaction) => {
        console.log('reaction', reaction);
        reaction.type = 'reaction';
        debugLog(reaction);
    });

    api.listener.on("undo", (undo) => {
        console.log('undo', undo);
        undo.type = 'undo';
        debugLog(undo);
    });
}