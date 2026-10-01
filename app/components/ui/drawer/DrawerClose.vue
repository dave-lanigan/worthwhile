<script setup lang="ts">
import type { DialogCloseProps } from "reka-ui"
import { DrawerClose } from "vaul-vue"

const props = defineProps<DialogCloseProps>()
</script>

<template>
  <DrawerClose data-slot="drawer-close" v-bind="props">
    <slot />
  </DrawerClose>
</template>
