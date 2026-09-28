<script setup lang="ts">
import { ArrowLeft, LoaderCircle, Plus, Trash2 } from 'lucide-vue-next'
import { emptyPlan, type PlanProfile, type SavedPlanProfile } from '#shared/schemas/financial-plan'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

const { isSignedIn } = useAuth()
const guest = !isSignedIn.value
const { data: profiles, error: loadError } = await useFetch<PlanProfile[]>('/api/plan-profiles', { key: 'profiles-list', immediate: !guest, watch: false, default: () => [] as PlanProfile[] })

const dialogOpen = ref(false)
const name = ref('')
const description = ref('')
const error = ref('')
const creating = ref(false)
const deleteOpen = ref(false)
const deleting = ref<PlanProfile>()
const removing = ref(false)

function openDialog() {
  name.value = ''
  description.value = ''
  error.value = ''
  dialogOpen.value = true
}

async function create() {
  error.value = ''
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = 'Give this scenario a name.'
    return
  }
  creating.value = true
  try {
    const saved = await $fetch<SavedPlanProfile>('/api/plan-profiles', { method: 'POST', body: { name: trimmed, description: description.value.trim(), plan: emptyPlan() }, retry: 0 })
    profiles.value = [{ id: saved.id, name: saved.name, description: saved.description }, ...(profiles.value ?? [])]
    dialogOpen.value = false
  } catch {
    error.value = 'This scenario could not be saved. Try again.'
  } finally {
    creating.value = false
  }
}

function confirmDelete(profile: PlanProfile) {
  deleting.value = profile
  deleteOpen.value = true
}

async function removeProfile() {
  if (!deleting.value) return
  removing.value = true
  try {
    await $fetch(`/api/plan-profiles/${deleting.value.id}`, { method: 'DELETE', retry: 0 })
    profiles.value = (profiles.value ?? []).filter(profile => profile.id !== deleting.value?.id)
    deleteOpen.value = false
  } catch {
    error.value = 'This scenario could not be deleted. Try again.'
  } finally {
    removing.value = false
  }
}

function activate(id?: string) {
  navigateTo(id ? `/?profile=${id}` : '/')
}
</script>

<template>
  <TooltipProvider>
  <main class="profile-page">
    <header class="profile-header"><NuxtLink to="/" class="brand">worthwhile.</NuxtLink><IconButton as-child label="Back to forecast"><NuxtLink to="/"><ArrowLeft :size="18" /></NuxtLink></IconButton></header>
    <Card class="profiles-card" role="region" aria-labelledby="profiles-title">
      <CardHeader class="profile-card-header">
        <p class="eyebrow">Scenario profiles</p>
        <h1 id="profiles-title">Manage your profiles</h1>
        <CardDescription class="profile-intro">Switch between saved what-if scenarios, or start a new one.</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-if="guest" class="feedback" role="status"><NuxtLink to="/sign-in" class="underline underline-offset-4">Sign in to create scenario profiles.</NuxtLink></div>
        <div v-else-if="loadError" class="feedback error" role="alert">We could not load your profiles. Try again.</div>
        <template v-else>
          <div class="profiles-list">
            <div class="profiles-row">
              <div class="profiles-row-info"><h3>Personal forecast</h3><p>Your default plan.</p></div>
              <div class="profiles-row-actions"><Button variant="outline" size="sm" @click="activate()">Open</Button></div>
            </div>
            <div v-for="profile in profiles" :key="profile.id" class="profiles-row">
              <div class="profiles-row-info"><h3>{{ profile.name }}</h3><p v-if="profile.description">{{ profile.description }}</p></div>
              <div class="profiles-row-actions">
                <Button variant="outline" size="sm" @click="activate(profile.id)">Open</Button>
                <Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" :aria-label="`Delete ${profile.name}`" @click="confirmDelete(profile)"><Trash2 :size="15" /></Button></TooltipTrigger><TooltipContent>Delete {{ profile.name }}</TooltipContent></Tooltip>
              </div>
            </div>
          </div>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <div class="profiles-actions"><IconButton variant="default" label="New scenario" @click="openDialog"><Plus :size="18" /></IconButton></div>
        </template>
      </CardContent>
    </Card>
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="entry-dialog">
        <DialogHeader><DialogTitle>New scenario</DialogTitle><DialogDescription>Start a blank what-if plan you can compare against your personal forecast.</DialogDescription></DialogHeader>
        <form class="entry-form" @submit.prevent="create">
          <div class="field"><Label for="new-profile-name">Name</Label><Input id="new-profile-name" v-model="name" maxlength="60" required autofocus placeholder="e.g. Early retirement at 55" /></div>
          <div class="field"><Label for="new-profile-description">Description</Label><textarea id="new-profile-description" v-model="description" maxlength="180" placeholder="Optional" /></div>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <DialogFooter><Button type="button" variant="outline" @click="dialogOpen = false">Cancel</Button><Button type="submit" :disabled="creating"><LoaderCircle v-if="creating" class="spin" data-icon="inline-start" /><Plus v-else data-icon="inline-start" />Create scenario</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog v-model:open="deleteOpen">
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete {{ deleting?.name }}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the scenario and its entries.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction :disabled="removing" @click="removeProfile"><Trash2 :size="15" />Delete scenario</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>
  </TooltipProvider>
</template>
