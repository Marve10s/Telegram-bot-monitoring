import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

const STATE_PATH = join(process.cwd(), "state.json")
const BOT_UPDATE_KEY = "__bot_last_update_id__"
const MONITOR_WORKFLOWS = ["monitor-instocktrades.yml", "monitor-ebay.yml"]

type StateMap = Record<string, string>

type TelegramUpdate = {
  update_id: number
  message?: { chat: { id: number }; text?: string }
}

function loadState(): StateMap {
  if (!existsSync(STATE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(STATE_PATH, "utf-8")) as StateMap
  } catch {
    return {}
  }
}

function saveState(state: StateMap): void {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n")
}

async function sendMessage(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  })
}

async function dispatchWorkflow(workflowFile: string) {
  const ghToken = process.env.GITHUB_TOKEN ?? ""
  const repo = process.env.GITHUB_REPOSITORY ?? ""
  const ref = process.env.GITHUB_REF_NAME ?? "main"

  if (!ghToken || !repo) {
    throw new Error("GitHub dispatch credentials not available")
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "price-monitor-bot",
      },
      body: JSON.stringify({ ref }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Dispatch failed for ${workflowFile}: ${res.status} ${body}`)
  }
}

async function main() {
  const token = process.env.TELEGRAM_TOKEN ?? ""
  const chatId = process.env.TELEGRAM_CHAT_ID ?? ""

  if (!token || !chatId) {
    console.log("[bot] credentials not set")
    return
  }

  const state = loadState()
  const lastId = Number(state[BOT_UPDATE_KEY] ?? "0")

  const res = await fetch(
    `https://api.telegram.org/bot${token}/getUpdates?offset=${lastId + 1}&timeout=0`,
  )
  if (!res.ok) return

  const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] }
  if (!data.ok || data.result.length === 0) return

  let newLastId = lastId
  for (const update of data.result) {
    newLastId = Math.max(newLastId, update.update_id)
    const msg = update.message
    if (!msg || String(msg.chat.id) !== chatId) continue

    const text = msg.text?.trim() ?? ""

    if (text === "/test") {
      await sendMessage(token, chatId, "✅ Bot is alive and running.")
    } else if (text === "/trigger") {
      await sendMessage(token, chatId, "⚡ Triggering monitor workflows...")
      try {
        for (const workflowFile of MONITOR_WORKFLOWS) {
          await dispatchWorkflow(workflowFile)
        }
        await sendMessage(token, chatId, "✅ Monitor workflows dispatched.")
      } catch (error) {
        console.error(error)
        await sendMessage(token, chatId, "❌ Failed to trigger monitor workflows.")
      }
    }
  }

  const freshState = loadState()
  freshState[BOT_UPDATE_KEY] = String(newLastId)
  saveState(freshState)
}

main().catch(console.error)
