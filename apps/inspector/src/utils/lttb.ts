// Largest Triangle Three Buckets downsampling. Keeps the visual shape of
// a time-series intact while dropping point count for chart performance.
// Reference: Steinarsson, 2013. https://skemman.is/handle/1946/15343

export type LttbPoint = { x: number; y: number }

export function lttb<T extends LttbPoint>(data: T[], threshold: number): T[] {
  if (threshold >= data.length || threshold <= 2) return data

  const bucketSize = (data.length - 2) / (threshold - 2)
  const sampled: T[] = [data[0]]
  let a = 0

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor((i + 1) * bucketSize) + 1
    const rangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length)
    const avgRangeStart = Math.floor(i * bucketSize) + 1
    const avgRangeEnd = Math.floor((i + 1) * bucketSize) + 1
    const avgCount = Math.max(1, avgRangeEnd - avgRangeStart)

    let avgX = 0
    let avgY = 0
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += data[j].x
      avgY += data[j].y
    }
    avgX /= avgCount
    avgY /= avgCount

    let maxArea = -1
    let maxIdx = rangeStart
    const pointAX = data[a].x
    const pointAY = data[a].y
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area =
        Math.abs(
          (pointAX - avgX) * (data[j].y - pointAY) -
            (pointAX - data[j].x) * (avgY - pointAY),
        ) * 0.5
      if (area > maxArea) {
        maxArea = area
        maxIdx = j
      }
    }
    sampled.push(data[maxIdx])
    a = maxIdx
  }

  sampled.push(data[data.length - 1])
  return sampled
}
