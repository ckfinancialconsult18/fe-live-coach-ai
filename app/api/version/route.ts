import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: process.env.npm_package_version ?? 'unknown',
    node: process.version,
    environment: process.env.NODE_ENV ?? 'development',
  });
}
