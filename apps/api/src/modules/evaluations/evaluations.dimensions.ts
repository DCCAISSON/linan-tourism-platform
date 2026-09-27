import { ConflictException } from "@nestjs/common"
import type { DimensionObservation, EvaluationDimension } from "./evaluations.types.js"

export function resolveDimensionObservations(
  previous: { readonly standardId: string | null; readonly dimensionObservations: readonly DimensionObservation[] | null } | null,
  standard: { readonly id: string; readonly dimensions: readonly EvaluationDimension[] | null } | null,
  requested: readonly DimensionObservation[] | undefined,
): readonly DimensionObservation[] {
  const stored = previous?.dimensionObservations ?? []
  if (requested === undefined && stored.length > 0 && previous?.standardId !== (standard?.id ?? null)) {
    throw new ConflictException({ code: "evaluation_dimensions_standard_changed", message: "更换评价标准时，请明确填写或清空逐项观察。" })
  }
  const observations = requested ?? stored
  const allowed = new Set(standard?.dimensions?.map((dimension) => dimension.code) ?? [])
  const seen = new Set<string>()
  for (const item of observations) {
    if (!allowed.has(item.code) || seen.has(item.code)) {
      throw new ConflictException({ code: "evaluation_dimension_invalid", message: "观察项目不属于已确认的评价标准，或同一项目重复填写。" })
    }
    seen.add(item.code)
  }
  return observations
}
