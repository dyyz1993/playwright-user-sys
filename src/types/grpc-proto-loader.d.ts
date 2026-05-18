declare module '@grpc/proto-loader' {
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
    // gRPC dynamic package definition - properties determined by .proto file at runtime
    // Cannot replace `any` with `unknown`: @grpc/grpc-js loadPackageDefinition()
    // requires index type assignable to ServiceDefinition | ProtobufTypeDefinition
    // Safe: only used during gRPC service init, never exposed to business logic
    [name: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  export function load(path: string, options?: Options): Promise<PackageDefinition>;
  export function loadSync(path: string, options?: Options): PackageDefinition;
}
