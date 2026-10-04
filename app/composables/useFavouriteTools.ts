/**
 * The tools the signed-in person has starred (dashboard Favourite tools widget,
 * and the stars on the launcher). Shared state, so a star clicked in one place
 * shows in the other at once.
 */
export function useFavouriteTools() {
  const ids = useState<string[]>('favourite-tool-ids', () => [])
  const toast = useToast()

  async function load() {
    try {
      ids.value = await useApiFetch<string[]>('/api/dashboard/favourites')
    } catch {
      ids.value = []
    }
  }

  function isFavourite(toolId: string) {
    return ids.value.includes(toolId)
  }

  async function toggle(toolId: string) {
    const was = isFavourite(toolId)
    const before = ids.value
    ids.value = was ? before.filter(id => id !== toolId) : [...before, toolId]
    try {
      await useApiFetch(`/api/dashboard/favourites/${encodeURIComponent(toolId)}`, { method: was ? 'DELETE' : 'PUT' })
    } catch (err) {
      ids.value = before
      toast.add({ title: 'Could not change your favourites', description: errorText(err), color: 'error' })
    }
  }

  return { ids, load, isFavourite, toggle }
}
