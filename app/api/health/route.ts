import { NextResponse } from 'next/server';
import { isShuttingDown } from '@/lib/shutdown-state';

/**
 * Health check endpoint. Returns 200 while alive, 503 during graceful shutdown.
 * No auth — load-balancer probes need this unauthenticated.
 */

export async function GET() {
  if (isShuttingDown()) {
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
