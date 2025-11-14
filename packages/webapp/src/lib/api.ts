import { TokenDeployment, DeploymentsResponse, DeploymentsQuery } from '@feydar/shared/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function fetchDeployments(
  query: DeploymentsQuery = {}
): Promise<DeploymentsResponse> {
  const params = new URLSearchParams();
  if (query.page) params.append('page', query.page.toString());
  if (query.pageSize) params.append('pageSize', query.pageSize.toString());
  if (query.deployer) params.append('deployer', query.deployer);
  if (query.search) params.append('search', query.search);

  const response = await fetch(`${API_URL}/api/deployments?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch deployments');
  }
  return response.json();
}

export async function fetchLatestDeployments(limit: number = 20): Promise<{
  deployments: TokenDeployment[];
}> {
  const response = await fetch(`${API_URL}/api/deployments/latest?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch latest deployments');
  }
  return response.json();
}

export async function fetchDeploymentByAddress(
  address: string
): Promise<TokenDeployment> {
  const response = await fetch(`${API_URL}/api/deployments/${address}`);
  if (!response.ok) {
    throw new Error('Failed to fetch deployment');
  }
  return response.json();
}

