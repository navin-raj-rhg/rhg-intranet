<script setup lang="ts">
import type { ProjectsMyRoleResponse } from '~~/shared/types/projects'

const route = useRoute()
const projectId = Number(route.params.id)

const { data: role, error } = await useAsyncData('projects-my-role', () =>
  useApiFetch<ProjectsMyRoleResponse>('/api/tools/projects/my-role')
)
</script>

<template>
  <UContainer class="py-10">
    <UButton
      to="/tools/projects"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      label="Back to Projects"
      class="-ml-2 mb-2"
    />

    <UAlert
      v-if="error || !Number.isInteger(projectId) || projectId <= 0"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't open this page"
      description="You may not have access to Projects yet - ask the workspace owner to assign you a role."
    />
    <div
      v-else-if="role"
      class="mt-6"
    >
      <ProjectsProjectView
        :project-id="projectId"
        :is-admin="role.isAdmin"
      />
    </div>
  </UContainer>
</template>
