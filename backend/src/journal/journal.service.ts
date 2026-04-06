import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { JournalEntry } from './journal-entry.entity.js';

@Injectable()
export class JournalService {
  constructor(
    @InjectRepository(JournalEntry)
    private repo: Repository<JournalEntry>,
  ) {}

  async create(userId: string, data: { factorTag: string; intensity: number; note?: string; timestamp?: string }): Promise<JournalEntry> {
    const entry = this.repo.create({
      userId,
      factorTag: data.factorTag,
      intensity: data.intensity,
      note: data.note ?? '',
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    });
    return this.repo.save(entry);
  }

  async findByDate(userId: string, date: string): Promise<JournalEntry[]> {
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    return this.repo.find({
      where: { userId, timestamp: Between(start, end) },
      order: { timestamp: 'DESC' },
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const result = await this.repo.delete({ id, userId });
    return (result.affected ?? 0) > 0;
  }
}
