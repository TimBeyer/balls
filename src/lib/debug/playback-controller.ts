import type { ReplayData } from '../simulation'

export interface PlaybackResult {
  progress: number
  shouldProcessEvents: boolean
  consumeOneEvent: boolean
  /** When set, consume events until one involves this ball ID */
  consumeUntilBallId: string | null
  stepBack: boolean
}

export class PlaybackController {
  private _paused = false
  private _frozenProgress = 0
  private _stepRequested = false
  private _stepBackRequested = false
  private _stepToBallEventId: string | null = null
  private _justUnpaused = false

  get paused(): boolean {
    return this._paused
  }

  get frozenProgress(): number {
    return this._frozenProgress
  }

  set frozenProgress(value: number) {
    this._frozenProgress = value
  }

  reset(): void {
    this._paused = false
    this._frozenProgress = 0
    this._stepRequested = false
    this._stepBackRequested = false
    this._stepToBallEventId = null
    this._justUnpaused = false
  }

  togglePause(currentProgress: number): void {
    if (this._paused) {
      // Unpausing — signal resolveProgress to return frozenProgress once
      // so the animation loop can adjust its start time
      this._justUnpaused = true
    } else {
      this._frozenProgress = currentProgress
    }
    this._paused = !this._paused
  }

  requestStep(): void {
    if (this._paused) {
      this._stepRequested = true
    }
  }

  requestStepBack(): void {
    if (this._paused) {
      this._stepBackRequested = true
    }
  }

  requestStepToBallEvent(ballId: string): void {
    if (this._paused) {
      this._stepToBallEventId = ballId
    }
  }

  resolveProgress(realProgress: number, nextEvent: ReplayData | undefined): PlaybackResult {
    if (!this._paused) {
      if (this._justUnpaused) {
        // Return frozenProgress so the animation loop detects the mismatch
        // with realProgress and adjusts its start time accordingly
        this._justUnpaused = false
        return { progress: this._frozenProgress, shouldProcessEvents: true, consumeOneEvent: false, consumeUntilBallId: null, stepBack: false }
      }
      return { progress: realProgress, shouldProcessEvents: true, consumeOneEvent: false, consumeUntilBallId: null, stepBack: false }
    }

    if (this._stepBackRequested) {
      this._stepBackRequested = false
      return { progress: this._frozenProgress, shouldProcessEvents: false, consumeOneEvent: false, consumeUntilBallId: null, stepBack: true }
    }

    if (this._stepToBallEventId) {
      const ballId = this._stepToBallEventId
      this._stepToBallEventId = null
      if (nextEvent) {
        // Signal the animation loop to consume events until one involves this ball
        return { progress: Infinity, shouldProcessEvents: true, consumeOneEvent: false, consumeUntilBallId: ballId, stepBack: false }
      }
    }

    if (this._stepRequested) {
      this._stepRequested = false
      if (nextEvent) {
        this._frozenProgress = nextEvent.time
        return { progress: this._frozenProgress, shouldProcessEvents: true, consumeOneEvent: true, consumeUntilBallId: null, stepBack: false }
      }
    }

    return { progress: this._frozenProgress, shouldProcessEvents: false, consumeOneEvent: false, consumeUntilBallId: null, stepBack: false }
  }
}
