declare module 'ejs' {
  interface Data {
    [key: string]: unknown;
  }
  interface Options {
    filename?: string;
    views?: string[];
    cache?: boolean;
    [key: string]: unknown;
  }
  function render(template: string, data?: Data, options?: Options): Promise<string>;
  function renderFile(path: string, data?: Data, options?: Options): Promise<string>;
  function compile(template: string, options?: Options): (data?: Data) => string;
}
