import { WidgetType, type EditorView } from '@codemirror/view';

import {
	clampImageResize,
	markdownImageSizeCss,
	markdownImageWithSize,
	type MarkdownImage
} from '../../markdown-images';
import type { MarkdownImageWidgetOptions } from './shared';

const markdownImageBounds = new Map<string, { width: number; height: number }>();
const markdownImageResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

export class MarkdownImageWidget extends WidgetType {
	image: MarkdownImage;
	lineNumber = 1;
	from = 0;
	to = 0;
	block = false;
	key = '';
	options: MarkdownImageWidgetOptions;

	constructor(
		image: MarkdownImage,
		lineNumber: number,
		from: number,
		to: number,
		options: MarkdownImageWidgetOptions,
		block = false
	) {
		super();
		this.image = image;
		this.lineNumber = lineNumber;
		this.from = from;
		this.to = to;
		this.options = options;
		this.block = block;
		this.key = `${JSON.stringify(image)}:${from}:${to}:${block}`;
	}

	eq(other: WidgetType) {
		return other instanceof MarkdownImageWidget && other.lineNumber === this.lineNumber && other.key === this.key;
	}

	toDOM(view: EditorView) {
		const wrapper = document.createElement(this.block ? 'figure' : 'span');
		const image = document.createElement('img');
		const fallback = document.createElement('span');
		const resizeHandle = document.createElement('button');
		const resolvedSrc = this.options.resolveImageSrc(this.image.src);

		wrapper.className = `markdown-image-widget ${this.block ? 'block' : 'inline'}`;
		wrapper.tabIndex = 0;
		wrapper.setAttribute('role', 'button');
		wrapper.setAttribute('aria-label', 'Edit Markdown image');

		image.alt = this.image.alt;
		image.decoding = 'async';
		image.loading = 'lazy';
		image.draggable = false;
		if (this.image.title) image.title = this.image.title;
		applyMarkdownImageSize(image, this.image);

		if (resolvedSrc) {
			image.src = resolvedSrc;
		} else {
			wrapper.classList.add('is-missing');
		}

		fallback.className = 'markdown-image-fallback';
		fallback.textContent = this.image.alt || this.image.src || 'Image';
		resizeHandle.type = 'button';
		resizeHandle.className = 'markdown-image-resize-handle';
		resizeHandle.setAttribute('aria-label', 'Resize image');

		const resizeGrip = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		resizeGrip.classList.add('markdown-image-resize-grip');
		resizeGrip.setAttribute('aria-hidden', 'true');
		resizeGrip.setAttribute('focusable', 'false');
		resizeGrip.setAttribute('viewBox', '0 0 24 24');

		for (const pathData of ['M22 7L7 22', 'M22 13L13 22', 'M22 19L19 22']) {
			const gripLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');

			gripLine.setAttribute('d', pathData);
			resizeGrip.append(gripLine);
		}

		resizeHandle.append(resizeGrip);
		resizeHandle.addEventListener('mousedown', (event) => {
			this.startResize(event, view, image, wrapper);
		});

		wrapper.append(image, fallback, resizeHandle);

		const rememberBounds = () => {
			const rect = image.getBoundingClientRect();

			if (rect.width <= 0 || rect.height <= 0) return;

			markdownImageBounds.set(markdownImageBoundsKey(this.image), {
				width: Math.round(rect.width),
				height: Math.round(rect.height)
			});
		};

		let measureFrame = 0;
		const refreshGeometry = () => {
			if (measureFrame) return;

			measureFrame = window.requestAnimationFrame(() => {
				measureFrame = 0;
				rememberBounds();
				view.requestMeasure();
				window.requestAnimationFrame(() => this.options.onGeometryChange?.());
			});
		};

		image.addEventListener('error', () => {
			wrapper.classList.add('is-missing');
			refreshGeometry();
		});

		image.addEventListener('load', refreshGeometry);
		if (image.complete) refreshGeometry();

		if (typeof ResizeObserver === 'function') {
			const observer = new ResizeObserver(refreshGeometry);

			observer.observe(wrapper);
			observer.observe(image);
			markdownImageResizeObservers.set(wrapper, observer);
		}

		const editImage = (event: Event) => {
			event.preventDefault();

			const line = view.state.doc.line(Math.min(this.lineNumber, view.state.doc.lines));

			view.dispatch({ selection: { anchor: line.from } });
			view.focus();
		};

		wrapper.addEventListener('mousedown', editImage);

		wrapper.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') editImage(event);
		});

		return wrapper;
	}

	startResize(
		event: MouseEvent,
		view: EditorView,
		image: HTMLImageElement,
		wrapper: HTMLElement
	) {
		event.preventDefault();
		event.stopPropagation();

		const rect = image.getBoundingClientRect();

		if (rect.width <= 0 || rect.height <= 0) return;

		const startX = event.clientX;
		const startY = event.clientY;
		const startWidth = rect.width;
		const startHeight = rect.height;
		let nextWidth = Math.round(startWidth);
		let nextHeight = Math.round(startHeight);

		wrapper.classList.add('is-resizing');

		const onMove = (moveEvent: MouseEvent) => {
			moveEvent.preventDefault();

			nextWidth = clampImageResize(startWidth + moveEvent.clientX - startX);
			nextHeight = clampImageResize(startHeight + moveEvent.clientY - startY);
			image.style.width = `${nextWidth}px`;
			image.style.height = `${nextHeight}px`;

			markdownImageBounds.set(markdownImageBoundsKey(this.image), {
				width: nextWidth,
				height: nextHeight
			});
		};

		const onUp = (upEvent: MouseEvent) => {
			upEvent.preventDefault();
			wrapper.classList.remove('is-resizing');
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);

			replaceMarkdownImageSize(view, this.image, this.from, this.to, nextWidth, nextHeight);
		};

		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	}

	ignoreEvent() {
		return false;
	}

	destroy(dom: HTMLElement) {
		markdownImageResizeObservers.get(dom)?.disconnect();
		markdownImageResizeObservers.delete(dom);
	}
}

export function markdownImagePlaceholderAttributes(image: MarkdownImage) {
	const bounds = markdownImageBounds.get(markdownImageBoundsKey(image));

	if (!bounds) return undefined;

	return {
		style: `--markdown-image-placeholder-width: ${bounds.width}px; --markdown-image-placeholder-height: ${bounds.height}px;`
	};
}

function applyMarkdownImageSize(imageElement: HTMLImageElement, image: MarkdownImage) {
	const width = markdownImageSizeCss(image.attrs.width);
	const height = markdownImageSizeCss(image.attrs.height);

	if (width) imageElement.style.width = width;
	if (height) imageElement.style.height = height;
}

function markdownImageBoundsKey(image: MarkdownImage) {
	return image.src;
}

function replaceMarkdownImageSize(
	view: EditorView,
	image: MarkdownImage,
	from: number,
	to: number,
	width: number,
	height: number
) {
	if (from < 0 || to > view.state.doc.length || from >= to) return;

	view.dispatch({
		changes: {
			from,
			to,
			insert: markdownImageWithSize(image, width, height)
		}
	});
}
