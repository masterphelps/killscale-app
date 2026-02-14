-- Index for fast video job count per canvas (used by video-canvas list endpoint)
CREATE INDEX IF NOT EXISTS idx_video_generation_jobs_canvas_status
  ON video_generation_jobs (canvas_id, status)
  WHERE canvas_id IS NOT NULL;
