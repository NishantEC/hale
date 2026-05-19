import { Skeleton } from "@/components/ui/skeleton"

export function HomeSkeleton() {
  return (
    <div className="space-y-8 max-w-6xl">
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>

      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-[180px] w-full rounded-lg" />
        <div className="grid grid-cols-4 gap-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center gap-0">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center">
              <Skeleton className="h-10 w-10 rounded-full" />
              {i < 3 && <Skeleton className="h-px w-16" />}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function SleepSkeleton() {
  return (
    <div className="space-y-10 max-w-6xl">
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      <div className="grid grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-[220px] w-full rounded-lg" />
      </div>

      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-[260px] w-full rounded-lg" />
        <div className="flex gap-8">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border p-5">
        <Skeleton className="h-[180px] w-full rounded-lg" />
      </div>

      <div className="grid grid-cols-2 gap-12">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="flex items-baseline justify-between py-1 border-b border-border/40">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PipelineSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-16 w-full rounded-xl" />

      <div className="space-y-6">
        <div className="rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-8">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex items-baseline justify-between py-1 border-b border-border/40">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function RawSkeleton() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4">
          <Skeleton className="h-9 w-72 rounded-md" />
        </div>
        <div className="border-t border-border">
          <div className="flex border-b border-border px-4 py-3 gap-4">
            {[14, 9, 10, 11, 12, 10, 9, 9, 16].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: `${w}%` }} />
            ))}
          </div>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center border-b border-border/50 px-4 gap-4" style={{ height: 40 }}>
              <Skeleton className="h-3 w-[14%]" />
              <Skeleton className="h-3 w-[9%]" />
              <Skeleton className="h-3 w-[10%]" />
              <Skeleton className="h-3 w-[11%]" />
              <Skeleton className="h-3 w-[12%]" />
              <Skeleton className="h-3 w-[10%]" />
              <Skeleton className="h-3 w-[9%]" />
              <Skeleton className="h-3 w-[9%]" />
              <Skeleton className="h-3 w-[16%]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TrendsSkeleton() {
  return (
    <div className="space-y-20">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>

      <div className="space-y-4">
        <Skeleton className="h-3 w-32" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function InsightsSkeleton() {
  return (
    <div className="space-y-10 max-w-6xl">
      <div className="rounded-xl border border-border p-5 space-y-3">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3 min-h-32">
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-8" />
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-2">
              <Skeleton className="h-3 w-20" />
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border p-5 space-y-3">
              <Skeleton className="h-3 w-20" />
              <div className="flex items-baseline gap-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-4 w-8" />
              </div>
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex border-b border-border px-4 py-3 gap-8">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-3 w-20" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center border-b border-border/50 px-4 py-3 gap-8">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TelemetrySkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-8">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border p-4 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="grid grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border p-4 space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-[140px] w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-1.5 w-1.5 rounded-full" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="border-b border-border px-5 py-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1 rounded-md" />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7 w-14 rounded-md" />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center border-b border-border/50 px-4 py-2.5 gap-6">
            <Skeleton className="h-4 w-12 rounded" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
