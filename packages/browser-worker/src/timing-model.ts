export interface TimingConfig {
  minDelayMs: number;
  maxDelayMs: number;
  typingMinMs: number;
  typingMaxMs: number;
}

const DEFAULT_CONFIG: TimingConfig = {
  minDelayMs: 150,
  maxDelayMs: 800,
  typingMinMs: 30,
  typingMaxMs: 120,
};

function sampleUniform(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sampleActionDelay(config: TimingConfig = DEFAULT_CONFIG): number {
  return sampleUniform(config.minDelayMs, config.maxDelayMs);
}

export function sampleTypingDelay(config: TimingConfig = DEFAULT_CONFIG): number {
  return sampleUniform(config.typingMinMs, config.typingMaxMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function humanDelay(config?: TimingConfig): Promise<void> {
  await sleep(sampleActionDelay(config));
}
