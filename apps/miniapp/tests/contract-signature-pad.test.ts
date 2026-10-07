import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { compileScript, parse } from "vue/compiler-sfc"
import { ModuleKind, transpileModule } from "typescript"
import * as vue from "vue"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { ContractSignature } from "../src/contract-types"
import { handwriting } from "./contract-fixture"

type Touch = { readonly touches: readonly { readonly x: number; readonly y: number }[] }
type Pad = { readonly start: (event: Touch) => void; readonly move: (event: Touch) => void; readonly end: () => void; readonly clear: () => void }
const scopes: vue.EffectScope[] = []

async function setup(signature: ContractSignature | null, readonly = false) {
  const { descriptor } = parse(readFileSync(new URL("../src/components/ContractSignaturePad.vue", import.meta.url), "utf8"))
  const code = transpileModule(compileScript(descriptor, { id: "signature-pad" }).content, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const exports: { default?: { setup: (props: object, context: object) => Pad } } = {}
  const emit = vi.fn<(event: string, value: ContractSignature | null) => void>()
  const props = vue.reactive({ modelValue: signature, readonly, disabled: false })
  let mounted: () => Promise<void> = async () => {}
  const canvas = { clearRect: vi.fn(), setStrokeStyle: vi.fn(), setLineWidth: vi.fn(), setLineCap: vi.fn(), setLineJoin: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), draw: vi.fn() }
  const query = { in: () => query, select: () => query, boundingClientRect: (callback: (rect: { width: number }) => void) => { callback({ width: 300 }); return query }, exec: () => {} }
  runInNewContext(code, { exports, uni: { createSelectorQuery: () => query, createCanvasContext: () => canvas }, require: (name: string) => name === "vue" ? { ...vue, getCurrentInstance: () => null, onMounted: (callback: typeof mounted) => { mounted = callback } } : {} })
  const component = exports.default
  if (!component) throw new Error("Missing signature pad")
  const scope = vue.effectScope()
  scopes.push(scope)
  const pad = scope.run(() => component.setup(props, { expose: vi.fn(), emit }))
  if (!pad) throw new Error("Signature pad did not initialize")
  await mounted(); await vue.nextTick()
  return { pad, props, emit }
}

afterEach(() => { for (const scope of scopes) scope.stop(); scopes.length = 0 })

describe("signature pad draft restoration", () => {
  it("appends a new stroke to handwriting restored after returning from reading", async () => {
    const { pad, emit } = await setup(handwriting)
    pad.start({ touches: [{ x: 15, y: 24 }] }); pad.move({ touches: [{ x: 40, y: 60 }] }); pad.end()
    const result = emit.mock.calls[0]?.[1]
    expect(result?.strokes).toHaveLength(2)
    expect(result?.strokes[0]).toEqual(handwriting.strokes[0])
    expect(result?.strokes[1]).toEqual([{ x: 50, y: 80 }, { x: 133, y: 200 }])
    expect(handwriting.strokes).toHaveLength(1)
  })

  it("normalizes a restored draft's coordinates before adding new handwriting", async () => {
    const { pad, emit } = await setup({ width: 300, height: 180, strokes: [[{ x: 30, y: 18 }, { x: 90, y: 54 }]] })
    pad.start({ touches: [{ x: 15, y: 24 }] }); pad.move({ touches: [{ x: 40, y: 60 }] }); pad.end()
    expect(emit.mock.calls[0]?.[1]?.strokes[0]).toEqual([{ x: 100, y: 60 }, { x: 300, y: 180 }])
  })

  it("clears a restored draft and never edits the saved read-only record", async () => {
    const editable = await setup(handwriting)
    editable.pad.clear()
    expect(editable.emit).toHaveBeenLastCalledWith("update:modelValue", null)
    editable.pad.start({ touches: [{ x: 15, y: 24 }] }); editable.pad.move({ touches: [{ x: 40, y: 60 }] }); editable.pad.end()
    expect(editable.emit.mock.calls[1]?.[1]?.strokes).toHaveLength(1)
    const saved = await setup(handwriting, true)
    saved.pad.start({ touches: [{ x: 15, y: 24 }] }); saved.pad.move({ touches: [{ x: 40, y: 60 }] }); saved.pad.end(); saved.pad.clear()
    expect(saved.emit).not.toHaveBeenCalled()
  })
})
