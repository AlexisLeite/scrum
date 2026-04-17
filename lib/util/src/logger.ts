export enum Level {
  PANIC = 1,
  ERROR = 2,
  WARNING = 3,
  NOTICE = 4,
  PHASE = 5,
  TRACE = 6,
  DEBUG = 7,
}

export function levelFromValue(value: number): Level {
  switch (value) {
    case 1:
      return Level.PANIC;
    case 2:
      return Level.ERROR;
    case 3:
      return Level.WARNING;
    case 4:
      return Level.NOTICE;
    case 5:
      return Level.PHASE;
    case 6:
      return Level.TRACE;
    case 7:
      return Level.DEBUG;
    default:
      throw new Error(`Cannot get Level from value: ${value}`);
  }
}

export function levelFromString(value: string): Level {
  switch (value.toUpperCase()) {
    case "PANIC":
      return Level.PANIC;
    case "ERROR":
      return Level.ERROR;
    case "WARNING":
      return Level.WARNING;
    case "NOTICE":
      return Level.NOTICE;
    case "PHASE":
      return Level.PHASE;
    case "TRACE":
      return Level.TRACE;
    case "DEBUG":
      return Level.DEBUG;
    default:
      throw new Error(`Cannot get Level from string: ${value}`);
  }
}

export interface ILogger {
  panic(message: string, additionalData?: unknown): void;
  error(message: string, additionalData?: unknown): void;
  warning(message: string, additionalData?: unknown): void;
  notice(message: string, additionalData?: unknown): void;
  phase(message: string, additionalData?: unknown): void;
  trace(message: string, additionalData?: unknown): void;
  debug(message: string, additionalData?: unknown): void;
  log(message: string): void;
  log(level: Level, message: string, additionalData?: unknown): void;
  log(throwable: Error): void;
  log(level: Level, throwable: Error, additionalData?: unknown): void;
}
