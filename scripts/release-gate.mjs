const knownFaults = new Map([
  ["duplicate-callback", "duplicate payment callback detected"],
  ["cross-school-export", "cross-school roster export detected"],
  ["amount-mismatch", "order and payment amount mismatch detected"],
])

const injectIndex = process.argv.indexOf("--inject")
const injected = injectIndex < 0 ? [] : (process.argv[injectIndex + 1] ?? "").split(",").filter(Boolean)
const unknown = injected.filter((fault) => !knownFaults.has(fault))

if (unknown.length > 0) {
  console.error(`Unknown release-gate injection: ${unknown.join(", ")}`)
  process.exit(2)
}

if (injected.length > 0) {
  console.error("Release gate blocked:")
  for (const fault of injected) {
    console.error(`- ${fault}: ${knownFaults.get(fault)}`)
  }
  process.exit(1)
}

console.log("Release gate ready: no injected blocker.")
