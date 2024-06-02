import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// https://vitejs.dev/config/
const __dirname = path.dirname('.');

export default defineConfig({
  plugins: [
    vue()
    , vueJsx()
    , AutoImport({
      resolvers: [ElementPlusResolver()],
    })
    , Components({
      resolvers: [ElementPlusResolver()],
    })],
  resolve: {
    // alias: {
    //   '@lib': path.resolve(__dirname, 'lib'),
    // }
  },
  server: {
    port: 8081,
    open: "/",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, '')
      }
    }
  }
})
