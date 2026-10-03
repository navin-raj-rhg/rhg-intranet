<script setup lang="ts">
import type { ProjectsMyRoleResponse } from '~~/shared/types/projects'

const authStore = useAuthStore()

const { data: role, pending, error } = await useAsyncData('projects-my-role', () =>
  useApiFetch<ProjectsMyRoleResponse>('/api/tools/projects/my-role')
)

type TabValue = 'projects' | 'tasks' | 'types'

// Admins also get the master Task list and Project types. ?tab= opens straight on one.
const tabItems = computed<{ label: string, value: TabValue }[]>(() => [
  { label: 'Projects', value: 'projects' },
  ...(role.value?.isAdmin
    ? [
        { label: 'Task list', value: 'tasks' as const },
        { label: 'Types & sections', value: 'types' as const }
      ]
    : [])
])

const route = useRoute()
const wanted = route.query.tab
const tab = ref<TabValue>(wanted === 'tasks' || wanted === 'types' ? wanted : 'projects')
const shownTab = computed<TabValue>(() => (tabItems.value.some(t => t.value === tab.value) ? tab.value : 'projects'))

// A type added or renamed on one tab shows up on the other.
const typesChanged = () => refreshNuxtData('projects-template')
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to the dashboard"
      class="-ml-2 mb-2"
    />

    <UPageHeader
      title="Projects"
      description="Product launches and other projects as task lists with dependencies: a task unlocks, and gets its due date, when the tasks it waits for are done."
    >
      <template
        v-if="authStore.profile?.isOwner"
        #links
      >
        <UButton
          to="/tools/projects/access"
          icon="i-lucide-users"
          variant="outline"
          label="Manage access"
        />
      </template>
    </UPageHeader>

    <UAlert
      v-if="error"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't load this tool"
      description="You may not have access to Projects yet - ask the workspace owner to assign you a role."
    />

    <div
      v-else-if="pending"
      class="mt-6 text-sm text-muted"
    >
      Loading…
    </div>

    <template v-else>
      <UTabs
        v-if="tabItems.length > 1"
        v-model="tab"
        class="mt-6"
        :items="tabItems"
        :content="false"
      />

      <!-- v-show, not v-if: switching tabs must not lose what's on the other tab. -->
      <div
        v-show="shownTab === 'projects'"
        class="mt-6"
      >
        <UAlert
          color="info"
          variant="subtle"
          title="Starting and working on projects comes next"
          description="For now, admins can set up the project types and the master task list."
        />
      </div>
      <div
        v-if="role?.isAdmin"
        v-show="shownTab === 'tasks'"
        class="mt-6"
      >
        <ProjectsTemplateAdmin />
      </div>
      <div
        v-if="role?.isAdmin"
        v-show="shownTab === 'types'"
        class="mt-6"
      >
        <div class="space-y-10">
          <section class="space-y-3">
            <h2 class="text-lg font-semibold">
              Sections
            </h2>
            <ProjectsSectionsAdmin @changed="typesChanged" />
          </section>
          <section class="space-y-3">
            <h2 class="text-lg font-semibold">
              Project types
            </h2>
            <ProjectsTypesAdmin @changed="typesChanged" />
          </section>
        </div>
      </div>
    </template>
  </UContainer>
</template>
