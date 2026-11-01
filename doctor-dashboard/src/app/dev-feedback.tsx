'use client';

import { Agentation } from 'agentation';

// Agentation feedback toolbar (dev only). Annotations sync to Claude Code
// through the agentation MCP server on port 4747.
export function DevFeedback() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Agentation endpoint="http://localhost:4747" />;
}
