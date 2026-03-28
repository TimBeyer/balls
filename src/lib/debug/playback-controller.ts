export type PlaybackAction =
  | { type: 'step' }
  | { type: 'stepBack' }
  | { type: 'stepToBall'; ballId: string }

export class PlaybackController {
  paused = false
  private _pendingAction: PlaybackAction | null = null

  reset(): void {
    this.paused = false
    this._pendingAction = null
  }

  togglePause(): void {
    this.paused = !this.paused
  }

  requestStep(): void {
    if (this.paused) this._pendingAction = { type: 'step' }
  }

  requestStepBack(): void {
    if (this.paused) this._pendingAction = { type: 'stepBack' }
  }

  requestStepToBallEvent(ballId: string): void {
    if (this.paused) this._pendingAction = { type: 'stepToBall', ballId }
  }

  consumeAction(): PlaybackAction | null {
    const action = this._pendingAction
    this._pendingAction = null
    return action
  }
}
