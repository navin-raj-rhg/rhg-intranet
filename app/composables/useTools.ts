export interface Tool {
  id: string
  name: string
  description: string | null
  icon: string | null
  route: string
  enabled: boolean
  createdAt: string
}

/**
 * Fetches the tools the current user can see (owner sees all enabled tools;
 * everyone else sees only tools they have a role in - see
 * server/api/tools/index.get.ts for the filtering logic).
 */
export function useTools() {
  return useApiFetch<Tool[]>('/api/tools')
}