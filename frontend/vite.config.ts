// Plugins
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import ViteFonts from 'unplugin-fonts/vite'

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const { PROXY_ZAYCHIK_SERVER_ADDR, ZAYCHIK_CLIENT_PORT } = process.env;

if (!PROXY_ZAYCHIK_SERVER_ADDR || !ZAYCHIK_CLIENT_PORT) {
  console.error("Please specify PROXY_ZAYCHIK_SERVER_ADDR and PROXY_ZAYCHIK_CLIENT_PORT in env var");
  process.exit(1);
}

console.log(`Proxying /api to ${PROXY_ZAYCHIK_SERVER_ADDR}`);
const proxy_config: any = 

console.log(`Listening on ${ZAYCHIK_CLIENT_PORT}`)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: { transformAssetUrls }
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/next/packages/vite-plugin
    vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/settings.scss',
      },
    }),
    ViteFonts({
      google: {
        families: [{
          name: 'Roboto',
          styles: 'wght@100;300;400;500;700;900',
        }],
      },
    }),
  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: parseInt(ZAYCHIK_CLIENT_PORT),
    proxy: {
      '/api': {
        target: PROXY_ZAYCHIK_SERVER_ADDR,
        changeOrigin: true,
        secure: false
      }
    }
  },
})
