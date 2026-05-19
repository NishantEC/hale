import { Module } from '@nestjs/common';
import { ComputeEngineClient } from './compute-engine-client.js';

@Module({
  providers: [ComputeEngineClient],
  exports: [ComputeEngineClient],
})
export class ComputeEngineModule {}
