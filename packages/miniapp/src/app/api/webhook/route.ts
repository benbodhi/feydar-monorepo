import { NextRequest, NextResponse } from 'next/server';

/**
 * Webhook proxy route for Farcaster miniapp events
 * Proxies requests to the API server's webhook endpoint
 * 
 * This allows the webhook URL to stay under the miniapp domain
 * while the actual webhook handling is done by the API server
 * 
 * Important: We forward the raw body text to preserve signature verification
 */
export async function POST(request: NextRequest) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  
  try {
    // Get the raw body text (needed for signature verification)
    const bodyText = await request.text();
    
    // Forward all headers that might be needed for verification
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Forward Farcaster-specific headers if present
    const farcasterHeaders = [
      'x-farcaster-signature',
      'x-farcaster-timestamp',
      'x-farcaster-hub-id',
    ];
    
    farcasterHeaders.forEach((headerName) => {
      const value = request.headers.get(headerName);
      if (value) {
        headers[headerName] = value;
      }
    });
    
    // Forward the request to the API server with raw body
    const response = await fetch(`${API_URL}/api/webhook`, {
      method: 'POST',
      headers,
      body: bodyText, // Forward raw body for signature verification
    });

    // Get the response from the API server
    const responseData = await response.json();
    
    // Return the same status and data
    return NextResponse.json(responseData, { status: response.status });
  } catch (error: any) {
    console.error('[Webhook Proxy] Error proxying webhook:', error);
    return NextResponse.json(
      { error: 'Failed to proxy webhook request', details: error.message },
      { status: 500 }
    );
  }
}

