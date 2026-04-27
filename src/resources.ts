export interface LoadImageOptions {
  timeout?: number;
  crossOrigin?: '' | 'anonymous' | 'use-credentials';
  referrerPolicy?: ReferrerPolicy;
  fetchPriority?: 'high' | 'low' | 'auto';
}

export interface PreloadImageOptions extends LoadImageOptions {
  imagesrcset?: string;
  imagesizes?: string;
  type?: string;
  id?: string;
}

export interface ResourceHintOptions {
  id?: string;
}

export interface PreconnectOptions extends ResourceHintOptions {
  crossOrigin?: boolean | string;
}

function canUseDOM(): boolean {
  return typeof document !== 'undefined' && Boolean(document.head);
}

function toAbsoluteHref(href: string): string {
  if (!canUseDOM()) {
    return href;
  }

  try {
    return new URL(href, document.baseURI).href;
  } catch {
    return href;
  }
}

function findExistingLink(
  rel: string,
  href: string,
  id?: string
): HTMLLinkElement | null {
  if (!canUseDOM()) {
    return null;
  }

  if (id) {
    const element = document.getElementById(id);

    if (element instanceof HTMLLinkElement) {
      return element;
    }
  }

  const normalizedHref = toAbsoluteHref(href);
  const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link'));

  return (
    links.find((link) => {
      return link.rel === rel && toAbsoluteHref(link.getAttribute('href') ?? '') === normalizedHref;
    }) ?? null
  );
}

function applyFetchPriority(
  element: HTMLImageElement | HTMLLinkElement,
  fetchPriority: LoadImageOptions['fetchPriority']
): void {
  if (!fetchPriority) {
    return;
  }

  element.setAttribute('fetchpriority', fetchPriority);
  (element as HTMLImageElement & { fetchPriority?: string }).fetchPriority =
    fetchPriority;
}

function applyCrossOrigin(
  element: HTMLImageElement | HTMLLinkElement,
  crossOrigin: LoadImageOptions['crossOrigin'] | PreconnectOptions['crossOrigin']
): void {
  if (crossOrigin === undefined || crossOrigin === false) {
    return;
  }

  if (crossOrigin === true) {
    element.crossOrigin = 'anonymous';
    return;
  }

  element.crossOrigin = crossOrigin;
}

function appendLink(rel: string, href: string, id?: string): HTMLLinkElement | null {
  if (!canUseDOM()) {
    return null;
  }

  const existing = findExistingLink(rel, href, id);

  if (existing) {
    return existing;
  }

  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;

  if (id) {
    link.id = id;
  }

  document.head.appendChild(link);
  return link;
}

export function loadImage(
  src: string,
  options: LoadImageOptions = {}
): Promise<HTMLImageElement> {
  if (typeof Image === 'undefined') {
    return Promise.reject(
      new Error('loadImage can only be used in a browser-like environment.')
    );
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      image.onload = null;
      image.onerror = null;

      if (timer) {
        clearTimeout(timer);
      }
    };

    image.onload = (): void => {
      cleanup();
      resolve(image);
    };

    image.onerror = (): void => {
      cleanup();
      reject(new Error(`Failed to load image: ${src}`));
    };

    if (options.timeout && options.timeout > 0) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Image load timed out after ${options.timeout}ms: ${src}`));
      }, options.timeout);
    }

    if (options.crossOrigin !== undefined) {
      applyCrossOrigin(image, options.crossOrigin);
    }

    if (options.referrerPolicy) {
      image.referrerPolicy = options.referrerPolicy;
    }

    applyFetchPriority(image, options.fetchPriority);
    image.src = src;
  });
}

export function preloadImage(
  src: string,
  options: PreloadImageOptions = {}
): HTMLLinkElement | null {
  const link = appendLink('preload', src, options.id);

  if (!link) {
    return null;
  }

  link.as = 'image';

  if (options.type) {
    link.type = options.type;
  }

  if (options.imagesrcset) {
    link.setAttribute('imagesrcset', options.imagesrcset);
  }

  if (options.imagesizes) {
    link.setAttribute('imagesizes', options.imagesizes);
  }

  if (options.crossOrigin !== undefined) {
    applyCrossOrigin(link, options.crossOrigin);
  }

  if (options.referrerPolicy) {
    link.referrerPolicy = options.referrerPolicy;
  }

  applyFetchPriority(link, options.fetchPriority);
  return link;
}

export function preconnect(
  href: string,
  options: PreconnectOptions = {}
): HTMLLinkElement | null {
  const link = appendLink('preconnect', href, options.id);

  if (!link) {
    return null;
  }

  applyCrossOrigin(link, options.crossOrigin);
  return link;
}

export function dnsPrefetch(
  href: string,
  options: ResourceHintOptions = {}
): HTMLLinkElement | null {
  return appendLink('dns-prefetch', href, options.id);
}
