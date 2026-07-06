import { NextResponse } from 'next/server';

/**
 * Health check endpoint for container orchestrators (Railway, Fly.io, Render,
 * ECS, Kubernetes, etc.). Returns 200 while the process is alive and 503 during
 * graceful shutdown.
 *
 * Responds without authentication so load-balancer probes work without tokens.
 */

// Set to true during graceful shutdown so health probes return 503 early,
// causing the load balancer to stop routing new requests before the process exits.
let shuttingDown = false;

export function markShuttingDown() {
  shuttingDown = true;
}

export async function GET() {
  if (shuttingDown) {
    return NextResponse.json(
      { status: 'shutting_down', timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? 'unknown',
    uptime: Math.round(process.uptime()),
    environment: process.env.NODE_ENV ?? 'development',
  });
}
