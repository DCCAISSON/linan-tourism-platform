<template>
  <section class="configuration-card" :class="{ 'configuration-card--wide': wide }" :aria-labelledby="titleId">
    <div class="configuration-card__heading">
      <h3 :id="titleId">{{ title }}</h3>
      <span>{{ count }} 条</span>
    </div>
    <slot name="form" />
    <p v-if="loading" class="state-text">正在加载{{ title }}...</p>
    <p v-else-if="error" class="state-text state-text--error">{{ error }}</p>
    <p v-else-if="count === 0" class="state-text">{{ emptyText }}</p>
    <slot v-else />
  </section>
</template>

<script setup lang="ts">
defineProps<{
  readonly count: number
  readonly emptyText: string
  readonly error: string
  readonly loading: boolean
  readonly title: string
  readonly titleId: string
  readonly wide?: boolean
}>()
</script>
