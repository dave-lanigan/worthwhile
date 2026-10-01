<script setup lang="ts">
import type { DialogTriggerProps } from "reka-ui"
import { DrawerTrigger } from "vaul-vue"

const props = defineProps<DialogTriggerProps>()
</script>

<template>
  <DrawerTrigger data-slot="drawer-trigger" v-bind="props">
    <slot />
  </DrawerTrigger>
</template>
