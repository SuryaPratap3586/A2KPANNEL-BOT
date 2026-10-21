export async function tgSend(botToken: string | undefined, chatId: bigint | number | string, text: string) {
  if (!botToken) return;
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId.toString(), text }),
  }).catch(() => {});
}
