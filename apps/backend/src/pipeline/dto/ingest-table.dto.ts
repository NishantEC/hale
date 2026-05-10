import { IsArray, IsString } from 'class-validator';

// Generic store-and-forward payload from the mobile app's outbound_queue
// drainer. The drainer batches rows for one table at a time and POSTs them
// here; the service routes by tableName. Intentionally untyped `rows` —
// the inner shape depends on the table and is validated by the per-table
// handler in PipelineService.ingestTable().
export class IngestTableDto {
  @IsString()
  tableName: string;

  @IsArray()
  rows: Array<Record<string, unknown>>;
}
