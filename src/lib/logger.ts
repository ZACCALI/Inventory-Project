/**
 * Structured logger for DistriTrack POS.
 * In production, logs are JSON-formatted for easier parsing.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = process.env.NODE_ENV === 'development';

function log(level: LogLevel, arg1: any, arg2?: any) {
  const timestamp = new Date().toISOString();
  let message = '';
  let data: any = undefined;

  if (typeof arg1 === 'string') {
    message = arg1;
    data = arg2;
  } else {
    data = arg1;
    message = typeof arg2 === 'string' ? arg2 : '';
  }

  if (isDev) {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${timestamp}] [${level.toUpperCase()}] ${message}`, data !== undefined ? data : '');
  } else {
    // Production: structured JSON logging
    const entry = { timestamp, level, message, ...(data !== undefined ? { data } : {}) };
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (arg1: any, arg2?: any) => log('debug', arg1, arg2),
  info: (arg1: any, arg2?: any) => log('info', arg1, arg2),
  warn: (arg1: any, arg2?: any) => log('warn', arg1, arg2),
  error: (arg1: any, arg2?: any) => log('error', arg1, arg2),
};

export default logger;
