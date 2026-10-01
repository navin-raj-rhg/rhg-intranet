<script setup lang="ts">
import type { InspectionTemplateResponse } from '~~/shared/types/inspection'
import { INSPECTION_NAME_MAX, inspectionTemplateProblems } from '~~/shared/utils/inspectionRules'

/**
 * Form builder for a report template (Step 12.7, admins only). A template is a
 * list of named sections, each with inspection points. Every point gets the
 * same answer controls when an inspector uses it (Compliant / Non-Conformance /
 * N/A, a comment and photos), so only the wording is set here.
 */

const props = defineProps<{ templateId: number | null }>()

const toast = useToast()

interface PointForm { key: number, text: string }
interface SectionForm { key: number, name: string, points: PointForm[] }

let nextKey = 1
const blankPoint = (): PointForm => ({ key: nextKey++, text: '' })
const blankSection = (): SectionForm => ({ key: nextKey++, name: '', points: [blankPoint()] })

const name = ref('')
const active = ref(true)
const sections = ref<SectionForm[]>([blankSection()])
const saving = ref(false)
const showProblems = ref(false)

const { data, error } = await useAsyncData(`inspection-template-${props.templateId ?? 'new'}`, () =>
  props.templateId === null
    ? Promise.resolve(null)
    : useApiFetch<InspectionTemplateResponse>(`/api/tools/inspection-reporting/templates/${props.templateId}`)
)

watch(data, (t) => {
  if (!t) return
  name.value = t.name
  active.value = t.active
  sections.value = t.sections.map(s => ({
    key: nextKey++,
    name: s.name,
    points: s.points.map(p => ({ key: nextKey++, text: p.text }))
  }))
}, { immediate: true })

const problems = computed(() =>
  inspectionTemplateProblems(name.value, sections.value.map(s => ({
    name: s.name,
    points: s.points.map(p => ({ text: p.text }))
  }))))

function move<T>(list: T[], index: number, by: -1 | 1) {
  const target = index + by
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item!)
}

function removeSection(index: number) {
  sections.value.splice(index, 1)
}

async function save() {
  if (problems.value.length) {
    showProblems.value = true
    return
  }
  saving.value = true
  try {
    const body = {
      name: name.value,
      active: active.value,
      sections: sections.value.map(s => ({ name: s.name, points: s.points.map(p => ({ text: p.text })) }))
    }
    if (props.templateId === null) {
      await useApiFetch('/api/tools/inspection-reporting/templates', { method: 'POST', body })
    } else {
      await useApiFetch(`/api/tools/inspection-reporting/templates/${props.templateId}`, { method: 'PUT', body })
    }
    toast.add({ title: 'Template saved', color: 'success' })
    await navigateTo('/tools/inspection-reporting?tab=templates')
  } catch (err) {
    toast.add({ title: 'Couldn\'t save the template', description: errorText(err), color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    title="Couldn't load this template"
    :description="errorText(error)"
  />

  <form
    v-else
    class="space-y-6"
    @submit.prevent="save"
  >
    <UCard>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
        <UFormField
          label="Template name"
          class="flex-1"
        >
          <UInput
            v-model="name"
            :maxlength="INSPECTION_NAME_MAX"
            placeholder="e.g. Carton and packaging QC"
            class="w-full"
            data-testid="template-name"
          />
        </UFormField>
        <UFormField label="Available for new reports">
          <USwitch
            v-model="active"
            :label="active ? 'On' : 'Switched off'"
          />
        </UFormField>
      </div>
    </UCard>

    <UCard
      v-for="(s, si) in sections"
      :key="s.key"
      :data-testid="`section-${si}`"
    >
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="s.name"
            :maxlength="INSPECTION_NAME_MAX"
            :placeholder="`Section ${si + 1} name, e.g. Packaging`"
            class="min-w-0 flex-1 font-semibold"
            aria-label="Section name"
            data-testid="section-name"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-up"
            aria-label="Move section up"
            :disabled="si === 0"
            @click="move(sections, si, -1)"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-down"
            aria-label="Move section down"
            :disabled="si === sections.length - 1"
            @click="move(sections, si, 1)"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="error"
            icon="i-lucide-trash-2"
            aria-label="Remove section"
            :disabled="sections.length === 1"
            @click="removeSection(si)"
          />
        </div>
      </template>

      <ol class="space-y-2">
        <li
          v-for="(p, pi) in s.points"
          :key="p.key"
          class="flex items-start gap-2"
        >
          <span class="w-6 pt-2 text-right text-sm text-muted">{{ pi + 1 }}.</span>
          <UTextarea
            v-model="p.text"
            :rows="1"
            autoresize
            maxlength="500"
            placeholder="What the inspector should check"
            class="min-w-0 flex-1"
            aria-label="Inspection point"
            data-testid="point-text"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-up"
            aria-label="Move point up"
            :disabled="pi === 0"
            @click="move(s.points, pi, -1)"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-down"
            aria-label="Move point down"
            :disabled="pi === s.points.length - 1"
            @click="move(s.points, pi, 1)"
          />
          <UButton
            size="sm"
            variant="ghost"
            color="error"
            icon="i-lucide-x"
            aria-label="Remove point"
            :disabled="s.points.length === 1"
            @click="s.points.splice(pi, 1)"
          />
        </li>
      </ol>

      <UButton
        class="mt-3"
        size="sm"
        variant="outline"
        color="neutral"
        icon="i-lucide-plus"
        label="Add inspection point"
        @click="s.points.push(blankPoint())"
      />
    </UCard>

    <UButton
      variant="outline"
      color="neutral"
      icon="i-lucide-plus"
      label="Add section"
      @click="sections.push(blankSection())"
    />

    <p class="text-sm text-muted">
      Each inspection point gets a Compliant / Non-Conformance / N/A choice, a comment box and photos when an inspector uses the template.
    </p>

    <UAlert
      v-if="showProblems && problems.length"
      color="warning"
      variant="subtle"
      title="Fix these before saving"
    >
      <template #description>
        <ul class="list-disc pl-5">
          <li
            v-for="p in problems"
            :key="p"
          >
            {{ p }}
          </li>
        </ul>
      </template>
    </UAlert>

    <div class="flex flex-wrap gap-3">
      <UButton
        type="submit"
        icon="i-lucide-save"
        label="Save template"
        :loading="saving"
        data-testid="save-template"
      />
      <UButton
        to="/tools/inspection-reporting?tab=templates"
        variant="ghost"
        color="neutral"
        label="Cancel"
      />
    </div>
  </form>
</template>
