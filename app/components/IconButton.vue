<script setup lang="ts">
import type { ButtonVariants } from '@/components/ui/button'
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ label: string; variant?: ButtonVariants['variant'] }>(), { variant: 'ghost' })
</script>

<template>
  <Tooltip><TooltipTrigger as-child><Button v-bind="$attrs" :variant="variant" size="icon" :aria-label="label"><slot /></Button></TooltipTrigger><TooltipContent>{{ label }}</TooltipContent></Tooltip>
</template>
