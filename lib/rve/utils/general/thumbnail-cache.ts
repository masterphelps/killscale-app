/**
 * Thumbnail Sprite Cache (Video Blob URL in, sprite out)
 *
 * API:
 *   const { blob, rectForTime } = await getOrCreateThumbnailSprite(
 *     key,            // string: your cache key (must incorporate params you care about)
 *     videoUrl,       // string: blob URL
 *     10,             // number: interval seconds between thumbnails
 *     90              // number: tile height in px (width auto-computed from aspect)
 *   );
 *
 *   // later, given a playback timestamp (in seconds):
 *   const { x, y, width, height } = rectForTime(123.4);
 *
 * Notes:
 * - Cache key MUST reflect interval/height/video if you want distinct sprites cached.
 * - Designed for browser runtime; dynamic import avoids SSR pitfalls.
 *
 * DPI invariance:
 * - This version renders frames and paints the sprite at CSS-pixel resolution only (no devicePixelRatio scaling).
 * - That keeps the sprite’s intrinsic pixel grid aligned with the logical tile grid, so rects match regardless of OS scaling.
 */

import { EncodedPacketSink, InputVideoTrack } from "mediabunny";
import { IndexedDBCache, CacheRecord } from "./indexed-db-cache";
type MediabunnyNS = typeof import("mediabunny");

// This is a safety net to prevent the cache from growing too large and we should log if we're hitting it.
const MAX_TILES = 2000;

export interface ThumbnailRect {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

const DB_NAME = "VideoEditorThumbnailCacheDB";
const DB_VERSION = 4;
const STORE = "thumbnailCache";

interface SpriteRecord extends CacheRecord {
  blob: Blob;        // sprite sheet image
  meta: {
    // geometry (CSS pixels; DPR-invariant)
    tileWidth: number;
    tileHeight: number;
    cols: number;
    rows: number;
    tileCount: number;

    // timing
    intervalSec: number;
    firstTimestampSec: number; // anchor used for rectForTime mapping
    durationSec: number;

    // bookkeeping
    format: "image/png" | "image/jpeg";
    sourceHash?: string; // optional: if you want to track source identity
  };
}

// Initialize the cache instance
const thumbnailCache = new IndexedDBCache<SpriteRecord>({
  dbName: DB_NAME,
  storeName: STORE,
  version: DB_VERSION
});

const buildTimestamps = async (
  videoTrack: InputVideoTrack,
  firstTimestamp: number,
  durationSec: number,
  intervalSec: number
): Promise<number[]> => {
  // Get all keyframe timestamps
  const pktSink = new EncodedPacketSink(videoTrack);
  let keyPkt = await pktSink.getKeyPacket(firstTimestamp, { verifyKeyPackets: true });
  const keyframeTimestamps: number[] = [];
  let totalInterval = 0;
  let prevTimestamp: number | null = null;

  while (keyPkt) {
    keyframeTimestamps.push(keyPkt.timestamp); // seconds
    
    // Calculate interval as we go
    if (prevTimestamp !== null) {
      totalInterval += keyPkt.timestamp - prevTimestamp;
    }
    prevTimestamp = keyPkt.timestamp;
    
    keyPkt = await pktSink.getNextKeyPacket(keyPkt, { verifyKeyPackets: true });
  }

  // Check keyframe rate and fallback to interval-based sampling if it's too high
  if (keyframeTimestamps.length > 0) {
    const keyframeCount = keyframeTimestamps.length;
    const avgKeyframeInterval = totalInterval / (keyframeCount - 1);
    const keyframeRate = 1 / avgKeyframeInterval; // keyframes per second
    
    console.log(`[ThumbnailCache] Keyframe analysis - Video Duration: ${durationSec.toFixed(2)}s, Keyframes: (count: ${keyframeCount}, interval: ${avgKeyframeInterval.toFixed(3)}s, rate: ${keyframeRate.toFixed(2)} keyframes/sec), intervalSec: ${intervalSec}s`);

    // If the keyframe rate is much higher than the interval we want to use then fallback to interval-based sampling
    if (keyframeCount < 2 ||avgKeyframeInterval > intervalSec * 2) {
      console.log(`[ThumbnailCache] Keyframe rate is much higher than the interval we want to use, falling back to interval-based sampling`);
      keyframeTimestamps.splice(0, keyframeTimestamps.length);
    }
  } else {
    console.log(`[ThumbnailCache] No keyframes found in media, falling back to interval-based sampling`);
  }

  const total = Math.max(1, Math.floor(durationSec / intervalSec) + 1);
  const count = Math.min(total, MAX_TILES);
  if (total > MAX_TILES) {
    console.warn(
      `[ThumbnailCache] Warning: maxTiles exceeded total: ${total}, maxTiles: ${MAX_TILES}`
    );
  }

  // If no keyframes found, fall back to original behavior
  if (keyframeTimestamps.length === 0) {
    const timestamps: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = firstTimestamp + Math.min(durationSec, i * intervalSec);
      // keep a bit of precision
      timestamps.push(Math.round(t * 1000) / 1000);
    }
    return timestamps;
  }

