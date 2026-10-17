import { mount } from 'svelte';
import favicon from 'demo-kit/favicon.svg?url';
import { initTheme } from 'demo-kit/theme';
import 'demo-kit/site.css';
import App from './App.svelte';

// The stored or system theme lands on <html> before the first render
initTheme();
document.head.append(
  Object.assign(document.createElement('link'), { rel: 'icon', type: 'image/svg+xml', href: favicon }),
);

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
