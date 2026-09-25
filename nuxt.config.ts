// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  // Server-only and client-exposed runtime config.
  // Populate the actual values in a local .env file - see .env.example.
  runtimeConfig: {
    // --- Server-only (never exposed to the browser) ---
    supabaseServiceRoleKey: '',
    supabaseDbUrl: '', // direct connection, port 5432 - used for migrations
    supabaseDbPoolUrl: '', // pooled connection, port 6543 - used by the running app
    r2AccountId: '',
    r2AccessKeyId: '',
    r2SecretAccessKey: '',
    r2Bucket: '',

    // --- Public (exposed to the browser, prefix required) ---
    public: {
      supabaseUrl: '',
      supabaseAnonKey: ''
    }
  },

  routeRules: {
    '/': { prerender: false }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
