<script setup lang="ts">
defineProps<{ readonly name: "home" | "activities" | "orders" | "people" | "travel" }>()
</script>
<template><image class="functional-icon" :src="`/static/icons/${name}-active.png`" mode="aspectFit" aria-hidden="true" /></template>
<style scoped>
.functional-icon { display: inline-block; flex-shrink: 0; width: var(--size-functional-icon); height: var(--size-functional-icon); vertical-align: middle; }
</style>
