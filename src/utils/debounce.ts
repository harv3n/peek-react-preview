export class Debouncer {
  private timer: NodeJS.Timeout | undefined;

  schedule(delayMs: number, action: () => void): void {
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      action();
    }, delayMs);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.cancel();
  }
}
