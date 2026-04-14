import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { FaucetConfig } from './config/faucet.config';
import { FaucetModule } from './faucet/faucet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Two named throttler buckets. Every route is covered by BOTH
    // by default; controllers opt out of the irrelevant one via
    // @SkipThrottle so each route is effectively in exactly one
    // bucket:
    //   - `default` → cheap GETs (/faucet/info, /faucet/health)
    //   - `drip`    → /faucet/drip, tighter because each request
    //                 drives WASM ring-sig verification + ring
    //                 reconstruction and spam is a CPU DoS primitive.
    ThrottlerModule.forRootAsync({
      imports: [FaucetModule],
      inject: [FaucetConfig],
      useFactory: (config: FaucetConfig) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.throttleDefaultTtlMs,
            limit: config.throttleDefaultLimit,
          },
          {
            name: 'drip',
            ttl: config.throttleDripTtlMs,
            limit: config.throttleDripLimit,
          },
        ],
      }),
    }),
    FaucetModule,
  ],
  controllers: [],
  providers: [
    // Global guard: every controller method is throttled by the
    // `default` bucket unless it declares a different one via
    // @Throttle(). Safer than per-controller wiring because a new
    // endpoint added later without a decorator is still covered.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
