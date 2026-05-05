import { RouteGenericInterface } from 'fastify';

export interface IdParamRoute extends RouteGenericInterface {
  Params: { id: string };
}

export interface PaginationQueryRoute extends RouteGenericInterface {
  Querystring: {
    page?: string;
    limit?: string;
    sort?: string;
    order?: string;
    search?: string;
  };
}

export interface SessionListQueryRoute extends RouteGenericInterface {
  Querystring: {
    page?: string;
    limit?: string;
    status?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
    dateRange?: string;
    sort?: string;
    order?: string;
  };
}

export interface UserListQueryRoute extends RouteGenericInterface {
  Querystring: {
    page?: string;
    limit?: string;
    role?: string;
    status?: string;
    sort?: string;
    order?: string;
    search?: string;
  };
}

export interface AdminLoginBodyRoute extends RouteGenericInterface {
  Body: {
    username: string;
    password: string;
  };
}

export interface AddMachineBodyRoute extends RouteGenericInterface {
  Body: {
    hostname: string;
    ip: string;
    grpcPort?: number;
    proxyPort?: number;
    maxInstances?: number;
  };
}

export interface UpdateMachineBodyRoute extends RouteGenericInterface {
  Params: { id: string };
  Body: {
    hostname?: string;
    ip?: string;
    grpcPort?: number;
    proxyPort?: number;
    maxInstances?: number;
  };
}

export interface MachineIdArrayBodyRoute extends RouteGenericInterface {
  Body: {
    machineIds: string[];
  };
}

export interface BatchDeleteUsersBodyRoute extends RouteGenericInterface {
  Body: {
    userIds: number[];
  };
}

export interface BatchRechargeBodyRoute extends RouteGenericInterface {
  Body: {
    userIds: number[];
    credits: number;
    reason?: string;
  };
}

export interface SessionIdArrayBodyRoute extends RouteGenericInterface {
  Body: {
    sessionIds: string[];
  };
}

export interface SessionIdArrayOptionalBodyRoute extends RouteGenericInterface {
  Body: {
    sessionIds?: string[];
  };
}

export interface TestSessionBodyRoute extends RouteGenericInterface {
  Body: {
    count?: number;
    user_id?: number;
  };
}

export interface TestMachineBodyRoute extends RouteGenericInterface {
  Body: {
    count?: number;
  };
}

export interface CleanupOldMachinesBodyRoute extends RouteGenericInterface {
  Body: {
    daysThreshold?: number;
  };
}

export interface OperationLogQueryRoute extends RouteGenericInterface {
  Querystring: {
    page?: string;
    limit?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
    dateRange?: string;
  };
}

export interface OperationLogStatsQueryRoute extends RouteGenericInterface {
  Querystring: {
    dateRange?: string;
  };
}

export interface SessionStatsQueryRoute extends RouteGenericInterface {
  Querystring: {
    startDate?: string;
    endDate?: string;
    dateRange?: string;
  };
}

export interface UserStorageStatsQueryRoute extends RouteGenericInterface {
  Querystring: {
    userId?: number;
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: 'totalSize' | 'username' | 'sessionsSize' | 'sharedSize';
    sortOrder?: 'asc' | 'desc';
  };
}

export interface StorageCleanupBodyRoute extends RouteGenericInterface {
  Body: {
    userIds: number[];
    type: 'sessions' | 'shared' | 'all';
  };
}

export interface CleanupAllBodyRoute extends RouteGenericInterface {
  Body: {
    days?: number;
  };
}

export interface UserExportQueryRoute extends RouteGenericInterface {
  Querystring: {
    search?: string;
    role?: string;
    status?: string;
  };
}

export interface CreditsHistoryQueryRoute extends RouteGenericInterface {
  Querystring: {
    page?: string;
    limit?: string;
    dateRange?: string;
  };
}

export interface MachineFilterQueryRoute extends RouteGenericInterface {
  Querystring: {
    status?: string;
  };
}

export interface LogsQueryRoute extends RouteGenericInterface {
  Querystring: {
    page?: string;
    limit?: string;
    action?: string;
    dateRange?: string;
  };
}

export interface DebugVerifyTokenBodyRoute extends RouteGenericInterface {
  Body: {
    token?: string;
  };
}

export interface IdParamWithPaginationQueryRoute extends RouteGenericInterface {
  Params: { id: string };
  Querystring: {
    page?: string;
    limit?: string;
  };
}

export interface CleanupTempFilesQueryRoute extends RouteGenericInterface {
  Querystring: {
    hours?: string;
  };
}
