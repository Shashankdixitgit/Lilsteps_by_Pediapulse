import { Agentation } from 'agentation';

// Agentation feedback toolbar (dev only, web only). Annotations sync to
// Claude Code through the agentation MCP server on port 4747.
export function DevFeedback() {
  if (!__DEV__) return null;
  return <Agentation endpoint="http://localhost:4747" />;
}
