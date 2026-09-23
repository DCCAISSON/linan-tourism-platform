import type {
  TransportSuggestionAssignment,
  TransportSuggestionInput,
  TransportSuggestionResponse,
  TransportSuggestionTraveler,
} from "./transport.types.js"

type VehicleSlot = {
  readonly sequence: number
  readonly capacity: number
  readonly explanation: string
}

export function createTransportSuggestion(input: TransportSuggestionInput): TransportSuggestionResponse {
  const slots = createSlots(input)
  const conflicts = validateSuggestionRequest(input, slots)
  if (conflicts.length > 0) {
    return { kind: "conflict", assignments: [], explanations: slots.map((slot) => slot.explanation), conflicts }
  }
  const assignments = assignTravelers(input.travelers, slots)
  if (assignments.length < input.travelers.length) {
    return {
      kind: "conflict",
      assignments,
      explanations: slots.map((slot) => slot.explanation),
      conflicts: ["显式可用座位不足，无法为全部人员生成草案。"],
    }
  }
  return { kind: "draft", assignments, explanations: slots.map((slot) => slot.explanation), conflicts: [] }
}

function createSlots(input: TransportSuggestionInput): readonly VehicleSlot[] {
  return Object.entries(input.availableSeatsBySequence)
    .map(([sequenceText, seats]) => {
      const sequence = Number(sequenceText)
      const reserved = input.reservedSeatsBySequence[sequence] ?? 0
      const staff = input.staffSeatsBySequence[sequence] ?? 0
      const capacity = seats - reserved - staff
      return {
        sequence,
        capacity,
        explanation: `${sequence}号车可用座位${seats}，预留${reserved}，教师/导游占位${staff}，实际可分配${capacity}。`,
      }
    })
    .sort((left, right) => left.sequence - right.sequence)
}

function validateSuggestionRequest(input: TransportSuggestionInput, slots: readonly VehicleSlot[]): readonly string[] {
  const conflicts: string[] = []
  if (input.keepFamilyTogether) {
    conflicts.push("当前人员计划缺少已确认家庭关系，不能自动执行亲子同车规则。")
  }
  if (!input.allowClassSplit) {
    const maxCapacity = slots.reduce((max, slot) => Math.max(max, slot.capacity), 0)
    for (const [classId, count] of classCounts(input.travelers)) {
      if (count > maxCapacity) conflicts.push(`${classId}班级${count}人超过单车最大可用座位${maxCapacity}，且当前设置不允许拆班。`)
    }
  }
  if (slots.some((slot) => slot.capacity < 0)) {
    conflicts.push("预留位和教师/导游占位超过可用座位，请调整显式参数。")
  }
  return conflicts
}

function classCounts(travelers: readonly TransportSuggestionTraveler[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const traveler of travelers) {
    const classId = traveler.classId ?? "未分班"
    counts.set(classId, (counts.get(classId) ?? 0) + 1)
  }
  return counts
}

function assignTravelers(
  travelers: readonly TransportSuggestionTraveler[],
  slots: readonly VehicleSlot[],
): readonly TransportSuggestionAssignment[] {
  const remaining = new Map(slots.map((slot) => [slot.sequence, slot.capacity]))
  const assignments: TransportSuggestionAssignment[] = []
  for (const traveler of travelers) {
    const slot = slots.find((candidate) => (remaining.get(candidate.sequence) ?? 0) > 0)
    if (slot === undefined) return assignments
    assignments.push({ personRef: traveler.personRef, sequence: slot.sequence })
    remaining.set(slot.sequence, (remaining.get(slot.sequence) ?? 0) - 1)
  }
  return assignments
}
