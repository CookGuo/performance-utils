import { useEffect, useMemo, useState } from 'react';
import { loadImage } from './resources';

export interface UseGifImgOptions {
  src: string;
  thumbnailUrl?: string;
  enabled?: boolean;
}

export interface UseGifImgResult {
  isGif: boolean;
  displayUrl: string;
  loaded: boolean;
  error: boolean;
}

function isGifUrl(src: string): boolean {
  return /\.gif(?:[?#].*)?$/i.test(src);
}

export function useGifImg(options: UseGifImgOptions): UseGifImgResult {
  const { src, thumbnailUrl, enabled = true } = options;
  const isGif = useMemo(() => isGifUrl(src), [src]);
  const shouldLoadGif = enabled && isGif && Boolean(thumbnailUrl);
  const initialDisplayUrl = shouldLoadGif ? thumbnailUrl ?? src : src;
  const [displayUrl, setDisplayUrl] = useState(initialDisplayUrl);
  const [loaded, setLoaded] = useState(!shouldLoadGif);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const nextDisplayUrl = shouldLoadGif ? thumbnailUrl ?? src : src;

    setDisplayUrl(nextDisplayUrl);
    setLoaded(!shouldLoadGif);
    setError(false);

    if (!shouldLoadGif) {
      return () => {
        cancelled = true;
      };
    }

    loadImage(src)
      .then(() => {
        if (cancelled) {
          return;
        }

        setDisplayUrl(src);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [src, thumbnailUrl, shouldLoadGif]);

  return {
    isGif,
    displayUrl,
    loaded,
    error,
  };
}
