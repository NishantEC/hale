import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalEntry } from './journal-entry.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([JournalEntry])],
  exports: [TypeOrmModule],
})
export class JournalModule {}
