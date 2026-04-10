import { Body, Controller, Get, Post } from '@nestjs/common';
import type { ProposalConfig } from '../config/faucet.config';
import { FundRequestDto } from './dto/fund-request.dto';
import { CredentialResponse, FaucetService } from './faucet.service';
import { IndexerService } from './indexer.service';
import type { IndexerSnapshot } from './indexer.service';

@Controller('faucet')
export class FaucetController {
  constructor(
    private readonly faucet: FaucetService,
    private readonly indexer: IndexerService,
  ) {}

  /** Public key the UI uses to verify on-chain credentials. */
  @Get('coord')
  getCoord(): { address: string } {
    return { address: this.faucet.getCoordAddress() };
  }

  /** Allowlist of SS58 addresses that may vote on the current proposal. */
  @Get('voters')
  getVoters(): { voters: string[] } {
    return { voters: this.faucet.getAllowedVoters() };
  }

  /** Active proposal definition (id, title, description, deadline, quorum, startBlock). */
  @Get('proposal')
  getProposal(): ProposalConfig {
    return this.faucet.getProposal();
  }

  /**
   * Fund the stealth address (if needed) and return a coordinator-signed
   * credential. The UI embeds this credential in the remark it publishes
   * from the stealth wallet.
   */
  @Post('fund')
  async fund(@Body() body: FundRequestDto): Promise<CredentialResponse> {
    return this.faucet.issueCredential(body);
  }

  /**
   * Indexed `system.remark` extrinsics from `[startBlock..head]`.
   *
   * The backend pre-fetches blocks in the background and serves them from
   * memory so the UI doesn't have to scan the chain itself. The response
   * also includes a `status` field — `indexing` if the catch-up is still
   * more than ~10 blocks behind head, `ready` otherwise.
   */
  @Get('votes')
  getVotes(): IndexerSnapshot {
    return this.indexer.getSnapshot();
  }
}
