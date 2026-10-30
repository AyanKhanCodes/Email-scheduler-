import { redisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { getHourWindow, getNextHourDate } from '../utils/time.js';

// Lua script for atomic hourly rate limiting
// KEYS[1] = email-rate:{senderId}:{hourWindow}
// ARGV[1] = limit (max emails allowed in window)
// ARGV[2] = expireSeconds (TTL for the key, e.g. 7200)
// Returns: [allowed (1 or 0), current count]
const HOURLY_LIMIT_LUA = `
local current = redis.call('GET', KEYS[1])
if current and tonumber(current) >= tonumber(ARGV[1]) then
  return { 0, tonumber(current) }
end
local newVal = redis.call('INCR', KEYS[1])
if newVal == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end
return { 1, newVal }
`;

// Lua script for distributed send spacing across workers
// KEYS[1] = sender-next-slot:{senderId}
// ARGV[1] = nowMs (current epoch ms)
// ARGV[2] = minDelayMs (spacing required between sends)
// ARGV[3] = ttlSeconds (e.g. 120s)
// Returns: waitMs (milliseconds to wait before sending to maintain spacing)
const SEND_SPACING_LUA = `
local now = tonumber(ARGV[1])
local delay = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local nextSlot = redis.call('GET', KEYS[1])

if not nextSlot or tonumber(nextSlot) <= now then
  local newSlot = now + delay
  redis.call('SET', KEYS[1], tostring(newSlot), 'EX', ttl)
  return 0
else
  local slotTime = tonumber(nextSlot)
  local waitTime = slotTime - now
  local newSlot = slotTime + delay
  redis.call('SET', KEYS[1], tostring(newSlot), 'EX', ttl)
  return waitTime
end
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  hourWindow: string;
  nextHourDate: Date;
}

export class RateLimiterService {
  /**
   * Determine effective hourly limit for a sender:
   * Math.min(sender.hourlyLimit, MAX_EMAILS_PER_HOUR_PER_SENDER)
   */
  static getEffectiveHourlyLimit(senderHourlyLimit?: number): number {
    const systemCeiling = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
    if (senderHourlyLimit && senderHourlyLimit > 0) {
      return Math.min(senderHourlyLimit, systemCeiling);
    }
    return systemCeiling;
  }

  /**
   * Determine effective min delay for an email send:
   * Math.max(MIN_DELAY_BETWEEN_EMAILS_MS, sender.minimumDelay, batchDelay)
   */
  static getEffectiveMinDelay(senderMinDelay?: number, batchDelay?: number): number {
    const systemFloor = env.MIN_DELAY_BETWEEN_EMAILS_MS;
    return Math.max(
      systemFloor,
      senderMinDelay || 0,
      batchDelay || 0
    );
  }

  /**
   * Atomically check and reserve an hourly sending slot for a sender in Redis.
   */
  static async checkAndReserveHourlySlot(
    senderId: string,
    senderHourlyLimit?: number,
    now: Date = new Date()
  ): Promise<RateLimitCheckResult> {
    const effectiveLimit = this.getEffectiveHourlyLimit(senderHourlyLimit);
    const hourWindow = getHourWindow(now);
    const redisKey = `email-rate:${senderId}:${hourWindow}`;
    const nextHourDate = getNextHourDate(now);

    const result = (await redisClient.eval(
      HOURLY_LIMIT_LUA,
      1,
      redisKey,
      effectiveLimit.toString(),
      '7200' // 2 hours TTL
    )) as [number, number];

    const allowed = result[0] === 1;
    const currentCount = result[1];

    return {
      allowed,
      currentCount,
      limit: effectiveLimit,
      hourWindow,
      nextHourDate,
    };
  }

  /**
   * Rollback a reservation if a send was aborted or critically failed.
   */
  static async rollbackHourlySlot(senderId: string, hourWindow: string): Promise<void> {
    const redisKey = `email-rate:${senderId}:${hourWindow}`;
    try {
      await redisClient.decr(redisKey);
    } catch (err: any) {
      console.warn(`[RateLimiter] Failed to rollback slot: ${err.message}`);
    }
  }

  /**
   * Coordinate distributed minimum send spacing across workers.
   * Returns milliseconds to wait.
   */
  static async reserveSendSpacingSlot(
    senderId: string,
    minDelayMs: number
  ): Promise<number> {
    const nowMs = Date.now();
    const redisKey = `sender-next-slot:${senderId}`;

    const waitMs = (await redisClient.eval(
      SEND_SPACING_LUA,
      1,
      redisKey,
      nowMs.toString(),
      minDelayMs.toString(),
      '120' // 2 minutes TTL
    )) as number;

    return Math.max(0, waitMs);
  }
}
