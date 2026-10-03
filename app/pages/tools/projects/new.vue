<script setup lang="ts">
import type { ProjectsMyRoleResponse } from '~~/shared/types/projects'

const { error } = await useAsyncData('projects-my-role', () =>
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
    <UPageHeader title="New project" />

    <UAlert
      v-if="error"
      class="mt-6"
      color="error"
      variant="subtle"
      title="Couldn't load this page"
      description="You may not have access to Projects yet - ask the workspace owner to assign you a role."
    />
    <div
      v-else
      class="mt-6"
    >
      <ProjectsNewProjectForm />
    </div>
  </UContainer>
</template>
