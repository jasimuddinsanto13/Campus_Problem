import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: false,
    proxy: {
      // Profile API + uploaded media must reach Django (8002) directly: the
      // generic /api rule below targets the FastAPI service, and /media has
      // no other proxy. changeOrigin:false keeps the localhost:8000 Host
      // header so Django builds absolute media URLs the browser can load.
      // Vite matches proxy keys in order — these must come first.
      '/api/profile': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/users': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/routines': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/cr': {
        // Class Representative management — lives in Django (must come before
        // the generic /api rule that targets FastAPI).
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/room-booking': {
        // Faculty / Admin Room booking pages — availability search and
        // extra-class request workflow live in Django (must come before the
        // generic /api rule that targets FastAPI).
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      '/api/notices': {
        // Role-based Notice Board — admin management + faculty/student feeds
        // live in Django (must come before the generic /api rule).
        // changeOrigin:false keeps the localhost:8000 Host header so Django's
        // build_absolute_uri() returns attachment URLs the browser can load
        // through the /media proxy (same reasoning as /api/profile).
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/issues': {
        // Campus Issue Desk — faculty submission/outbox + admin management
        // live in Django (must come before the generic /api rule).
        // changeOrigin:false keeps the localhost:8000 Host header so Django's
        // build_absolute_uri() returns attachment URLs the browser can load
        // through the /media proxy.
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/admin/issues': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/api/meal-query': {
        // Meal Query — hostel meal cancellation requests live in Django.
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/media': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: false,
        secure: false,
      },
      '/static': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      '/accounts': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      '/portal': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      '/issues': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      '/booking': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      // Django's built-in admin lives at /django-admin/ (moved off /admin/
      // so the React admin portal owns /admin/*).
      '/django-admin': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        secure: false,
      },
      // NOTE: no '/admin' proxy — /admin/dashboard & friends are React
      // client-side routes served by Vite's SPA fallback.
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: false,
  },
});
