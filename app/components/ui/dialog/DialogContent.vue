<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { nextTick, onMounted, onUnmounted, ref } from "vue"
import { X } from "@lucide/vue"
import { reactiveOmit } from "@vueuse/core"
import {
  DialogClose,
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"
import DialogOverlay from "./DialogOverlay.vue"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<DialogContentProps & { class?: HTMLAttributes["class"], showCloseButton?: boolean }>(), {
  showCloseButton: true,
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
const viewportStyle = ref<Record<string, string>>({})

function updateViewport() {
  const viewport = window.visualViewport
  viewportStyle.value = {
    '--dialog-viewport-height': `${viewport?.height ?? window.innerHeight}px`,
    '--dialog-viewport-top': `${viewport?.offsetTop ?? 0}px`,
  }
}

function focusOnOpen(event: Event) {
  emits('openAutoFocus', event)
  if (event.defaultPrevented || !window.matchMedia('(max-width: 1023px), (pointer: coarse)').matches) return
  event.preventDefault()
  updateViewport()
  const target = event.target
  nextTick(() => {
    if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true })
  })
}

onMounted(() => {
  updateViewport()
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
  window.addEventListener('resize', updateViewport)
})

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
  window.removeEventListener('resize', updateViewport)
})
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContent
      data-slot="dialog-content"
      v-bind="{ ...$attrs, ...forwarded }"
      :style="viewportStyle"
      @open-auto-focus="focusOnOpen"
      :class="
        cn(
          'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg',
          'responsive-dialog', props.class,
        )"
    >
      <slot />

      <DialogClose
        v-if="showCloseButton"
        data-slot="dialog-close"
        class="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
      >
        <X />
        <span class="sr-only">Close</span>
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>

<style scoped>
.responsive-dialog {
  max-height: calc(var(--dialog-viewport-height, 100dvh) - 32px);
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-block: 20px;
}

@media (max-width: 1023px), (pointer: coarse) {
  .responsive-dialog[data-slot='dialog-content'] {
    top: calc(var(--dialog-viewport-top, 0px) + var(--dialog-viewport-height, 100dvh) - 12px);
    translate: -50% -100%;
    max-height: calc(var(--dialog-viewport-height, 100dvh) - 24px);
    max-width: min(460px, calc(100% - 24px));
    padding: 24px 20px max(20px, env(safe-area-inset-bottom));
    animation: none;
  }

  .responsive-dialog :deep([data-slot='dialog-header']) { text-align: left; padding-right: 32px; }
  .responsive-dialog :deep([data-slot='dialog-close']) { width: 44px; height: 44px; top: 4px; right: 4px; display: grid; place-items: center; }
}
</style>
