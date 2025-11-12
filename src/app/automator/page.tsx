import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const AutomatorClientPage = dynamic(
  () => import('./page-client').then((mod) => mod.AutomatorClientPage),
  {
    ssr: false,
    loading: () => (
        <div className="p-4 md:p-8 space-y-8">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-32 w-full" />
        </div>
    ),
  }
)

export default function AutomatorPage() {
  return <AutomatorClientPage />;
}
