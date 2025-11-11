import { ThreadType } from "zca-js";
import { debugLog } from "./Utils.js";
export default function msgActions(api) {

    api.listener.on("message", (message) => {
        console.log(222222222);
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
    /* api.listener.on("connected", async () => {
        const lastMsgId = null; // string or null\ 1762759858446 | '7208601930298'
        console.log('connected');
        api.listener.requestOldMessages(ThreadType.User, lastMsgId); // User
    });

    api.listener.on("old_messages", async (messages) => {
        console.log(messages);
        messages.forEach((message) => {
            const { ts } = message.data;

            console.log(`OLD MSG | ${JSON.stringify((message))}`);
        });
    }); */
}