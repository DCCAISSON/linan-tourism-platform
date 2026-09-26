import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const knownFaults = new Map([
  ["duplicate-callback", "duplicate payment callback detected"],
  ["cross-school-export", "cross-school roster export detected"],
  ["amount-mismatch", "order and payment amount mismatch detected"],
])

const formalCopyTerms = ["开发体验版", "体验版", "本地模拟", "本地测试", "虚构", "演示", "模拟", "测试"]
const sourceRoots = [
  ["apps", "admin", "src"],
  ["apps", "miniapp", "src"],
  ["apps", "site", "src"],
  ["apps", "admin", "dist"],
  ["apps", "miniapp", "dist"],
  ["apps", "miniapp", "unpackage", "dist"],
  ["apps", "site", "dist"],
]
const visibleExtensions = new Set([".vue", ".html", ".wxml"])

export function collectFormalSurfaceCopyViolations(rootDir) {
  const findings = []

  for (const rootParts of sourceRoots) {
    const start = join(rootDir, ...rootParts)
    if (!existsSync(start)) continue
    walkVisibleFiles(start, (filePath) => {
      const content = readFileSync(filePath, "utf8")
      const scanUnits = visibleTextUnits(filePath, content)
      for (const unit of scanUnits) {
        for (const term of formalCopyTerms) {
          if (unit.text.includes(term)) {
            findings.push({
              file: relative(rootDir, filePath).split(sep).join("/"),
              line: unit.line,
              term,
              text: unit.text.trim(),
            })
          }
        }
      }
    })
  }

  return findings
}

export function formatFormalSurfaceCopyViolations(findings) {
  if (findings.length === 0) return "formal-surface-copy: passed"
  const lines = ["formal-surface-copy blocked:"]
  for (const finding of findings) {
    lines.push(`- ${finding.file}:${finding.line}: ${finding.term}: ${finding.text}`)
  }
  return lines.join("\n")
}

function walkVisibleFiles(dir, visit) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) continue
      walkVisibleFiles(fullPath, visit)
      continue
    }
    if (!entry.isFile()) continue
    const extension = entry.name.slice(entry.name.lastIndexOf("."))
    if (visibleExtensions.has(extension)) visit(fullPath)
  }
}

function shouldSkipDirectory(name) {
  return ["node_modules", "tests", "test", "e2e", "scripts", "fixtures", "private", "docs", ".omo"].includes(name)
}

function visibleTextUnits(filePath, content) {
  if (filePath.endsWith(".vue")) return vueVisibleUnits(content)
  return plainMarkupUnits(content)
}

function vueVisibleUnits(content) {
  const units = []
  const template = content.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)
  if (template) {
    units.push(...plainMarkupUnits(template[1], lineNumberAt(content, template.index + template[0].indexOf(template[1]))))
  }

  const script = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)
  if (script) {
    units.push(...quotedChineseUnits(script[1], lineNumberAt(content, script.index + script[0].indexOf(script[1]))))
  }

  return units
}

function plainMarkupUnits(content, startingLine = 1) {
  return content.split(/\r?\n/).flatMap((line, index) => {
    const text = stripMarkup(line)
    return text ? [{ line: startingLine + index, text }] : []
  })
}

function quotedChineseUnits(content, startingLine = 1) {
  const units = []
  const literalPattern = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g
  for (const match of content.matchAll(literalPattern)) {
    const text = match[2].replace(/\\n/g, " ")
    if (!/[\u4e00-\u9fff]/.test(text)) continue
    units.push({ line: startingLine + lineNumberAt(content, match.index) - 1, text })
  }
  return units
}

function stripMarkup(line) {
  return line
    .replace(/<!--.*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length
}

function parseArgs(argv) {
  const injectIndex = argv.indexOf("--inject")
  const injected = injectIndex < 0 ? [] : (argv[injectIndex + 1] ?? "").split(",").filter(Boolean)
  const injectedArgIndexes = new Set(injectIndex < 0 ? [] : [injectIndex, injectIndex + 1])
  const checks = argv.filter((_, index) => !injectedArgIndexes.has(index))
  return { injected, checks: checks.length > 0 ? checks : ["formal-surface-copy"] }
}

function runInjectedFaults(injected) {
  const unknown = injected.filter((fault) => !knownFaults.has(fault))

  if (unknown.length > 0) {
    console.error(`Unknown release-gate injection: ${unknown.join(", ")}`)
    return 2
  }

  if (injected.length > 0) {
    console.error("Release gate blocked:")
    for (const fault of injected) {
      console.error(`- ${fault}: ${knownFaults.get(fault)}`)
    }
    return 1
  }

  return 0
}

function runChecks(rootDir, checks) {
  for (const check of checks) {
    if (check !== "formal-surface-copy") {
      console.error(`Unknown release-gate check: ${check}`)
      return 2
    }

    const findings = collectFormalSurfaceCopyViolations(rootDir)
    if (findings.length > 0) {
      console.error(formatFormalSurfaceCopyViolations(findings))
      return 1
    }
  }

  console.log("Release gate ready: no blocker.")
  return 0
}

function main() {
  const { injected, checks } = parseArgs(process.argv.slice(2))
  const injectedStatus = runInjectedFaults(injected)
  if (injectedStatus !== 0) process.exit(injectedStatus)
  process.exit(runChecks(join(dirname(fileURLToPath(import.meta.url)), ".."), checks))
}

if (process.argv[1] && statSync(process.argv[1]).isFile() && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
