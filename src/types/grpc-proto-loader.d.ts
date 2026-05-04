declare module '@grpc/proto-loader' {
  interface Options {
    keepCase?: boolean;
    longs?: any;
    enums?: any;
    bytes?: any;
    defaults?: boolean;
    arrays?: boolean;
    objects?: boolean;
    oneofs?: boolean;
    json?: boolean;
    includeDirs?: string[];
  }

  interface PackageDefinition {
    [name: string]: any;
  }

  export function load(path: string, options?: Options): Promise<PackageDefinition>;
  export function loadSync(path: string, options?: Options): PackageDefinition;
}
