declare module '@grpc/proto-loader' {
  import type { ServiceDefinition, ProtobufTypeDefinition } from '@grpc/grpc-js';

  interface Options {
    keepCase?: boolean;
    longs?: StringConstructor | NumberConstructor;
    enums?: StringConstructor | NumberConstructor;
    bytes?: StringConstructor | NumberConstructor;
    defaults?: boolean;
    arrays?: boolean;
    objects?: boolean;
    oneofs?: boolean;
    json?: boolean;
    includeDirs?: string[];
  }

  interface PackageDefinition {
    [name: string]: ServiceDefinition | ProtobufTypeDefinition;
  }

  export function load(path: string, options?: Options): Promise<PackageDefinition>;
  export function loadSync(path: string, options?: Options): PackageDefinition;
}
