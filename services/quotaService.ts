/**
 * Quota tracking service for API usage monitoring
 */

export interface QuotaConfig {
  modelName: string;
  dailyLimit: number; // tokens per day
  currentDay?: string; // YYYY-MM-DD
  usedToday: number;
  categories: {
    input: number;
    output: number;
  };
}

const STORAGE_KEY = 'GEMINI_QUOTA_CONFIG';
const QUOTA_UPDATED_EVENT = 'voicescribe:gemini-quota-updated';

export const DEFAULT_QUOTA_CONFIG: Omit<QuotaConfig, 'currentDay'> = {
  modelName: 'Gemini 2.5 Flash',
  dailyLimit: 1500, // default: 1500 requests or ~1M input tokens
  usedToday: 0,
  categories: { input: 0, output: 0 },
};

function emitQuotaUpdated(config: QuotaConfig) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<QuotaConfig>(QUOTA_UPDATED_EVENT, { detail: config }));
}

function persistQuotaConfig(config: QuotaConfig): QuotaConfig {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  emitQuotaUpdated(config);
  return config;
}

/**
 * Get current quota configuration from localStorage
 */
export function getQuotaConfig(): QuotaConfig | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const config = JSON.parse(stored);
    
    // Reset if day changed
    const today = new Date().toISOString().split('T')[0];
    if (config.currentDay !== today) {
      config.currentDay = today;
      config.usedToday = 0;
      config.categories = { input: 0, output: 0 };
      return persistQuotaConfig(config);
    }
    
    return config;
  } catch {
    return null;
  }
}

/**
 * Initialize or update quota configuration
 */
export function setQuotaConfig(config: Partial<QuotaConfig>): QuotaConfig {
  const existing = getQuotaConfig() || DEFAULT_QUOTA_CONFIG;

  const today = new Date().toISOString().split('T')[0];
  
  const updated: QuotaConfig = {
    ...existing,
    ...config,
    currentDay: today,
  };

  return persistQuotaConfig(updated);
}

/**
 * Update quota after API usage
 * @param inputTokens Number of input tokens used
 * @param outputTokens Number of output tokens used
 */
export function updateQuotaUsage(inputTokens: number, outputTokens: number): QuotaConfig {
  const config = getQuotaConfig();
  if (!config) return setQuotaConfig({});

  const safeInput = Math.max(0, Math.floor(inputTokens));
  const safeOutput = Math.max(0, Math.floor(outputTokens));
  const totalUsed = safeInput + safeOutput;
  
  config.usedToday += totalUsed;
  config.categories.input += safeInput;
  config.categories.output += safeOutput;

  return persistQuotaConfig(config);
}

/**
 * Subscribe to quota updates from this tab.
 */
export function subscribeToQuotaUpdates(listener: (config: QuotaConfig) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const custom = event as CustomEvent<QuotaConfig>;
    if (custom.detail) listener(custom.detail);
  };

  window.addEventListener(QUOTA_UPDATED_EVENT, handler);
  return () => window.removeEventListener(QUOTA_UPDATED_EVENT, handler);
}

/**
 * Get quota usage percentage
 */
export function getQuotaPercentage(configArg?: QuotaConfig | null): number {
  const config = configArg || getQuotaConfig();
  if (!config) return 0;
  return Math.min(100, (config.usedToday / config.dailyLimit) * 100);
}

/**
 * Get remaining quota
 */
export function getRemainingQuota(configArg?: QuotaConfig | null): number {
  const config = configArg || getQuotaConfig();
  if (!config) return 0;
  return Math.max(0, config.dailyLimit - config.usedToday);
}

/**
 * Format quota info for display
 */
export function formatQuotaInfo(config: QuotaConfig): string {
  return `${config.usedToday} / ${config.dailyLimit} tokens`;
}

/**
 * Get quota warning message
 */
export function getQuotaWarning(config: QuotaConfig): string | null {
  const percentage = (config.usedToday / config.dailyLimit) * 100;
  
  if (percentage >= 100) {
    return 'Daily quota exceeded!';
  }
  if (percentage >= 90) {
    return 'Warning: 90% of daily quota used';
  }
  if (percentage >= 75) {
    return 'Info: 75% of daily quota used';
  }
  
  return null;
}
