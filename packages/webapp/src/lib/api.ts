import { TokenDeployment, DeploymentsResponse, DeploymentsQuery } from '@feydar/shared/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Log API URL to help with debugging (only in browser, not during SSR)
if (typeof window !== 'undefined') {
  console.log('[API] Using API_URL:', API_URL);
  if (!process.env.NEXT_PUBLIC_API_URL) {
    console.warn('[API] WARNING: NEXT_PUBLIC_API_URL is not set! Using default:', API_URL);
  }
}

export async function fetchDeployments(
  query: DeploymentsQuery = {}
): Promise<DeploymentsResponse> {
  const params = new URLSearchParams();
  if (query.page) params.append('page', query.page.toString());
  if (query.pageSize) params.append('pageSize', query.pageSize.toString());
  if (query.deployer) params.append('deployer', query.deployer);
  if (query.search) params.append('search', query.search);

  const url = `${API_URL}/token?${params.toString()}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`API Error (${response.status}):`, errorText);
      throw new Error(`Failed to fetch deployments: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } catch (error: any) {
    console.error('Fetch error:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to API at ${API_URL}. Please check NEXT_PUBLIC_API_URL environment variable.`);
    }
    throw error;
  }
}

export async function fetchLatestDeployments(limit: number = 20): Promise<{
  deployments: TokenDeployment[];
}> {
  const response = await fetch(`${API_URL}/token/latest?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch latest deployments');
  }
  return response.json();
}

export async function fetchDeploymentByAddress(
  address: string
): Promise<TokenDeployment> {
  const url = `${API_URL}/token/${address}`;
  console.log('[fetchDeploymentByAddress] Fetching from:', url);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[fetchDeploymentByAddress] API Error (${response.status}):`, errorText);
    console.error(`[fetchDeploymentByAddress] Requested address:`, address);
    console.error(`[fetchDeploymentByAddress] API URL:`, API_URL);
    throw new Error(`Failed to fetch deployment: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get adjacent tokens for navigation
 * Uses API endpoint that finds tokens based on createdAt timestamp
 * Returns older (deployed before) and newer (deployed after) tokens
 */
export async function getAdjacentTokens(
  currentAddress: string
): Promise<{ older: TokenDeployment | null; newer: TokenDeployment | null }> {
  try {
    const response = await fetch(`${API_URL}/token/${currentAddress}/adjacent`);
    if (!response.ok) {
      if (response.status === 404) {
        console.warn('[getAdjacentTokens] Token not found:', currentAddress);
      } else {
        console.error('[getAdjacentTokens] API response not ok:', response.status, response.statusText);
      }
      return { older: null, newer: null };
    }
    
    const data = await response.json();
    
    console.log('[getAdjacentTokens] Found adjacent tokens:', {
      older: data.older?.symbol || null,
      newer: data.newer?.symbol || null,
    });
    
    return {
      older: data.older || null,
      newer: data.newer || null,
    };
  } catch (error) {
    console.error('[getAdjacentTokens] Error fetching adjacent tokens:', error);
    return { older: null, newer: null };
  }
}

