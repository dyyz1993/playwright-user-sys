import {
  UserRow,
  SessionRow,
  MachineRow,
  CreditHistoryRow,
  OperationLogRow,
  WebhookEventRow,
  RequestLogRow,
} from './tables.js';

declare module 'knex/types/tables' {
  interface Tables {
    users: UserRow;
    sessions: SessionRow;
    machines: MachineRow;
    credit_history: CreditHistoryRow;
    operation_logs: OperationLogRow;
    webhook_events: WebhookEventRow;
    request_logs: RequestLogRow;
  }
}
