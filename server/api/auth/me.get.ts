export default defineEventHandler(async (event) => {
  return requireProfile(event)
})
