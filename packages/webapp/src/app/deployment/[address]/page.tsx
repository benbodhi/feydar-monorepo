'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchDeploymentByAddress } from '@/lib/api';
import { DeploymentCard } from '@/components/DeploymentCard';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function DeploymentPage() {
  const params = useParams();
  const address = params.address as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['deployment', address],
    queryFn: () => fetchDeploymentByAddress(address),
    enabled: !!address,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
        <p>Loading deployment...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link href="/">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
        <p className="text-destructive">Deployment not found.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/">
        <Button variant="ghost" size="sm" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Feed
        </Button>
      </Link>
      <DeploymentCard deployment={data} />
    </div>
  );
}

