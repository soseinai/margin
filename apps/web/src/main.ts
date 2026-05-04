import 'katex/dist/katex.min.css';
import './styles.css';
import App from './App.svelte';
import { mount } from 'svelte';
import { initializePartialMarkdownParser } from './lib/partial-markdown-core';

const target = document.getElementById('app') as HTMLElement;
const app = initializePartialMarkdownParser()
  .then(() => mount(App, { target }))
  .catch((error) => {
    console.error(error);
    target.textContent = 'Margin could not start because the Markdown parser failed to load.';
    return null;
  });

export default app;