  // Calculate target timestamps based on interval
  const targetTimestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = firstTimestamp + Math.min(durationSec, i * intervalSec);
    targetTimestamps.push(t);
  }

  // Find first keyframe at or after each target timestamp
  const timestamps: number[] = [];
  for (const target of targetTimestamps) {
    // Find first keyframe at or after the target timestamp
    const keyframeAtOrAfter = keyframeTimestamps.find((keyframe) => keyframe >= target);

    if (keyframeAtOrAfter !== undefined) {
      timestamps.push(keyframeAtOrAfter);
    } else {
      // If no keyframe at or after target, use the last keyframe
      const lastKeyframe = keyframeTimestamps[keyframeTimestamps.length - 1];
      timestamps.push(lastKeyframe);
    }
  }

  return timestamps;
};

const paintSprite = async (
  tiles: HTMLCanvasElement[],
  tileWidth: number,
  tileHeight: number
): Promise<{ blob: Blob; cols: number; rows: number }> => {
  const count = Math.max(1, tiles.length);
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));

  // DPR-INVARIANT: output canvas intrinsic size == CSS size (no devicePixelRatio scaling)
  const outW = cols * tileWidth;   // CSS pixels
  const outH = rows * tileHeight;  // CSS pixels

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  // style width/height optional; intrinsic size already matches logical grid

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");

  tiles.forEach((tile, i) => {
    const x = (i % cols) * tileWidth;
    const y = Math.floor(i / cols) * tileHeight;
    // Draw 1:1 in CSS space. Tiles are rendered at tileWidth x tileHeight.
    ctx.drawImage(tile, 0, 0, tileWidth, tileHeight, x, y, tileWidth, tileHeight);
  });

  const format: "image/png" | "image/jpeg" = "image/png";
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), format);
  });

  return { blob, cols, rows };
};

/**
 * Internal: generate sprite + metadata from a Blob using Mediabunny.
 * Computes tileWidth from the video aspect based on `tileHeight`.
 *
 * DPR-INVARIANT: frames are rendered at CSS pixels (no devicePixelRatio multiplier).
 */
const makeSpriteWithMediabunny = async (
  videoBlob: Blob,
  intervalSec: number,
  tileHeight: number
): Promise<{
  blob: Blob;
  meta: SpriteRecord["meta"];
}> => {
  const mediabunny: MediabunnyNS = await import("mediabunny");

  const input = new mediabunny.Input({
    source: new mediabunny.BlobSource(videoBlob),
    formats: mediabunny.ALL_FORMATS,
  });

  try {
    const v = await input.getPrimaryVideoTrack();
    if (!v) throw new Error("No video track found");
    if (v.codec === null) throw new Error("Unsupported video codec");
    if (!(await v.canDecode())) throw new Error("Unable to decode video");

    const firstTimestamp = await v.getFirstTimestamp(); // seconds
    const duration = await v.computeDuration(); // seconds

    console.log(`[ThumbnailCache] firstTimestampSec: ${firstTimestamp}`);
    
    const timestamps = await buildTimestamps(v, firstTimestamp, duration, intervalSec);

    // Compute width from aspect using *display* dimensions
    const aspect = v.displayWidth / v.displayHeight || 1;
    const tileWidth = Math.max(1, Math.round(tileHeight * aspect));

    // DPR-INVARIANT: render frames at CSS pixel resolution
    const renderW = tileWidth;
    const renderH = tileHeight;

    const sink = new mediabunny.CanvasSink(v, {
      width: renderW,
      height: renderH,
      fit: "fill",
    });

    const tiles: HTMLCanvasElement[] = [];
    for await (const frame of sink.canvasesAtTimestamps(timestamps)) {
      if (!frame) continue;
      tiles.push(frame.canvas as HTMLCanvasElement);
    }

    const tileCount = tiles.length || 1;
    const { blob, cols, rows } = await paintSprite(tiles, tileWidth, tileHeight);

    const meta: SpriteRecord["meta"] = {
      tileWidth,
      tileHeight,
      cols,
      rows,
      tileCount,
      intervalSec,
      firstTimestampSec: firstTimestamp,
      durationSec: duration,
      format: "image/png",
    };

    return { blob, meta };
  } finally {
    try {
      (input as any)?.dispose?.();
    } catch {
      /* noop */
    }
  }
};

/**
 * Build a stable rect function from metadata.
 * Returns sprite-space coordinates for a given playback timestamp (seconds).
 * Coordinates are in CSS pixels and match the sprite's intrinsic pixels (DPR-invariant).
 */
