export {}

const token = process.env.TELEGRAM_TOKEN ?? ""
const baseUrl = process.env.BOT_PUBLIC_URL ?? ""
const path = process.env.TELEGRAM_WEBHOOK_PATH ?? "/telegram/webhook"
const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ""

if (!token || !baseUrl) {
  console.error("Missing TELEGRAM_TOKEN or BOT_PUBLIC_URL")
  process.exit(1)
}

const url = new URL(path, baseUrl).toString()

const body: Record<string, unknown> = { url }
if (secret) body.secret_token = secret

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

const json = await res.json()
console.log(JSON.stringify(json, null, 2))

if (!res.ok) process.exit(1)
