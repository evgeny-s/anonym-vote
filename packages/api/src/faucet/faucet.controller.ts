import { Body, Controller, Get, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DripRequestDto } from './drip-request.dto';
import { FaucetService } from './faucet.service';
import type { DripResponse, FaucetInfo, HealthStatus } from './faucet.service';

/**
 * Public HTTP surface of the v2 faucet.
 *
 *   POST /faucet/drip   — ring-sig-authenticated drip request
 *   GET  /faucet/info   — transparency (faucet address, ring status,
 *                         proposal metadata, remaining budget)
 *   GET  /faucet/health — solvency probe
 *
 * Rate limiting is managed by two named throttler buckets set up
 * in AppModule — `default` (cheap GETs) and `drip` (tight, for
 * the expensive POST). Each route opts out of the unrelated bucket
 * via @SkipThrottle so only the intended limit applies.
 *
 * Deployed behind a proxy? Set TRUST_PROXY=true so the guard's
 * IP-based tracker sees the real client IP rather than collapsing
 * every caller into the proxy address.
 */
@Controller('faucet')
export class FaucetController {
  constructor(private readonly faucet: FaucetService) {}

  @Post('drip')
  @SkipThrottle({ default: true })
  async drip(@Body() body: DripRequestDto): Promise<DripResponse> {
    return this.faucet.processDrip(body);
  }

  @Get('info')
  @SkipThrottle({ drip: true })
  info(): FaucetInfo {
    return this.faucet.getInfo();
  }

  /**
   * Uptime-monitor probe. Returns 200 + status JSON when the faucet
   * has enough balance to cover the whole senate; returns 503 (via
   * ServiceUnavailableException thrown inside the service) otherwise,
   * so external monitors (UptimeRobot etc.) alert on status-code.
   */
  @Get('health')
  @SkipThrottle({ drip: true })
  health(): Promise<HealthStatus> {
    return this.faucet.getHealth();
  }
}
