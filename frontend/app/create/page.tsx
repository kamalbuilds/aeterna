'use client';

import { AgentCreationWizard } from '@/components/creation/agent-creation-wizard';
import { useRouter } from 'next/navigation';

export default function CreateAgentPage() {
  const router = useRouter();

  return (
    <AgentCreationWizard
      onClose={() => router.push('/')}
      onComplete={() => router.push('/dashboard')}
    />
  );
}