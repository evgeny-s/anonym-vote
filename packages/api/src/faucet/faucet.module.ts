import { Module } from '@nestjs/common';
import { FaucetConfig } from '../config/faucet.config';
import { FaucetController } from './faucet.controller';
import { FaucetService } from './faucet.service';
import { IndexerService } from './indexer.service';
import { SubtensorService } from './subtensor.service';

@Module({
  controllers: [FaucetController],
  providers: [FaucetConfig, SubtensorService, FaucetService, IndexerService],
  exports: [FaucetConfig],
})
export class FaucetModule {}
