import { createApp } from 'vue';
import favicon from 'demo-kit/favicon.svg?url';
import { initTheme } from 'demo-kit/theme';
import 'demo-kit/site.css';
import App from './App.vue';

// The stored or system theme lands on <html> before the first render
initTheme();
document.head.append(
  Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/svg+xml', href: favicon }),
);

createApp(App).mount('#app');
