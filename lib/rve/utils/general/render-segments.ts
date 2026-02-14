import { OverlayMediaSegment } from "../../types";


export type RenderSegment = {
    startFrom: number;      // absolute source frame (inclusive)
    endAt: number;          // absolute source frame (exclusive)
    playbackSpeed: number;  // effective speed (overlay.speed × segment.speed)
    outDuration: number;    // frames on OUTPUT timeline
};

/**
 * Build render segments from absolute source segments (in output order),
 * then trim in OUTPUT space:
 * - Remove the first `startTrimFrames` output frames
 * - Keep at most `durationTrimFrames` output frames afterwards (if provided)
 *
 * Notes:
 * - Trims are applied AFTER speeds (i.e., in the concatenated OUTPUT timeline).
 */
export function buildRenderSegments(
    specs: OverlayMediaSegment[] = [],
    baseSpeed = 1,
    startTrimFrames = 0,
    durationTrimFrames: number | null = null
): RenderSegment[] {
    const safeBase = Math.max(0.001, baseSpeed || 1);

    // Normalize input segments (absolute source frames)
    let segs = specs
        .map((s) => ({
            start: Math.max(0, Math.floor(s.startFrame || 0)),
            end:   Math.max(0, Math.floor(s.endFrame   || 0)),
            speed: Math.max(0.001, Number(s.speed ?? 1) || 1),
        }))
        .filter((s) => s.end > s.start)
        .map((s) => {
            const effSpeed = safeBase * s.speed;
            const inLen = s.end - s.start;
            const outLen = Math.max(1, Math.round(inLen / effSpeed));
            return {
                startFrom: s.start,
                endAt: s.end,
                playbackSpeed: effSpeed,
                outDuration: outLen,
            } as RenderSegment;
        });

    if (segs.length === 0) return segs;

    // ---- 1) Apply START trim in OUTPUT space
    let trimFront = Math.max(0, Math.floor(startTrimFrames || 0));
    let i = 0;
    while (i < segs.length && trimFront > 0) {
        const s = segs[i];
        if (trimFront >= s.outDuration) {
            trimFront -= s.outDuration;
            i++;
            continue;
        }
        // Trim inside this segment: skip 'trimFront' output frames
        const srcSkip = Math.round(trimFront * s.playbackSpeed);
        const newStart = Math.min(s.endAt, s.startFrom + srcSkip);
        const newInLen = Math.max(0, s.endAt - newStart);
        const newOutLen = Math.max(1, Math.round(newInLen / s.playbackSpeed));
        segs[i] = {
            startFrom: newStart,
            endAt: s.endAt,
            playbackSpeed: s.playbackSpeed,
            outDuration: newOutLen,
        };
        trimFront = 0;
        break;
    }
    segs = segs.slice(i);
    if (segs.length === 0) return [];

    // ---- 2) Apply DURATION cap in OUTPUT space (optional)
    if (durationTrimFrames != null) {
        let remaining = Math.max(0, Math.floor(durationTrimFrames || 0));
        const capped: RenderSegment[] = [];
        for (const s of segs) {
            if (remaining <= 0) break;
            if (s.outDuration <= remaining) {
                capped.push(s);
                remaining -= s.outDuration;
            } else {
                // Truncate this segment to 'remaining' output frames
                const srcKeep = Math.round(remaining * s.playbackSpeed);
                const newEnd = Math.min(s.endAt, s.startFrom + srcKeep);
                const newInLen = Math.max(0, newEnd - s.startFrom);
                const newOutLen = Math.max(1, Math.round(newInLen / s.playbackSpeed));
                capped.push({
                    startFrom: s.startFrom,
                    endAt: newEnd,
                    playbackSpeed: s.playbackSpeed,
                    outDuration: newOutLen,
                });
                remaining = 0;
            }
        }
        segs = capped;
    }

    return segs;
}

export function totalOutDuration(segments: RenderSegment[]): number {
    return segments.reduce((a, s) => a + s.outDuration, 0);
}

/**
 * Find the underlying frame from the media which should show for the current outputFrame based on the current
 * segments that we should be using
 *
 * If the output frame is beyond the current total duration, this returns the last source frame.
 *
 * @param segments
 * @param outputFrame
 */
export function sourceFrameAtOutputFrame(
    segments: OverlayMediaSegment[],
    outputFrame: number
): number {
    // If no segments then there is no modifications so sourceFrame is the outputFrame
    if (!segments.length) return outputFrame;

    const targetFrame = Math.floor(Math.max(0, outputFrame));

    let cumulative = 0;
    for (const seg of segments) {
        const speed = seg.speed ?? 1;
        const inLen = seg.endFrame - seg.startFrame;
        const outDuration = Math.max(1, Math.round(inLen / speed));
        const nextCumulative = cumulative + outDuration;
        
        if (targetFrame < nextCumulative) {
            const offsetOut = targetFrame - cumulative;
            let srcOffset = Math.round(offsetOut * speed);
            if (srcOffset >= inLen) srcOffset = inLen - 1;
            return seg.startFrame + Math.max(0, srcOffset);
        }
        cumulative = nextCumulative;
    }

    const last = segments[segments.length - 1];
    return Math.max(last.startFrame, last.endFrame - 1);
}