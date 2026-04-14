import process from 'node:process'
import { runTasksSync } from './tasks-sync-core.mjs'

async function main() {
  const result = await runTasksSync({ loadDotEnv: true, logger: console })
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2))
  process.exit(1)
})
