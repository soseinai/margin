import type { EditorView } from '@codemirror/view';

import {
	isMarkdownMermaidFenceLanguage,
	markdownFenceContent
} from '../markdown-code-fences';
import type {
	PartialMarkdownTextModel,
	SourceBlock
} from '../partial-markdown-text';

type MermaidRenderer = typeof import('mermaid').default;

type MermaidRenderOptions = {
	view?: EditorView;
	onGeometryChange?: () => void
};

let configuredMermaidThemeKey = '';
let loadingMermaid: Promise<MermaidRenderer> | null = null;
let mermaidRenderSequence = 0;

export function isMermaidSourceBlock(block: SourceBlock) {
	return block.kind === 'fenced-code' && isMarkdownMermaidFenceLanguage(block.language ?? '');
}

export function markdownMermaidBlockSource(model: PartialMarkdownTextModel, block: SourceBlock) {
	return markdownFenceContent(model.lines, block);
}

export async function renderMermaidIntoElement(
	element: HTMLElement,
	source: string,
	options: MermaidRenderOptions = {}
) {
	const wrapper = element.closest<HTMLElement>('.markdown-mermaid-widget, .print-mermaid-chart');
	const trimmedSource = source.trim();

	if (!trimmedSource) {
		element.textContent = 'Empty Mermaid chart';
		wrapper?.classList.add('is-error');
		return;
	}

	try {
		const renderer = await loadMermaid();

		configureMermaidForCurrentTheme(renderer);

		const renderId = `margin-mermaid-${++mermaidRenderSequence}`;
		const result = await renderer.render(renderId, trimmedSource);

		if (!element.isConnected) return;

		element.innerHTML = result.svg;
		result.bindFunctions?.(element);
		wrapper?.classList.remove('is-error');
		wrapper?.classList.add('is-rendered');
	} catch(err) {
		if (!element.isConnected) return;

		const message = err instanceof Error ? err.message : 'Unable to render Mermaid chart';

		element.textContent = '';
		element.append(mermaidErrorElement(message, source));
		wrapper?.classList.add('is-error');
		wrapper?.setAttribute('title', message);
	} finally {
		if (!element.isConnected) return;

		options.view?.requestMeasure();
		window.requestAnimationFrame(() => options.onGeometryChange?.());
	}
}

export function resetMermaidTheme() {
	configuredMermaidThemeKey = '';
}

export function mermaidThemeKey() {
	const explicitTheme = document.documentElement.dataset.theme ?? 'auto';
	const systemTheme = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light';

	return `${explicitTheme}:${systemTheme}`;
}

function mermaidErrorElement(message: string, source: string) {
	const error = document.createElement('div');
	const label = document.createElement('p');
	const preview = document.createElement('pre');

	error.className = 'markdown-mermaid-error';
	label.textContent = message;
	preview.textContent = source;
	error.append(label, preview);

	return error;
}

function loadMermaid() {
	loadingMermaid ??= import('mermaid').then((module) => module.default);

	return loadingMermaid;
}

function configureMermaidForCurrentTheme(renderer: MermaidRenderer) {
	const key = mermaidThemeKey();

	if (configuredMermaidThemeKey === key) return;

	renderer.initialize({
		startOnLoad: false,
		securityLevel: 'strict',
		theme: 'base',
		themeVariables: mermaidThemeVariables()
	});
	configuredMermaidThemeKey = key;
}

function mermaidThemeVariables() {
	const paper = resolvedCssColor('var(--paper)', '#ffffff');
	const surface = resolvedCssColor('var(--surface)', '#ffffff');
	const surfaceMuted = resolvedCssColor('var(--surface-muted)', '#f4f4f4');
	const text = resolvedCssColor('var(--fg)', '#111111');
	const textMuted = resolvedCssColor('var(--fg-3)', '#555555');
	const border = resolvedCssColor('var(--border)', '#cfcfcf');

	return {
		background: paper,
		primaryColor: surface,
		primaryTextColor: text,
		primaryBorderColor: border,
		lineColor: textMuted,
		secondaryColor: surfaceMuted,
		tertiaryColor: paper,
		clusterBkg: surfaceMuted,
		clusterBorder: border,
		noteBkgColor: surfaceMuted,
		noteBorderColor: border,
		noteTextColor: text,
		actorBkg: surface,
		actorBorder: border,
		actorTextColor: text,
		signalColor: textMuted,
		signalTextColor: text
	};
}

function resolvedCssColor(value: string, fallback: string) {
	if (!document.body) return fallback;

	const probe = document.createElement('span');

	probe.style.color = value;
	probe.style.left = '-9999px';
	probe.style.pointerEvents = 'none';
	probe.style.position = 'absolute';
	document.body.append(probe);

	const color = getComputedStyle(probe).color;

	probe.remove();

	return color || fallback;
}
