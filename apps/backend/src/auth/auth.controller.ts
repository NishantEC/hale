import { All, Controller, Req, Res } from '@nestjs/common';
import * as express from 'express';
import { auth } from './auth.js';
import { toNodeHandler } from 'better-auth/node';

const handler = toNodeHandler(auth);

@Controller('api/auth')
export class AuthController {
  @All('*path')
  async handleAuth(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    return handler(req, res);
  }
}