function buildRectForTime(meta: SpriteRecord["meta"]): (timestampSec: number) => ThumbnailRect {
  const { tileWidth, tileHeight, cols, tileCount, intervalSec, firstTimestampSec } = meta;

  return function rectForTime(timestampSec: number): ThumbnailRect {
    if (!Number.isFinite(timestampSec)) {
      timestampSec = firstTimestampSec;
    }
    const rel = timestampSec;// - firstTimestampSec;
    const rawIndex = Math.floor(rel / intervalSec);
    const clamped = Math.max(0, Math.min(tileCount - 1, rawIndex));

    const col = clamped % cols;
    const row = Math.floor(clamped / cols);

    return {
      x: col * tileWidth,
      y: row * tileHeight,
      width: tileWidth,
      height: tileHeight,
      index: clamped, // handy for debugging/hover
    };
  };
}

// Track ongoing requests to prevent duplicate work
const ongoingRequests = new Map<
  string,
  Promise<{ blob: Blob; rectForTime: (timestampSec: number) => ThumbnailRect }>
>();

/**
 * PUBLIC API
 * Returns a sprite Blob and a function that maps timestamps -> sprite rects.
 * Handles concurrent requests by returning the same promise for identical parameters.
 *
 * DPI behavior:
 * - Sprites are rendered and laid out in CSS pixels only, so results are stable across Windows scaling settings.
 */
export async function getOrCreateThumbnailSprite(
  key: string,
  videoUrl: string,
  intervalSec: number,
  tileHeight: number
): Promise<{ blob: Blob; rectForTime: (timestampSec: number) => ThumbnailRect }> {
  if (typeof window === "undefined") {
    throw new Error("getOrCreateThumbnailSprite must run in the browser");
  }

  // Check if we're already generating this sprite
  if (ongoingRequests.has(key)) {
    console.log(`[ThumbnailCache] Reusing ongoing generation for key: ${key}`);
    return ongoingRequests.get(key)!;
  }

  // Create the generation promise
  const generationPromise = (async () => {
    try {
      // Try cache first
      const cached = await thumbnailCache.get(key);
      if (cached?.blob && cached?.meta) {
        const blobSizeMB = (cached.blob.size / (1024 * 1024)).toFixed(2);
        const spriteWidth = cached.meta.cols * cached.meta.tileWidth;
        const spriteHeight = cached.meta.rows * cached.meta.tileHeight;
        console.log(`[ThumbnailCache] Using cached sprite for key: ${key} firstTimestampSec: ${cached.meta.firstTimestampSec} dimensions: ${spriteWidth}x${spriteHeight} size: ${blobSizeMB}MB tileHeight: ${cached.meta.tileHeight}px totalTiles: ${cached.meta.tileCount} interval: ${cached.meta.intervalSec}s`);
        const rectForTime = buildRectForTime(cached.meta);
        return { blob: cached.blob, rectForTime };
      }

      const startTime = performance.now();
      console.log(
        `[ThumbnailCache] Generating new sprite for key: ${key}, interval: ${intervalSec}s, height: ${tileHeight}px`
      );

      // Fetch the video Blob from the blob URL
      const response = await fetch(videoUrl);
      if (!response.ok) throw new Error(`Failed to fetch video blob: ${response.statusText}`);
      const videoBlob = await response.blob();

      // Generate sprite
      const { blob, meta } = await makeSpriteWithMediabunny(videoBlob, intervalSec, tileHeight);

      // Best-effort cache
      try {
        await thumbnailCache.put({
          id: key,
          blob,
          meta,
        });
        const blobSizeMB = (blob.size / (1024 * 1024)).toFixed(2);
        const spriteWidth = meta.cols * meta.tileWidth;
        const spriteHeight = meta.rows * meta.tileHeight;
        console.log(`[ThumbnailCache] Successfully cached sprite for key: ${key} firstTimestampSec: ${meta.firstTimestampSec} dimensions: ${spriteWidth}x${spriteHeight} size: ${blobSizeMB}MB tileHeight: ${meta.tileHeight}px totalTiles: ${meta.tileCount} interval: ${meta.intervalSec}s`);
      } catch (e) {
        console.warn("Failed to cache sprite in IndexedDB:", e);
      }

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      const rectForTime = buildRectForTime(meta);
      console.log(
        `[ThumbnailCache] Completed sprite generation for key: ${key}, tiles: ${meta.tileCount}, duration: ${duration}ms`
      );
      return { blob, rectForTime };
    } finally {
      // Clean up the ongoing request when done
      ongoingRequests.delete(key);
    }
  })();

  // Store the promise for concurrent requests
  ongoingRequests.set(key, generationPromise);

  return generationPromise;
}
