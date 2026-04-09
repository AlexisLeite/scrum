declare module "pdfmake/build/pdfmake" {
  import type * as pdfMake from "pdfmake";

  const value: typeof pdfMake;
  export default value;
}

declare module "pdfmake/build/vfs_fonts" {
  const value: Record<string, string>;
  export default value;
}
