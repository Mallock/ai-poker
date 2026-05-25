// A minimal AI driver that always folds. Used before LM Studio is wired and as the fallback
// for the "degraded mode" when LM Studio is unreachable.

export function createStubDriver() {
  return {
    async decide(view) {
      // If we can check for free, do that instead of folding.
      if (view.legalActions.canCheck) {
        return { action: 'check', amount: 0, say: null }
      }
      return { action: 'fold', amount: 0, say: null }
    },
    cancel() {},
  }
}
