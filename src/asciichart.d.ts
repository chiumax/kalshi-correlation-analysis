declare module "asciichart" {
  interface PlotConfig {
    height?: number;
    offset?: number;
    padding?: string;
    colors?: number[];
    min?: number;
    max?: number;
  }

  function plot(series: number[] | number[][], config?: PlotConfig): string;

  const green: number;
  const red: number;
  const blue: number;
  const yellow: number;
  const magenta: number;
  const cyan: number;
  const white: number;
  const gray: number;
  const darkgray: number;
  const lightgray: number;

  export = {
    plot,
    green,
    red,
    blue,
    yellow,
    magenta,
    cyan,
    white,
    gray,
    darkgray,
    lightgray,
  };
}
