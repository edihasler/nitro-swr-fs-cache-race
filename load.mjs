// 40 concurrent clients request "/" for 12 seconds without pause.
const url = 'http://localhost:3000/'
const clients = 40
const end = Date.now() + 12_000

let requests = 0
async function client() {
  while (Date.now() < end) {
    await (await fetch(url)).text()
    requests++
  }
}

await Promise.all(Array.from({ length: clients }, client))
console.log(`${requests} requests sent`)
