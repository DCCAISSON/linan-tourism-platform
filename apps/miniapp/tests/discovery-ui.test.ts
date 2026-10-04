import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const readSource = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8")
const home = readSource("../src/pages/index/index.vue")
const catalog = readSource("../src/pages/activities/index.vue")
const detail = readSource("../src/pages/activities/detail.vue")
const card = readSource("../src/components/ActivityCard.vue")
const styles = readSource("../src/styles/discovery.css")

describe("activity discovery visual hierarchy", () => {
  it("keeps one clear discovery action and concise service shortcuts on the home page", () => {
    expect(home).toContain('class="home-hero-actions"')
    expect(home).toContain(':src="heroTrip.activity.coverImageUrl"')
    expect(home).toContain('src="/static/images/linan-nature-illustration.jpg"')
    expect(home).toContain('aria-label="山水研学品牌插画"')
    expect(home).toContain('class="button-primary home-activities-entry"')
    expect(home).toContain('class="home-shortcuts"')
  })

  it("labels the school selector while retaining the real filtered-session notice", () => {
    expect(catalog).toContain('class="activity-filter__label"')
    expect(catalog).toContain('v-if="filtered.length === 0"')
  })

  it("gives each card and detail page a readable fact hierarchy without changing their actions", () => {
    expect(card).toContain('class="activity-card__meta"')
    expect(detail).toContain('class="detail-facts"')
    expect(detail).toContain('open-type="share"')
    expect(detail).toContain('@tap="enroll"')
  })

  it("keeps discovery actions at the shared touch-target size", () => {
    expect(styles).toContain('min-height: var(--size-touch-target)')
  })

  it("falls back only for the failed cover URL so a replacement image can load", () => {
    for (const source of [card, detail]) {
      expect(source).toContain('failedCoverUrl !== trip.activity.coverImageUrl')
      expect(source).toContain('@error="failedCoverUrl = trip.activity.coverImageUrl"')
      expect(source).toContain('v-else class="activity-cover activity-cover--empty')
    }
  })
})
