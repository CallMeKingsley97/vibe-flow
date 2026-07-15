ALTER TABLE capture_sessions ADD COLUMN model TEXT;
ALTER TABLE capture_sessions ADD COLUMN reasoning_effort TEXT;
ALTER TABLE capture_sessions ADD COLUMN input_tokens INTEGER;
ALTER TABLE capture_sessions ADD COLUMN cached_input_tokens INTEGER;
ALTER TABLE capture_sessions ADD COLUMN output_tokens INTEGER;
ALTER TABLE capture_sessions ADD COLUMN reasoning_output_tokens INTEGER;
ALTER TABLE capture_sessions ADD COLUMN total_tokens INTEGER;
