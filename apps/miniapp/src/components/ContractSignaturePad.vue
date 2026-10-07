<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref, watch } from "vue"
import type { ContractSignature } from "../contract-types"

const props = defineProps<{ readonly modelValue: ContractSignature | null; readonly readonly?: boolean; readonly disabled?: boolean }>()
const emit = defineEmits<{ readonly "update:modelValue": [value: ContractSignature | null] }>()
const instance = getCurrentInstance()
const canvasId = `contract-signature-${instance?.uid ?? 0}`
const displayWidth = ref(300)
const displayHeight = ref(180)
const limitMessage = ref("")
let context: UniApp.CanvasContext | undefined
let strokes: { x: number; y: number }[][] = []
let drawing = false
const width = 1000, height = 600
type SignatureTouchEvent = { readonly touches: readonly { readonly x: number; readonly y: number }[] }

function redraw(): void {
  if (!context) return
  context.clearRect(0, 0, displayWidth.value, displayHeight.value)
  context.setStrokeStyle("#183d35")
  context.setLineWidth(2)
  context.setLineCap("round")
  context.setLineJoin("round")
  const signature = props.modelValue
  const sourceWidth = signature?.width ?? width, sourceHeight = signature?.height ?? height
  for (const stroke of signature?.strokes ?? strokes) {
    const first = stroke[0]
    if (!first) continue
    context.beginPath()
    context.moveTo(first.x * displayWidth.value / sourceWidth, first.y * displayHeight.value / sourceHeight)
    for (const point of stroke.slice(1)) context.lineTo(point.x * displayWidth.value / sourceWidth, point.y * displayHeight.value / sourceHeight)
    context.stroke()
  }
  context.draw()
}
function point(event: SignatureTouchEvent | TouchEvent): { x: number; y: number } | undefined {
  const touch = event.touches[0]
  if (!touch || !("x" in touch) || !("y" in touch) || !Number.isFinite(touch.x) || !Number.isFinite(touch.y)) return undefined
  return { x: Math.round(Math.max(0, Math.min(width, touch.x / displayWidth.value * width))), y: Math.round(Math.max(0, Math.min(height, touch.y / displayHeight.value * height))) }
}
function start(event: SignatureTouchEvent | TouchEvent): void {
  if (props.readonly || props.disabled || !context) return
  if (strokes.length >= 100) { limitMessage.value = "笔画较多，请清空后重新签字。"; return }
  const first = point(event)
  if (!first) return
  strokes.push([first]); drawing = true
}
function move(event: SignatureTouchEvent | TouchEvent): void {
  if (!drawing || props.readonly || props.disabled || !context) return
  const stroke = strokes[strokes.length - 1], next = point(event)
  const previous = stroke?.[stroke.length - 1]
  if (!stroke || !next || !previous || Math.hypot(next.x - previous.x, next.y - previous.y) < 2) return
  if (strokes.reduce((total, line) => total + line.length, 0) >= 5000) { limitMessage.value = "笔迹较多，请清空后重新签字。"; end(); return }
  stroke.push(next)
  context.setStrokeStyle("#183d35")
  context.setLineWidth(2)
  context.setLineCap("round")
  context.beginPath()
  context.moveTo(previous.x * displayWidth.value / width, previous.y * displayHeight.value / height)
  context.lineTo(next.x * displayWidth.value / width, next.y * displayHeight.value / height)
  context.stroke()
  context.draw(true)
}
function end(): void {
  if (!drawing) return
  drawing = false
  emit("update:modelValue", { width, height, strokes: strokes.map(stroke => stroke.map(p => ({ ...p }))) })
}
function clear(): void {
  if (props.readonly || props.disabled) return
  drawing = false; strokes = []; limitMessage.value = ""
  emit("update:modelValue", null)
  context?.clearRect(0, 0, displayWidth.value, displayHeight.value)
  context?.draw()
}
watch(() => props.modelValue, async signature => {
  drawing = false
  strokes = signature ? signature.strokes.map(stroke => stroke.map(point => ({ x: Math.round(point.x * width / signature.width), y: Math.round(point.y * height / signature.height) }))) : []
  if (!signature) limitMessage.value = ""
  displayHeight.value = Math.round(displayWidth.value * (signature ? signature.height / signature.width : height / width))
  await nextTick()
  redraw()
}, { immediate: true })
onMounted(async () => {
  await nextTick()
  const query = uni.createSelectorQuery().in(instance?.proxy)
  query.select(`#${canvasId}`).boundingClientRect(rect => {
    if (!Array.isArray(rect) && typeof rect.width === "number" && rect.width > 0) {
      displayWidth.value = rect.width
      displayHeight.value = Math.round(rect.width * (props.modelValue ? props.modelValue.height / props.modelValue.width : height / width))
      void nextTick(() => { context = uni.createCanvasContext(canvasId, instance?.proxy); redraw() })
    }
  }).exec()
})
</script>

<template>
  <view class="signature-pad">
    <view class="signature-pad__heading"><text>{{ readonly ? '已保存的本人笔迹' : '请在下框手写姓名' }}</text><button v-if="!readonly" class="button-secondary" :disabled="disabled ?? false" @tap="clear">清空重写</button></view>
    <canvas :id="canvasId" :canvas-id="canvasId" class="signature-pad__canvas" :style="{ height: `${displayHeight}px` }" :disable-scroll="!readonly" aria-label="手写签字区域" @touchstart="start" @touchmove.stop.prevent="move" @touchend="end" @touchcancel="end" />
    <text v-if="limitMessage" class="signature-pad__error" role="alert">{{ limitMessage }}</text>
  </view>
</template>

<style scoped>
.signature-pad__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin: var(--space-4) 0 var(--space-2); color: var(--text-primary); font-size: var(--font-body-sm); }
.signature-pad__heading button { flex-shrink: 0; font-size: var(--font-body-sm); }
.signature-pad__canvas { display: block; box-sizing: border-box; width: 100%; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-elevated); touch-action: none; }
.signature-pad__error { display: block; margin-top: var(--space-2); color: var(--status-error); font-size: var(--font-body-sm); }
</style>
