import type { ReplayData } from '../simulation'

export interface PlaybackResult {
  progress: number
  shouldProcessEvents: boolean
  consumeOneEvent: boolean
  stepBack: boolean
}

export class PlaybackController {
  private _paused = false
  private _frozenProgress = 0
  private _stepRequested = false
  private _stepBackRequested = false

  get paused(): boolean {
    return this._paused
  }

  get frozenProgress(): number {
    return this._frozenProgress
  }

  set frozenProgress(value: number) {
    this._frozenProgress = value
  }

  togglePause(currentProgress: number): void {
    this._paused = !this._paused
    if (this._paused) {
      this._frozenProgress = currentProgress
    }
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

  resolveProgress(realProgress: number, nextEvent: ReplayData | undefined): PlaybackResult {
    if (!this._paused) {
      return { progress: realProgress, shouldProcessEvents: true, consumeOneEvent: false, stepBack: false }
    }

    if (this._stepBackRequested) {
      this._stepBackRequested = false
      return { progress: this._frozenProgress, shouldProcessEvents: false, consumeOneEvent: false, stepBack: true }
    }

    if (this._stepRequested) {
      this._stepRequested = false
      if (nextEvent) {
        this._frozenProgress = nextEvent.time
        return { progress: this._frozenProgress, shouldProcessEvents: true, consumeOneEvent: true, stepBack: false }
      }
    }

    return { progress: this._frozenProgress, shouldProcessEvents: false, consumeOneEvent: false, stepBack: false }
  }
}
