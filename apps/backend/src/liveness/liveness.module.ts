import { Module } from '@nestjs/common';
import { LivenessController } from './liveness.controller.js';

@Module({
  controllers: [LivenessController],
})
export class LivenessModule {}
