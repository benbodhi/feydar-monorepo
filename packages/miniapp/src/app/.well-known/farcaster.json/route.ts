import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Serves the Farcaster miniapp manifest at /.well-known/farcaster.json
 * This route is required for Farcaster to discover and validate the miniapp.
 */
export async function GET() {
  try {
    const manifestPath = join(process.cwd(), 'public', 'farcaster.json');
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    
    return NextResponse.json(manifest, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error reading manifest:', error);
    return NextResponse.json(
      { error: 'Manifest not found' },
      { status: 404 }
    );
  }
}

