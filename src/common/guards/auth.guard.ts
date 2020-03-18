import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { UserState } from '../../user/user.entity';
import { WsException } from '@nestjs/websockets';
import { Code } from '../../common/error';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client = context.switchToWs().getClient();
    const pass = !!client.user && client.user.state === UserState.NORMAL;
    if (!pass) {
      throw new WsException(Code.AUTH_UNAUTHORIZED);
    }
    return pass;
  }
}
