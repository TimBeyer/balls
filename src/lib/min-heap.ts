/**
 * Array-backed binary min-heap for event scheduling.
 *
 * Replaces `bintrees` RBTree now that epoch-based invalidation removes the need
 * for arbitrary element removal. Only supports insert() and extractMin() —
 * the two operations needed by CollisionFinder.
 *
 * Performance advantage over RBTree:
 * - Array storage has much better cache locality than pointer-chasing tree nodes
 * - extractMin is O(log n) with smaller constant factors
 * - insert is O(log n) with smaller constant factors
 * - No per-node allocation overhead
 *
 * Elements are compared by `time` first, then `seq` as tiebreaker (same as
 * the old RBTree comparator). Unlike RBTree, duplicate keys are allowed, so
 * the `seq` tiebreaker is no longer strictly required for correctness — but
 * it preserves deterministic ordering for reproducibility.
 */
export class MinHeap<T extends { time: number; seq: number }> {
  private data: T[] = []

  get size(): number {
    return this.data.length
  }

  push(item: T): void {
    this.data.push(item)
    this.siftUp(this.data.length - 1)
  }

  peek(): T | undefined {
    return this.data[0]
  }

  pop(): T | undefined {
    const data = this.data
    const len = data.length
    if (len === 0) return undefined
    const top = data[0]
    if (len === 1) {
      data.length = 0
      return top
    }
    data[0] = data[len - 1]
    data.length = len - 1
    this.siftDown(0)
    return top
  }

  private siftUp(i: number): void {
    const data = this.data
    const item = data[i]
    while (i > 0) {
      const parentIdx = (i - 1) >> 1
      const parent = data[parentIdx]
      if (item.time < parent.time || (item.time === parent.time && item.seq < parent.seq)) {
        data[i] = parent
        i = parentIdx
      } else {
        break
      }
    }
    data[i] = item
  }

  private siftDown(i: number): void {
    const data = this.data
    const len = data.length
    const halfLen = len >> 1
    const item = data[i]
    while (i < halfLen) {
      let bestIdx = (i << 1) + 1
      let best = data[bestIdx]
      const rightIdx = bestIdx + 1
      if (rightIdx < len) {
        const right = data[rightIdx]
        if (right.time < best.time || (right.time === best.time && right.seq < best.seq)) {
          bestIdx = rightIdx
          best = right
        }
      }
      if (best.time < item.time || (best.time === item.time && best.seq < item.seq)) {
        data[i] = best
        i = bestIdx
      } else {
        break
      }
    }
    data[i] = item
  }
}
