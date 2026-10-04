<script setup lang="ts">
const props = defineProps<{ readonly orderId?: string; readonly authorizationId?: string }>()
function open(): void {
  const query = props.orderId ? `?orderId=${encodeURIComponent(props.orderId)}` : props.authorizationId ? `?authorizationId=${encodeURIComponent(props.authorizationId)}` : ""
  uni.navigateTo({ url: `/pages/trip-contact/index${query}` })
}
</script>
<template><button class="button-secondary action-gap" @tap="open">行程管家与公众号</button></template>
