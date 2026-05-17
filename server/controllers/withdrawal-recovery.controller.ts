import type { Response } from 'express';

import { assertAuthenticated, type AuthRequest } from '../middleware/auth.middleware.ts';
import { recoverStuckWithdrawal } from '../services/withdrawal-recovery.service.ts';
import type { WithdrawalRecoveryRequest } from '../validation/request-schemas.ts';

export class WithdrawalRecoveryController {
  static async recover(req: AuthRequest, res: Response): Promise<void> {
    assertAuthenticated(req);
    const body = req.body as WithdrawalRecoveryRequest;
    const result = await recoverStuckWithdrawal({
      withdrawalId: req.params.withdrawalId ?? '',
      action: body.action,
      actorUserId: req.user.id,
    });

    res.json(result);
  }
}
