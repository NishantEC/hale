import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './journal-entry.entity.js';
import { JournalService } from './journal.service.js';
import { JournalController } from './journal.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry])],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [TypeOrmModule, JournalService],
})
export class JournalModule {}
