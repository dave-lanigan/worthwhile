<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <span
    data-slot="badge"
    :class="cn('inline-flex w-fit shrink-0 items-center justify-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground', props.class)"
  >
    <slot />
  </span>
</template>
