import { Module } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Module({
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}
